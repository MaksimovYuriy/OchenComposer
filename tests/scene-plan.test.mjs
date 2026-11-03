import {readSource} from '../scripts/sources.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const context=vm.createContext({});
vm.runInContext(ts.transpile(['composition','scene','ai','generated/assets.ts'].map(p=>readSource(p)).join('\n')+'\nglobalThis.library=ASSETS;',{target:ts.ScriptTarget.ES2020}),context);
const example=JSON.parse(readFileSync('catalog/scene-plan.example.json','utf8'));
const assets=context.library;
const execute=(recipe,size='large',w=1000,h=1000,mode='color')=>context.composeAiScene(recipe,assets.filter(a=>a.role==='main'&&a.size===size),assets.filter(a=>a.role==='background'),w,h,0,mode);
test('Three books, phone on first and coin on second: exactly five original instances in L/S and every format',()=>{
 for(const size of ['large','small'])for(const [w,h] of [[1000,1000],[1200,630],[800,1200]])for(const mode of ['color','mixed','mono']){
  const result=execute(example,size,w,h,mode),p=result.placements;
  assert.deepEqual(Array.from(p,a=>a.asset.id),['book','book','book','phone','coin']);assert.equal(new Set(p.map(a=>a.scale)).size,1);
  assert.ok(p.every(a=>assets.includes(a.asset)));assert.deepEqual(Array.from(p,a=>a.order),[0,1,2,3,4]);
  const matrix=p[0].transform,x=p[0].asset.width*p[0].scale*.5,y=p[0].asset.height*p[0].scale*.4;
  assert.ok(Math.abs(p[3].bounds.x+p[3].bounds.width/2-(matrix[0][0]*x+matrix[0][1]*y+matrix[0][2]))<1e-5);
  for(const a of p){const b=a.bounds;assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=w+.001&&b.y+b.height<=h+.001);const m=a.transform;assert.ok(Math.abs(m[0][0]*m[1][1]-m[0][1]*m[1][0]-1)<1e-8);}
  for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){const x=p[a].bounds,y=p[b].bounds;assert.ok(x.x+x.width<=y.x||y.x+y.width<=x.x||x.y+x.height<=y.y||y.y+y.height<=x.y);}
 }
 assert.equal(JSON.stringify(execute(example)),JSON.stringify(execute(example)));
});
test('Bad references, duplicate IDs, layers, cycles, forbidden rotations and impossible supports reject before creating a scene',()=>{
 const mutate=fn=>{const recipe=structuredClone(example);fn(recipe);return recipe;};
 for(const recipe of [
  mutate(p=>p.items[3].on='absent'),mutate(p=>p.items[3].instanceId='i1'),mutate(p=>p.items[3].layer=0),
  mutate(p=>p.items[0].on='i4'),mutate(p=>p.items[0].assetId='coin'),mutate(p=>p.items[0].x=NaN),
  mutate(p=>p.items[3].rotation=181),mutate(p=>p.items[3].x=.05),
 ])assert.throws(()=>execute(recipe));
});

test('Guide example: two books tilted toward each other with a lamp between, in L/S and all formats',()=>{
 const guide=JSON.parse(readFileSync('catalog/ai-composition-rules.json','utf8'));
 const recipe=guide.examples[0].plan;
 for(const size of ['large','small'])for(const [w,h] of [[1000,1000],[1200,630],[800,1200]]){
  const result=execute(recipe,size,w,h);
  assert.deepEqual(Array.from(result.placements,p=>p.asset.id),['book','book','lamp']);
  const [left,right,middle]=result.placements.map(p=>({x:p.bounds.x+p.bounds.width/2,y:p.bounds.y+p.bounds.height/2}));
  assert.ok(left.x<middle.x&&middle.x<right.x);assert.ok(Math.abs(middle.x-(left.x+right.x)/2)<1e-5);
  assert.equal(result.placements[0].rotation,15);assert.equal(result.placements[1].rotation,-15);
  assert.equal(new Set(result.placements.map(p=>p.scale)).size,1);
 }
 const bad=structuredClone(recipe);bad.items[2].x=.93;
 assert.throws(()=>execute(bad),/between/,'Correct asset count must not hide wrong spatial intent');
 const badTilt=structuredClone(recipe);badTilt.items[0].rotation=-15;
 assert.throws(()=>execute(badTilt),/правило/);
});

