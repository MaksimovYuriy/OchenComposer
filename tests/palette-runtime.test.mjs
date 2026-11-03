import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {palettePrelude,paletteLibrary} from './palette-fixture.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
function runtime(stored={}){
  const messages=[],storage=copy(stored);
  const figma={mixed:Symbol('mixed'),ui:{postMessage:m=>messages.push(m)},clientStorage:{
    async getAsync(key){return copy(storage[key]??[]);},async setAsync(key,value){storage[key]=copy(value);},
  }};
  const c=vm.createContext({figma,console});vm.runInContext(palettePrelude,c);
  let sequence=0;
  function node(color){
    const data={};return {id:String(++sequence),name:'test',type:'VECTOR',isMask:false,removed:false,children:[],fillStyleId:'',strokeStyleId:'',
      fills:color?[{type:'SOLID',color:c.paletteRgb(color),opacity:.7}]:[],strokes:[],relativeTransform:[[1,0,12],[0,1,34]],width:100,height:80,
      getPluginData:key=>data[key]||'',setPluginData:(key,value)=>data[key]=value};
  }
  const root=node();root.type='FRAME';root.setPluginData('ochen-composition','1');
  const bg=node('#D7CDF5'),obj=node('#F9A3AA');obj.setPluginData('ochen-asset-id','book');obj.setPluginData('ochen-state','main');
  root.children=[bg,obj];
  return {c,figma,node,root,bg,obj,messages,storage};
}
const violet=paletteLibrary.find(p=>p.id==='violet'),orange=paletteLibrary.find(p=>p.id==='orange');

test('Validation is strict and does not let uploaded files grant object colors to backgrounds',()=>{
  const {c}=runtime();
  assert.equal(c.validatePalette(violet).colors.ink,'#181817');
  for(const bad of [null,[],{...violet,schemaVersion:2},{...violet,id:'../x'},
    {...violet,colors:{...violet.colors,ink:'red'}},{...violet,colors:{...violet.colors,ink:'#FFFFFF'}},
    {...violet,roles:{ink:{areas:['background']}}},{...violet,colors:{surface:'#D7CDF5'}}])assert.throws(()=>c.validatePalette(bad));
  assert.throws(()=>c.mapPalettePaints([{type:'SOLID',color:c.paletteRgb('#F9A3AA')}],c.validatePalette(orange),'background'),/недопустим/);
});

test('Repeated palettes use the saved original roles, preserve opacity, geometry and array ordering',()=>{
  const {c,root,bg,obj}=runtime(),before=JSON.stringify({matrix:obj.relativeTransform,width:obj.width,height:obj.height,ids:root.children.map(n=>n.id)});
  c.applyScenePalette(root,orange);
  assert.equal(JSON.stringify(obj.fills[0].color),JSON.stringify(c.paletteRgb('#80DADA')));
  assert.equal(JSON.stringify(bg.fills[0].color),JSON.stringify(c.paletteRgb('#FDD7B9')));
  c.applyScenePalette(root,violet);
  assert.equal(JSON.stringify(obj.fills[0].color),JSON.stringify(c.paletteRgb('#F9A3AA')));
  assert.equal(obj.fills[0].opacity,.7);
  assert.equal(JSON.stringify({matrix:obj.relativeTransform,width:obj.width,height:obj.height,ids:root.children.map(n=>n.id)}),before);
  c.applyScenePalette(root,orange);c.applyScenePalette(root,orange);
  assert.equal(JSON.stringify(obj.fills[0].color),JSON.stringify(c.paletteRgb('#80DADA')));
  c.applyScenePalette(root,paletteLibrary.find(p=>p.id==='turquoise'));
  assert.equal(JSON.stringify(obj.fills[0].color),JSON.stringify(c.paletteRgb('#6D7BFC')),'Original role must win over ambiguous intermediate HEX');
});

test('Whole-scene preflight rejects an unsupported later node without partially recoloring earlier nodes',()=>{
  const {c,root,bg,obj}=runtime();obj.fills=[{type:'IMAGE',imageHash:'unsupported',scaleMode:'FILL'}];
  const before=JSON.stringify(bg.fills);
  assert.throws(()=>c.applyScenePalette(root,orange),/IMAGE/);
  assert.equal(JSON.stringify(bg.fills),before);assert.equal(bg.getPluginData('ochen-color-baseline'),'');
  assert.equal(root.getPluginData('ochen-palette'),'');
});

test('Setter failure rolls back paints and newly written baseline metadata',()=>{
  const {c,root,bg,obj}=runtime();const before=JSON.stringify(bg.fills),original=JSON.stringify(obj.fills);
  let strokes=[],once=true;
  Object.defineProperty(obj,'strokes',{get:()=>strokes,set:value=>{if(once){once=false;throw new Error('Injected write failure');}strokes=value;}});
  assert.throws(()=>c.applyScenePalette(root,orange),/Injected/);
  assert.equal(JSON.stringify(bg.fills),before);assert.equal(JSON.stringify(obj.fills),original);
  assert.equal(bg.getPluginData('ochen-color-baseline'),'');assert.equal(root.getPluginData('ochen-palette'),'');
});

