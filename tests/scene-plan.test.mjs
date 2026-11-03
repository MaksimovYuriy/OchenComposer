import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const context=vm.createContext({});
vm.runInContext(ts.transpile(['core.ts','scene-plan.ts','semantics.ts','generated/assets.ts'].map(p=>readFileSync(p,'utf8')).join('\n')+'\nglobalThis.library=ASSETS;',{target:ts.ScriptTarget.ES2020}),context);
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
  mutate(p=>p.items[3].rotation=3),mutate(p=>p.items[3].x=.05),mutate(p=>p.items[1].x=p.items[0].x),
 ])assert.throws(()=>execute(recipe));
});