test('Each named spatial rule is executable and rejects a contradictory plan',()=>{
 const i=(instanceId,x,y,rotation=0)=>({instanceId,assetId:'book',x,y,rotation,layer:Number(instanceId.slice(1))-1,on:null});
 const make=(a,b)=>({status:'ok',items:[a,b],explanation:'Test'});
 const a=i('i1',.25,.25,15),b=i('i2',.6,.6,-15);
 const placements=items=>items.map(p=>({rotation:p.rotation,bounds:{x:p.x*1000-10,y:p.y*1000-10,width:20,height:20}}));
 for(const [type,subject,target] of [['leftOf','i1','i2'],['rightOf','i2','i1'],['above','i1','i2'],['below','i2','i1'],['inFrontOf','i2','i1'],['behind','i1','i2'],['tiltedToward','i1','i2']]){
  const recipe={...make(a,b),relations:[{type,subject,targets:[target]}]};
  const checked=context.validateSemanticPlan(recipe);context.checkSceneRelations(checked,placements(checked.items),1000,1000);
  const bad=structuredClone(recipe);if(type==='tiltedToward')bad.items[0].rotation=-15;else bad.relations[0].subject=target,bad.relations[0].targets=[subject];
  assert.throws(()=>context.checkSceneRelations(context.validateSemanticPlan(bad),placements(bad.items),1000,1000),undefined,type);
 }
 for(const [type,point] of [['near',i('i2',.35,.35)],['alignedX',i('i2',.25,.6)],['alignedY',i('i2',.6,.25)]]){
  const recipe={...make(a,point),relations:[{type,subject:'i1',targets:['i2']}]};
  context.checkSceneRelations(context.validateSemanticPlan(recipe),placements(recipe.items),1000,1000);
  recipe.items[1]=i('i2',.85,.85);assert.throws(()=>context.checkSceneRelations(context.validateSemanticPlan(recipe),placements(recipe.items),1000,1000));
 }
});

test('Explicit rotations and per-instance monochrome states preserve source shape',()=>{
 const recipe={status:'ok',items:[{instanceId:'i1',assetId:'book',x:.5,y:.5,rotation:90,layer:0,on:null,state:'background'}],relations:[],explanation:'Test'};
 const p=execute(recipe).placements[0];assert.equal(p.rotation,90);assert.equal(p.asset.role,'background');
 assert.ok(Math.abs(p.transform[0][0])<1e-8);assert.ok(Math.abs(p.transform[0][1]+1)<1e-8);
 recipe.items[0].rotation=180;assert.equal(execute(recipe).placements[0].rotation,180);
 recipe.items[0].state='main';assert.equal(execute(recipe,'large',1000,1000,'mono').placements[0].asset.role,'background');
 const unknown={...recipe,relations:[{type:'mirror',subject:'i1',targets:['i2']}]};assert.throws(()=>execute(unknown));
});

test('Two books, phone on first and second near lamp: canonical rule plan is feasible',()=>{
 const recipe={status:'ok',items:[
  {instanceId:'i1',assetId:'book',x:.2,y:.5,rotation:0,layer:0,on:null},
  {instanceId:'i2',assetId:'book',x:.5,y:.5,rotation:0,layer:1,on:null},
  {instanceId:'i3',assetId:'phone',x:.5,y:.4,rotation:0,layer:2,on:'i1'},
  {instanceId:'i4',assetId:'lamp',x:.8,y:.5,rotation:0,layer:3,on:null}
 ],relations:[{type:'near',subject:'i2',targets:['i4']}],explanation:'Test'};
 for(const size of ['large','small'])for(const [w,h] of [[1000,1000],[1200,630],[800,1200]]){
  const result=execute(recipe,size,w,h);assert.deepEqual(Array.from(result.placements,p=>p.asset.id),['book','book','phone','lamp']);assert.equal(new Set(result.placements.map(p=>p.scale)).size,1);
 }
});

test('All thirteen additional rule types validate positive cases and reject contradictions',()=>{
 const p=(x,y,rotation=0,w=.1,h=.1)=>({x,y,rotation,w,h});
 const cases=[
  ['farFrom',[p(.15,.15),p(.8,.8)],[p(.15,.15),p(.3,.3)],['i2']],
  ['diagonalTo',[p(.2,.2),p(.6,.6)],[p(.2,.2),p(.6,.2)],['i2']],
  ['sameRotation',[p(.2,.2,15),p(.6,.6,15)],[p(.2,.2,15),p(.6,.6,90)],['i2']],
  ['oppositeRotation',[p(.2,.2,0),p(.6,.6,180)],[p(.2,.2,0),p(.6,.6,90)],['i2']],
  ['alignedLeft',[p(.25,.2,0,.1),p(.3,.6,0,.2)],[p(.25,.2),p(.6,.6)],['i2']],
  ['alignedRight',[p(.25,.2,0,.1),p(.2,.6,0,.2)],[p(.25,.2),p(.6,.6)],['i2']],
  ['alignedTop',[p(.2,.25,0,.1,.1),p(.6,.3,0,.1,.2)],[p(.2,.25),p(.6,.6)],['i2']],
  ['alignedBottom',[p(.2,.25,0,.1,.1),p(.6,.2,0,.1,.2)],[p(.2,.25),p(.6,.6)],['i2']],
  ['centeredX',[p(.5,.2)],[p(.7,.2)],[]],
  ['centeredY',[p(.2,.5)],[p(.2,.7)],[]],
  ['centered',[p(.5,.5)],[p(.8,.5)],[]],
  ['centeredBetween',[p(.5,.5),p(.2,.5),p(.8,.5)],[p(.3,.5),p(.2,.5),p(.8,.5)],['i2','i3']],
  ['equalDistance',[p(.5,.2),p(.2,.7),p(.8,.7)],[p(.3,.2),p(.2,.7),p(.8,.7)],['i2','i3']]
 ];
 for(const [type,good,bad,targets] of cases){
  const check=points=>{
   const recipe={status:'ok',items:points.map((p,index)=>({instanceId:'i'+(index+1),assetId:'book',x:p.x,y:p.y,rotation:p.rotation,layer:index,on:null})),relations:[{type,subject:'i1',targets}],explanation:'Test'};
   const placements=points.map(p=>({rotation:p.rotation,bounds:{x:(p.x-p.w/2)*1000,y:(p.y-p.h/2)*1000,width:p.w*1000,height:p.h*1000}}));
   context.checkSceneRelations(context.validateSemanticPlan(recipe),placements,1000,1000);
  };
  assert.doesNotThrow(()=>check(good),type);assert.throws(()=>check(bad),undefined,type);
 }
 assert.equal(vm.runInContext('Object.keys(SCENE_RELATION_TARGETS).length',context),24);
});

