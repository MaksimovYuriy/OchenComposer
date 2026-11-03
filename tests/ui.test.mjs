import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

function panel() {
  const elements = Object.fromEntries(['compose','variant','query','format','size','template','seed','status','catalog','background-duplicate','state-main','state-background','selected-asset','state-mode','scene-name','add-name','add-state','add','move-left','move-right','move-up','move-down','edit-angle','rotate','duplicate','delete','raise','lower','tab-build','tab-edit','build-panel','edit-panel']
    .map(id=>[id,{value:'',dataset:{},disabled:false,checked:true}]));
  Object.assign(elements.query,{value:'Книга, телефон, монета'});
  elements.format.value='portrait';elements.size.value='small';elements.template.value='auto';elements.seed.value='0';
  elements['state-mode'].value='color';
  const messages=[];
  const window={};
  const context=vm.createContext({document:{getElementById:id=>elements[id]},window,parent:{postMessage:message=>messages.push(message.pluginMessage)}});
  const html=readFileSync(new URL('../ui.html',import.meta.url),'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  const receive=message=>window.onmessage({data:{pluginMessage:message}});
  receive({type:'catalog',names:['Книга','Телефон','Монета']});
  return {elements,messages,receive};
}

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
