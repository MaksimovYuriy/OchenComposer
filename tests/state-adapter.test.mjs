import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import {palettePrelude,paletteLibrary} from './palette-fixture.mjs';

function session(){
  let fail=false;
  let exportFailure=false,exported;
  let sequence=0;
  const events={};
  function node(type='FRAME',width=800,height=400){
    const data={};
    const n={id:String(++sequence),type,width,height,name:'Книга',children:[],parent:null,removed:false,
      fills:[],strokes:[],fillStyleId:'',strokeStyleId:'',isMask:false,
      async exportAsync(options){exported={options,node:this,children:this.children.map(child=>({name:child.name,matrix:JSON.stringify(child.relativeTransform),fills:JSON.stringify(child.fills)}))};if(exportFailure)throw new Error('Export failed');return '<svg/>';},
      relativeTransform:[[0,-1,250],[1,0,90]],opacity:.8,blendMode:'NORMAL',visible:true,locked:false,
      getPluginData:k=>data[k]||'',setPluginData:(k,v)=>data[k]=v,getPluginDataKeys:()=>Object.keys(data),
      insertChild(index,child){if(child.parent){const old=child.parent.children;old.splice(old.indexOf(child),1);}this.children.splice(index,0,child);child.parent=this;},
      appendChild(child){this.insertChild(this.children.length,child);},
      remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);this.removed=true;},
      rescale(scale){this.width*=scale;this.height*=scale;},
      on(event,callback){events[event]=callback;},off(event){delete events[event];},
      clone(){const copy=node(this.type,this.width,this.height);copy.relativeTransform=this.relativeTransform.map(row=>[...row]);copy.name=this.name;
        copy.fills=JSON.parse(JSON.stringify(this.fills));copy.strokes=JSON.parse(JSON.stringify(this.strokes));
        copy.opacity=this.opacity;copy.visible=this.visible;copy.locked=this.locked;copy.blendMode=this.blendMode;
        for(const key of Object.keys(data))copy.setPluginData(key,data[key]);
        for(const child of [...this.children])copy.appendChild(child.clone());
        this.parent.appendChild(copy);return copy;},
    };return n;
  }
  const page=node('PAGE'),frame=node('FRAME',1200,1000),other=node(),source=node('FRAME',400,200);
  page.appendChild(frame);frame.setPluginData('ochen-composition','1');frame.appendChild(other);frame.appendChild(source);
  source.setPluginData('ochen-asset-id','book');source.setPluginData('ochen-variant','large');source.setPluginData('ochen-role','main');source.setPluginData('ochen-state','main');
  const messages=[];
  const figma={showUI(){},on(){},currentPage:{...page,selection:[source]},ui:{postMessage:m=>messages.push(m)},
    createNodeFromSvg(){if(fail)throw new Error('Import failed');const root=node(),leaf=node('VECTOR');
      leaf.fills=[{type:'SOLID',color:{r:215/255,g:205/255,b:245/255},opacity:.7}];root.appendChild(leaf);return root;}};
  // Ensure ancestry and current-page identity match the real document tree.
  figma.currentPage=page;page.selection=[source];
  const asset={id:'book',name:'Книга',size:'large',width:800,height:400,svg:'<svg/>',source:'test'};
  const context=vm.createContext({figma,__html__:'',console,setTimeout,clearTimeout});
  vm.runInContext(palettePrelude,context);
  vm.runInContext(ts.transpile(readFileSync(new URL('../core.ts',import.meta.url),'utf8')+
    '\nconst ASSETS = '+JSON.stringify([{...asset,role:'main'},{...asset,role:'background'}])+';const BACKDROPS=[];\n'+
    readFileSync(new URL('../editor.ts',import.meta.url),'utf8')+'\n'+
    readFileSync(new URL('../export.ts',import.meta.url),'utf8')+'\n'+
    readFileSync(new URL('../code.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2020}),context);
  return {figma,frame,source,other,messages,node,events,failImport:()=>fail=true,failExport:()=>exportFailure=true,exported:()=>exported};
}

test('Export snapshots current transforms, colors and separate group names without modifying the scene',async()=>{
 const s=session();s.frame.name='My: scene';s.source.fills=[{type:'SOLID',color:{r:.2,g:.3,b:.4}}];
 const original=JSON.stringify(s.source.relativeTransform),names=s.frame.children.map(n=>n.name);
 await s.figma.ui.onmessage({type:'export-svg',sceneId:s.frame.id});
 const result=s.messages.find(m=>m.type==='svg-export');assert.ok(result);assert.equal(result.filename,'My_ scene.svg');
 assert.equal(result.width,1200);assert.equal(result.groups.length,1);assert.equal(result.groups[0].assetId,'book');
 assert.equal(s.exported().children[1].name,result.groups[0].id);assert.equal(s.exported().children[1].matrix,original);
 assert.equal(s.exported().children[1].fills,JSON.stringify(s.source.fills));
 assert.deepEqual(s.frame.children.map(n=>n.name),names);assert.equal(s.figma.currentPage.children.length,1);
 assert.equal(s.exported().node.removed,true);assert.equal(s.figma.currentPage.selection[0],s.source);
 assert.equal(s.exported().options.svgIdAttribute,true);assert.equal(s.exported().options.svgSimplifyStroke,false);
});

test('Export errors clean up snapshots and reject stale targets, raster fills and foreign geometry',async()=>{
 for(const kind of ['failure','stale','raster','foreign','hidden']){
  const s=session();if(kind==='failure')s.failExport();if(kind==='raster')s.source.fills=[{type:'IMAGE'}];
  if(kind==='foreign')s.frame.appendChild(s.node('RECTANGLE'));if(kind==='hidden')s.source.visible=false;
  await s.figma.ui.onmessage({type:'export-svg',sceneId:kind==='stale'?'wrong':s.frame.id});
  assert.ok(s.messages.some(m=>m.type==='error'),kind);assert.ok(!s.messages.some(m=>m.type==='svg-export'),kind);
  assert.equal(s.figma.currentPage.children.length,1,kind);assert.equal(s.source.removed,false);
 }
});

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

test('Non-right-angle matrices survive state replacement without a position or rotation reset',()=>{
  const s=session(),angle=8*Math.PI/180;
  s.source.relativeTransform=[[Math.cos(angle),-Math.sin(angle),123.45],[Math.sin(angle),Math.cos(angle),456.78]];
  const matrix=JSON.stringify(s.source.relativeTransform);
  for(const state of ['background','main']){
    s.figma.ui.onmessage({type:'set-state',state});
    assert.equal(JSON.stringify(s.figma.currentPage.selection[0].relativeTransform),matrix);
    assert.equal(s.frame.children.length,2);
  }
});

const command=(s,action,data={})=>s.figma.ui.onmessage({type:'edit',action,...data});
test('Move and absolute rotation keep the center, sizes, neighbors and generation provenance',()=>{
  const s=session();s.source.relativeTransform=[[1,0,300],[0,1,300]];
  s.frame.setPluginData('ochen-plan','immutable generation plan');
  const neighbor=JSON.stringify(s.other.relativeTransform);
  command(s,'move',{dx:10,dy:20});
  assert.equal(s.source.relativeTransform[0][2],310);assert.equal(s.source.relativeTransform[1][2],320);
  command(s,'rotate',{angle:30});
  const m=s.source.relativeTransform;
  assert.ok(Math.abs(m[0][0]*200+m[0][1]*100+m[0][2]-510)<.001);
  assert.ok(Math.abs(m[1][0]*200+m[1][1]*100+m[1][2]-420)<.001);
  assert.equal(s.source.width,400);assert.equal(s.source.height,200);
  assert.equal(JSON.stringify(s.other.relativeTransform),neighbor);
  assert.equal(s.frame.getPluginData('ochen-plan'),'immutable generation plan');
  assert.equal(JSON.parse(s.frame.getPluginData('ochen-current-scene')).items.length,1);
  assert.ok(!s.messages.some(m=>m.type==='error'));
});

test('Add and duplicate preserve scale/state and do not move existing instances; delete updates current composition',()=>{
  const s=session(),original=JSON.stringify(s.source.relativeTransform);
  command(s,'add',{name:'Книга',state:'background'});
  const added=s.figma.currentPage.selection[0];
  assert.equal(added.width,400);assert.equal(added.height,200);
  assert.equal(added.getPluginData('ochen-state'),'background');
  assert.equal(JSON.stringify(s.source.relativeTransform),original);
  command(s,'duplicate');
  const clone=s.figma.currentPage.selection[0];
  assert.notEqual(clone.id,added.id);assert.equal(clone.width,added.width);
  assert.equal(clone.getPluginData('ochen-state'),'background');
  assert.equal(clone.opacity,added.opacity);
  assert.notEqual(JSON.stringify(clone.relativeTransform),JSON.stringify(added.relativeTransform));
  assert.equal(JSON.parse(s.frame.getPluginData('ochen-current-scene')).items.length,3);
  command(s,'delete');
  assert.equal(clone.removed,true);assert.equal(s.source.removed,false);
  assert.equal(JSON.parse(s.frame.getPluginData('ochen-current-scene')).items.length,2);
  assert.ok(!s.messages.some(m=>m.type==='error'));
});

test('Layer commands reorder only subjects and never put them below the non-asset backdrop',()=>{
  const s=session(),peer=s.source.clone();
  s.figma.currentPage.selection=[peer];command(s,'lower');
  assert.equal(s.frame.children[0],s.other);assert.equal(s.frame.children[1],peer);
  command(s,'lower');assert.equal(s.frame.children[0],s.other);assert.equal(s.frame.children[1],peer);
  command(s,'raise');assert.equal(s.frame.children[2],peer);
  assert.ok(!s.messages.some(m=>m.type==='error'));
});

test('Bad moves, unknown inputs, scale mismatch and full canvases fail without geometry changes',()=>{
  const s=session();const before=JSON.stringify(s.source.relativeTransform),count=s.frame.children.length;
  command(s,'move',{dx:NaN,dy:0});command(s,'move',{dx:-1000,dy:0});command(s,'rotate',{angle:361});
  command(s,'add',{name:'Ракета',state:'main'});
  assert.equal(JSON.stringify(s.source.relativeTransform),before);assert.equal(s.frame.children.length,count);
  const peer=s.source.clone();peer.width=200;peer.height=100;
  command(s,'add',{name:'Книга',state:'main'});assert.equal(s.frame.children.length,count+1);
  peer.remove();s.frame.width=400;s.frame.height=200;
  command(s,'duplicate');assert.equal(s.frame.children.length,count);
  assert.equal(s.source.removed,false);
});

test('Native deletion refreshes scene metadata and clears stale controls using the current page event',async()=>{
  const s=session();s.figma.ui.onmessage({type:'catalog'});
  s.source.remove();s.figma.currentPage.selection=[];
  s.events.nodechange();
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(JSON.parse(s.frame.getPluginData('ochen-current-scene')).items.length,0);
  assert.equal(s.messages.at(-1).selected,null);
  assert.equal(s.messages.at(-1).scene,null);
});

test('Explicit limits and wrong selections reject edits, while an empty scene can use its saved basis',()=>{
  const s=session();
  for(let i=0;i<7;i++){const peer=s.source.clone();peer.setPluginData('ochen-role','support');}
  const count=s.frame.children.length;command(s,'duplicate');
  assert.equal(s.frame.children.length,count);
  s.figma.currentPage.selection=[s.other];command(s,'delete');assert.equal(s.other.removed,false);
  const empty=session();empty.frame.setPluginData('ochen-scene-scale','.5');empty.frame.setPluginData('ochen-detail','large');
  command(empty,'delete');command(empty,'add',{name:'Книга',state:'main'});
  assert.equal(empty.figma.currentPage.selection[0].width,400);
  assert.equal(JSON.parse(empty.frame.getPluginData('ochen-current-scene')).items.length,1);
});

test('Duplicate of a rotated subject keeps rotation, sizes and visibility',()=>{
  const s=session(),angle=8*Math.PI/180;
  s.source.relativeTransform=[[Math.cos(angle),-Math.sin(angle),300],[Math.sin(angle),Math.cos(angle),300]];
  s.source.visible=false;const original=s.source.relativeTransform.map(r=>[...r]);
  command(s,'duplicate');const clone=s.figma.currentPage.selection[0];
  assert.notEqual(clone,s.source);
  for(const row of [0,1])for(const col of [0,1])assert.ok(Math.abs(clone.relativeTransform[row][col]-original[row][col])<1e-12);
  assert.equal(clone.width,400);assert.equal(clone.height,200);assert.equal(clone.visible,false);
});

test('Palette application keeps geometry/layers and active colors survive state switches, add and duplicate',async()=>{
  const s=session(),leaf=s.node('VECTOR');
  leaf.fills=[{type:'SOLID',color:{r:249/255,g:163/255,b:170/255},opacity:.6}];s.source.appendChild(leaf);
  s.other.fills=[{type:'SOLID',color:{r:215/255,g:205/255,b:245/255}}];
  const matrix=JSON.stringify(s.source.relativeTransform),nodes=s.frame.children.map(n=>n.id).join(',');
  const orange=paletteLibrary.find(p=>p.id==='orange');
  await s.figma.ui.onmessage({type:'apply-palette',palette:orange});
  assert.equal(JSON.parse(s.frame.getPluginData('ochen-palette')).id,'orange');
  assert.ok(Math.abs(leaf.fills[0].color.r-128/255)<1e-12);
  assert.equal(leaf.fills[0].opacity,.6);
  assert.equal(JSON.stringify(s.source.relativeTransform),matrix);
  assert.equal(s.frame.children.map(n=>n.id).join(','),nodes);
  assert.ok(Math.abs(s.other.fills[0].color.r-253/255)<1e-12);
  for(const state of ['background','main']){
    await s.figma.ui.onmessage({type:'set-state',state});
    const node=s.figma.currentPage.selection[0];
    assert.equal(JSON.stringify(node.relativeTransform),matrix);
    assert.ok(Math.abs(node.children[0].fills[0].color.r-253/255)<1e-12);
  }
  await s.figma.ui.onmessage({type:'edit',action:'add',name:'Книга',state:'main'});
  const added=s.figma.currentPage.selection[0];
  assert.ok(Math.abs(added.children[0].fills[0].color.r-253/255)<1e-12);
  await s.figma.ui.onmessage({type:'edit',action:'duplicate'});
  const duplicate=s.figma.currentPage.selection[0];
  assert.notEqual(duplicate,added);
  assert.equal(JSON.stringify(duplicate.children[0].fills),JSON.stringify(added.children[0].fills));
  assert.ok(!s.messages.some(m=>m.type==='error'));
});
