import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {paletteLibrary} from './palette-fixture.mjs';

function panel() {
  const makeElement=()=>({value:'',dataset:{},style:{},disabled:false,checked:true,children:[],replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);}});
  const elements = Object.fromEntries(['compose','variant','query','format','size','template','seed','status','catalog','background-duplicate','state-main','state-background','selected-asset','state-mode','scene-name','add-name','add-state','add','move-left','move-right','move-up','move-down','edit-angle','rotate','duplicate','delete','raise','lower','tab-build','tab-edit','build-panel','edit-panel','tab-palette','palette-panel','choose-palette','palette-select','palette-swatches','palette-warnings','palette-target','palette-example','palette-file','apply-palette','build-palette-name','scene-palette-name']
    .concat(['tab-export','export-panel','export-target','export-svg','export-info','export-download']).map(id=>[id,makeElement()]));
  Object.assign(elements.query,{value:'Книга, телефон, монета'});
  elements.format.value='portrait';elements.size.value='small';elements.template.value='auto';elements.seed.value='0';
  elements['state-mode'].value='color';
  const messages=[];
  const window={};
  const context=vm.createContext({document:{getElementById:id=>elements[id],createElement:makeElement},window,parent:{postMessage:message=>messages.push(message.pluginMessage)}});
  const html=readFileSync(new URL('../ui.html',import.meta.url),'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  const receive=message=>window.onmessage({data:{pluginMessage:message}});
  receive({type:'catalog',names:['Книга','Телефон','Монета']});
  receive({type:'palettes',entries:paletteLibrary.map(p=>({key:'builtin:'+p.id,palette:p,warnings:[]}))});
  return {elements,messages,receive};
}

test('SVG export targets the selected composition and disables while preparing',()=>{
 const {elements,messages,receive}=panel();assert.equal(elements['export-svg'].disabled,true);
 receive({type:'asset-selection',selected:null,scene:{id:'scene-export',name:'Scene',count:2}});
 elements['export-svg'].onclick();assert.equal(messages.at(-1).type,'export-svg');assert.equal(messages.at(-1).sceneId,'scene-export');assert.equal(elements['export-svg'].disabled,true);
 receive({type:'busy',value:false});receive({type:'asset-selection',selected:null,scene:null});assert.equal(elements['export-svg'].disabled,true);
});

test('New variant increments seed; normal build reproduces it with the same query',()=>{
  const {elements,messages,receive}=panel();
  for(let i=1;i<=3;i++) {
    elements.variant.onclick();
    assert.equal(messages.at(-1).seed,i);
    assert.equal(messages.at(-1).text,'Книга, телефон, монета');
    assert.equal(messages.at(-1).format,'portrait');
    assert.equal(elements.compose.disabled,true);
    assert.equal(elements.variant.disabled,true);
    receive({type:'busy',value:false});
  }
  elements.compose.onclick();
  assert.equal(messages.at(-1).seed,3);
});

test('Invalid seed never sends a composition request; max seed wraps explicitly',()=>{
  const {elements,messages,receive}=panel();
  const initial=messages.length;
  for(const value of ['','-1','1.5','2147483648','NaN']) {
    elements.seed.value=value;elements.compose.onclick();
    assert.equal(messages.length,initial);
  }
  elements.seed.value='2147483647';elements.variant.onclick();
  assert.equal(messages.at(-1).seed,0);
  receive({type:'busy',value:false});
});

test('State controls follow the selected instance and never add a composition request',()=>{
  const {elements,messages,receive}=panel();
  assert.equal(elements['state-main'].disabled,true);
  receive({type:'asset-selection',selected:{name:'Книга',state:'main'}});
  assert.equal(elements['state-main'].disabled,true);
  assert.equal(elements['state-background'].disabled,false);
  elements['state-background'].onclick();
  assert.equal(messages.at(-1).type,'set-state');
  assert.equal(messages.at(-1).state,'background');
  receive({type:'busy',value:false});
  receive({type:'asset-selection',selected:null});
  assert.equal(elements['state-background'].disabled,true);
});

