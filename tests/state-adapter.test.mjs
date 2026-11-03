import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';

function session(){
  let fail=false;
  function node(type='FRAME',width=800,height=400){
    const data={};
    const n={type,width,height,name:'Книга',children:[],parent:null,removed:false,
      relativeTransform:[[0,-1,250],[1,0,90]],opacity:.8,blendMode:'NORMAL',visible:true,locked:false,
      getPluginData:k=>data[k]||'',setPluginData:(k,v)=>data[k]=v,getPluginDataKeys:()=>Object.keys(data),
      insertChild(index,child){if(child.parent){const old=child.parent.children;old.splice(old.indexOf(child),1);}this.children.splice(index,0,child);child.parent=this;},
      appendChild(child){this.insertChild(this.children.length,child);},
      remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);this.removed=true;},
      rescale(scale){this.width*=scale;this.height*=scale;},
    };return n;
  }
  const page=node('PAGE'),frame=node(),other=node(),source=node('FRAME',400,200);
  page.appendChild(frame);frame.setPluginData('ochen-composition','1');frame.appendChild(other);frame.appendChild(source);
  source.setPluginData('ochen-asset-id','book');source.setPluginData('ochen-variant','large');source.setPluginData('ochen-role','main');source.setPluginData('ochen-state','main');
  const messages=[];
  const figma={showUI(){},on(){},currentPage:{...page,selection:[source]},ui:{postMessage:m=>messages.push(m)},
    createNodeFromSvg(){if(fail)throw new Error('Import failed');return node();}};
  // Ensure ancestry and current-page identity match the real document tree.
  figma.currentPage=page;page.selection=[source];
  const asset={id:'book',name:'Книга',size:'large',width:800,height:400,svg:'<svg/>',source:'test'};
  const context=vm.createContext({figma,__html__:'',console});
  vm.runInContext(ts.transpile(readFileSync(new URL('../core.ts',import.meta.url),'utf8')+
    '\nconst ASSETS = '+JSON.stringify([{...asset,role:'main'},{...asset,role:'background'}])+';const BACKDROPS=[];\n'+
    readFileSync(new URL('../code.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2020}),context);
  return {figma,frame,source,other,messages,node,failImport:()=>fail=true};
}

test('State replacement preserves rotation/position, size, layer index and other instances through repeated switches',()=>{
  const s=session();const transform=JSON.stringify(s.source.relativeTransform);
  for(const state of ['background','main','background','main']){
    s.figma.ui.onmessage({type:'set-state',state});
    const selected=s.figma.currentPage.selection[0];
    assert.equal(s.frame.children.length,2);
    assert.equal(s.frame.children[0],s.other);
    assert.equal(s.frame.children[1],selected);
    assert.equal(selected.width,400);assert.equal(selected.height,200);
    assert.equal(JSON.stringify(selected.relativeTransform),transform);
    assert.equal(selected.getPluginData('ochen-state'),state);
    assert.equal(selected.opacity,.8);
    assert.equal(s.messages.filter(m=>m.type==='error').length,0);
  }
});

test('Failed import or distorted geometry leaves the original intact',()=>{
  for(const kind of ['import','geometry']){
    const s=session();if(kind==='import')s.failImport();else s.source.height=250;
    s.figma.ui.onmessage({type:'set-state',state:'background'});
    assert.equal(s.source.removed,false);assert.equal(s.frame.children.length,2);
    assert.equal(s.frame.children[1],s.source);
    assert.equal(s.messages.filter(m=>m.type==='error').length,1);
  }
});

test('Selecting a detail resolves its owning asset; unrelated nodes are rejected',()=>{
  const s=session();const detail=s.node('VECTOR');s.source.appendChild(detail);
  s.figma.currentPage.selection=[detail];s.figma.ui.onmessage({type:'set-state',state:'background'});
  assert.equal(s.frame.children[1].getPluginData('ochen-state'),'background');
  s.figma.currentPage.selection=[s.other];s.figma.ui.onmessage({type:'set-state',state:'main'});
  assert.equal(s.messages.at(-2).type,'busy');
  assert.ok(s.messages.some(m=>m.type==='error'));
});