test('Gradients preserve stops, transparency and transforms; masks are not recolored',()=>{
  const {c,node}=runtime(),shape=node(),matrix=[[1,0,.2],[0,1,.3]];
  shape.fills=[{type:'GRADIENT_LINEAR',opacity:.5,gradientTransform:matrix,gradientStops:[
    {position:0,color:{...c.paletteRgb('#D7CDF5'),a:.2}},{position:1,color:{...c.paletteRgb('#7864D7'),a:.8}},
  ]}];
  const mask=node('#FFFFFF');mask.isMask=true;shape.children=[mask];
  c.recolorTree(shape,orange,'background');
  assert.equal(shape.fills[0].gradientStops[0].color.a,.2);assert.equal(shape.fills[0].gradientStops[1].position,1);
  assert.equal(JSON.stringify(shape.fills[0].gradientTransform),JSON.stringify(matrix));
  assert.equal(JSON.stringify(mask.fills[0].color),JSON.stringify(c.paletteRgb('#FFFFFF')));
  assert.equal(mask.getPluginData('ochen-color-baseline'),'');
});

test('Manual paint structure, style or variable changes are rejected explicitly',()=>{
  const {c,obj}=runtime();c.recolorTree(obj,orange,'object');
  obj.fills.push({type:'SOLID',color:c.paletteRgb('#FFFFFF')});assert.throws(()=>c.recolorTree(obj,violet,'object'),/структура/);
  obj.fills.pop();obj.fillStyleId='manual-style';assert.throws(()=>c.recolorTree(obj,violet,'object'),/стиль/);
  obj.fillStyleId='';obj.boundVariables={fills:[{id:'color-variable',type:'VARIABLE_ALIAS'}]};
  assert.throws(()=>c.recolorTree(obj,violet,'object'),/переменных/);
  assert.throws(()=>c.mapPalettePaints([{type:'SOLID',color:c.paletteRgb('#D7CDF5'),boundVariables:{color:{id:'x',type:'VARIABLE_ALIAS'}}}],orange,'object'),/переменных/);
});

test('An arbitrary fourth palette works via data; custom import persists without applying to the current scene',async()=>{
  const {c,root,storage,messages}=runtime();
  const custom={...copy(violet),id:'my-green',name:'Зелёная',colors:{...violet.colors,surface:'#CEEBD4',mid:'#90BF9A',deep:'#356F43'}};delete custom.source;
  const imported=await c.importPersonalPalette(custom),checked=imported.palette;
  assert.equal(imported.persisted,true);
  assert.equal(storage['ochen-personal-palettes-v1'][0].id,'my-green');
  assert.equal(root.getPluginData('ochen-palette'),'');
  assert.equal(messages.at(-1).selectedKey,'custom:my-green');
  c.applyScenePalette(root,checked);assert.equal(c.getScenePalette(root).id,'my-green');
  const reopened=runtime();reopened.root.setPluginData('ochen-palette',root.getPluginData('ochen-palette'));
  assert.equal(reopened.c.getScenePalette(reopened.root).colors.surface,'#CEEBD4');
  const personal=runtime(storage);await personal.c.loadPersonalPalettes();
  assert.equal(personal.c.requestedPalette('my-green').colors.surface,'#CEEBD4');
  await assert.rejects(c.importPersonalPalette(violet),/занят/);
});

test('Unavailable personal storage does not block using an imported palette in the document',async()=>{
  const {c,figma,root}=runtime();figma.clientStorage.setAsync=async()=>{throw new Error('Storage unavailable');};
  const imported=await c.importPersonalPalette({...copy(violet),id:'session-only'});
  assert.equal(imported.persisted,false);
  c.applyScenePalette(root,imported.palette);
  assert.equal(c.getScenePalette(root).id,'session-only');
});

test('Personal palette capacity is explicit; updating a personal id preserves existing scene snapshots',async()=>{
  const {c,root,storage}=runtime();
  for(let i=0;i<10;i++)await c.importPersonalPalette({...copy(violet),id:'custom-'+i});
  await assert.rejects(c.importPersonalPalette({...copy(violet),id:'one-too-many'}),/до 10/);
  c.applyScenePalette(root,c.requestedPalette('custom-0'));
  const original=root.getPluginData('ochen-palette');
  await c.importPersonalPalette({...copy(violet),id:'custom-0',version:2,colors:{...violet.colors,surface:'#D2E5DC'}});
  assert.equal(storage['ochen-personal-palettes-v1'].length,10);
  assert.equal(root.getPluginData('ochen-palette'),original);
  assert.equal(c.requestedPalette('custom-0').version,2);
});
