import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

function panel() {
  const elements = Object.fromEntries(['compose','variant','query','format','size','template','seed','status','catalog','background-duplicate','state-main','state-background','selected-asset']
    .map(id=>[id,{value:'',dataset:{},disabled:false,checked:true}]));
  Object.assign(elements.query,{value:'Книга, телефон, монета'});
  elements.format.value='portrait';elements.size.value='small';elements.template.value='auto';elements.seed.value='0';
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