test('Editing tab sends bounded commands for the selected scene and clears after losing selection',()=>{
  const {elements,messages,receive}=panel();
  receive({type:'asset-selection',selected:{instanceId:'item-1',name:'Книга',state:'main',angle:8},scene:{name:'Сцена',count:3}});
  assert.equal(elements['edit-panel'].hidden,false);
  assert.equal(elements['edit-angle'].value,'8');
  elements['move-right'].onclick();
  assert.equal(messages.at(-1).action,'move');assert.equal(messages.at(-1).dx,10);
  receive({type:'busy',value:false});
  elements['edit-angle'].value='30';elements.rotate.onclick();assert.equal(messages.at(-1).angle,30);
  receive({type:'busy',value:false});
  elements['add-name'].value='Монета';elements['add-state'].value='background';elements['add-name'].oninput();
  assert.equal(elements.add.disabled,false);elements.add.onclick();assert.equal(messages.at(-1).name,'Монета');
  assert.equal(messages.at(-1).state,'background');
  receive({type:'busy',value:false});receive({type:'asset-selection',selected:null,scene:null});
  assert.equal(elements.add.disabled,true);assert.equal(elements.duplicate.disabled,true);
});

test('Palette chooser applies only on explicit request and is passed to new compositions',()=>{
  const {elements,messages,receive}=panel();
  const orange=paletteLibrary.find(p=>p.id==='orange');
  receive({type:'asset-selection',selected:null,scene:{id:'scene-1',name:'Сцена',count:3,palette:paletteLibrary[0]}});
  const before=messages.length;
  elements['palette-select'].value='builtin:orange';elements['palette-select'].onchange();
  assert.equal(messages.length,before,'choosing is not applying');
  assert.equal(elements['build-palette-name'].textContent,orange.name);
  elements['apply-palette'].onclick();
  assert.equal(messages.at(-1).type,'apply-palette');assert.equal(messages.at(-1).palette.id,'orange');
  receive({type:'busy',value:false});elements.compose.onclick();
  assert.equal(messages.at(-1).palette.id,'orange');
});

test('A palette saved only in the document is selectable after reopening',()=>{
  const {elements,messages}=panel();
  // A separate message is handled through the same document context as built-in options.
  const custom={...paletteLibrary[0],id:'doc-only',name:'Из другого документа'};
  const p=panel();p.receive({type:'asset-selection',selected:null,scene:{id:'doc',name:'Сцена',count:1,palette:custom}});
  assert.equal(p.elements['palette-select'].value,'document');
  p.elements['apply-palette'].onclick();assert.equal(p.messages.at(-1).palette.id,'doc-only');
  p.receive({type:'busy',value:false});
  p.receive({type:'palettes',entries:[...paletteLibrary.map(p=>({key:'builtin:'+p.id,palette:p})),{key:'custom:doc-only',palette:custom}]});
  assert.equal(p.elements['palette-select'].value,'custom:doc-only','Late personal-library load must preserve the document palette');
  assert.equal(elements['apply-palette'].disabled,true);assert.equal(messages.at(-1).type,'catalog');
});

test('Palette file loading handles size/JSON errors and sends a valid payload without applying it',async()=>{
  const {elements,messages,receive}=panel();
  const before=messages.length;
  elements['palette-file'].files=[{size:40000,async text(){return '{}';}}];await elements['palette-file'].onchange();
  assert.equal(messages.length,before);assert.equal(elements['status'].dataset.error,'true');
  elements['palette-file'].files=[{size:10,async text(){return '{broken';}}];await elements['palette-file'].onchange();
  assert.equal(messages.length,before);
  const palette={...paletteLibrary[0],id:'my-custom'};
  elements['palette-file'].files=[{size:500,async text(){return JSON.stringify(palette);}}];await elements['palette-file'].onchange();
  assert.equal(messages.at(-1).type,'import-palette');assert.equal(messages.at(-1).palette.id,'my-custom');
  receive({type:'palettes',entries:[...paletteLibrary.map(p=>({key:'builtin:'+p.id,palette:p})),{key:'custom:my-custom',palette}],selectedKey:'custom:my-custom'});
  assert.equal(elements['palette-select'].value,'custom:my-custom');
});