test('Local center and edge resolution translates support groups while preserving attachments and common scale',()=>{
 const recipe={status:'ok',items:[
  {instanceId:'i1',assetId:'book',x:.4,y:.25,rotation:0,layer:0,on:null},
  {instanceId:'i2',assetId:'phone',x:.7,y:.75,rotation:0,layer:1,on:null},
  {instanceId:'i3',assetId:'coin',x:.5,y:.4,rotation:0,layer:2,on:'i1'}
 ],relations:[{type:'centeredX',subject:'i1',targets:[]},{type:'alignedLeft',subject:'i2',targets:['i1']}],explanation:'Test'};
 for(const size of ['large','small'])for(const [w,h] of [[1000,1000],[1200,630],[800,1200]]){
  const result=execute(recipe,size,w,h),[book,phone,coin]=result.placements;
  assert.ok(Math.abs(book.bounds.x+book.bounds.width/2-w/2)<1e-5);
  assert.ok(Math.abs(book.bounds.x-phone.bounds.x)<1e-5);
  const m=book.transform,x=book.asset.width*book.scale*.5,y=book.asset.height*book.scale*.4;
  assert.ok(Math.abs(coin.bounds.x+coin.bounds.width/2-(m[0][0]*x+m[0][1]*y+m[0][2]))<1e-5);
  assert.equal(new Set(result.placements.map(p=>p.scale)).size,1);
 }
 const bad=structuredClone(recipe);bad.relations[0].targets=['i2'];assert.throws(()=>execute(bad),/длиной 0/);
});

test('Every built-in prompt example executes against real assets in L/S and all canvas formats',()=>{
 const guide=JSON.parse(readFileSync('catalog/ai-composition-rules.json','utf8'));
 for(const example of guide.examples)for(const size of ['large','small'])for(const [w,h] of [[1000,1000],[1200,630],[800,1200]])assert.doesNotThrow(()=>execute(example.plan,size,w,h),example.request+' '+size+' '+w+'x'+h);
});

test('Close AI centers no longer force tiny books; semantic rules and support proportions remain intact',()=>{
 const recipe={status:'ok',items:[
  {instanceId:'i1',assetId:'book',x:.48,y:.5,rotation:0,layer:0,on:null},
  {instanceId:'i2',assetId:'book',x:.52,y:.5,rotation:0,layer:1,on:null},
  {instanceId:'i3',assetId:'phone',x:.5,y:.4,rotation:0,layer:2,on:'i1'}
 ],relations:[{type:'near',subject:'i1',targets:['i2']}],explanation:'Test'};
 const scene=execute(recipe),[a,b,child]=scene.placements;
 assert.ok(a.scale>.25,'The whole scene must not be shrunk to fit a 40px gap');
 assert.equal(a.scale,b.scale);assert.equal(child.scale,a.scale);
 assert.ok(scene.quality.density>.2);assert.ok(scene.quality.candidates>1);
 assert.ok(Math.hypot((a.bounds.x+a.bounds.width/2-b.bounds.x-b.bounds.width/2)/1000,(a.bounds.y+a.bounds.height/2-b.bounds.y-b.bounds.height/2)/1000)<=.40);
 assert.equal(JSON.stringify(scene),JSON.stringify(execute(recipe)));
});

test('Free portrait compositions can reflow; explicit horizontal alignment remains authoritative',()=>{
 const recipe={status:'ok',items:[
  {instanceId:'i1',assetId:'book',x:.2,y:.5,rotation:0,layer:0,on:null},
  {instanceId:'i2',assetId:'book',x:.5,y:.5,rotation:0,layer:1,on:null},
  {instanceId:'i3',assetId:'book',x:.8,y:.5,rotation:0,layer:2,on:null}
 ],relations:[],explanation:'Test'};
 const free=execute(recipe,'large',800,1200);
 const row=execute({...recipe,relations:[{type:'alignedY',subject:'i1',targets:['i2']},{type:'alignedY',subject:'i2',targets:['i3']}]},'large',800,1200);
 assert.ok(free.quality.density>row.quality.density*1.3,'Use the portrait height when the scene does not require a row');
 for(const p of row.placements)assert.ok(Math.abs(p.bounds.y+p.bounds.height/2-(row.placements[0].bounds.y+row.placements[0].bounds.height/2))<=30);
});
