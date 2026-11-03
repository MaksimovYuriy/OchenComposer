import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
vm.runInContext(ts.transpile(readFileSync(new URL('../core.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2020 }), context);
const rotationPolicy = JSON.parse(readFileSync(new URL('../catalog/rotation-policy.json', import.meta.url), 'utf8'));
const names = ['book','wallet','lamp','coin','headphones','puzzle','folder','pen','phone','flowers'];
function bounds(p) {
 const w=p.asset.width*p.scale,h=p.asset.height*p.scale,m=p.transform;
 const corners=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>[m[0][0]*x+m[0][1]*y+m[0][2],m[1][0]*x+m[1][1]*y+m[1][2]]);
 const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
 return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
const assets = [
  { id: 'book', name: 'Книга', width: 1446, height: 977 },
  { id: 'phone', name: 'Телефон', width: 420, height: 800 },
  { id: 'wallet', name: 'Кошелек', width: 600, height: 350 },
];
test('Names: normalization, separators, aliases, explicit duplicates', () => {
  const result = context.resolveNames(' КНИГА ; смартфон\nкошелёк, книга', assets);
  assert.deepEqual(Array.from(result, a => a.id), ['book', 'phone', 'wallet', 'book']);
});
test('Unknown and ambiguous inputs fail before creating partial scenes', () => {
  assert.throws(() => context.resolveNames('книга, ракета', assets), /ракета/);
  assert.throws(() => context.resolveNames('книга', [assets[0], assets[0]]), /несколько совпадений/);
  assert.throws(() => context.resolveNames(' , ', assets), /Введите/);
  assert.throws(() => context.resolveNames(Array(9).fill('книга').join(','), assets), /8/);
});
test('Layouts keep 1–8 objects inside each canvas with uniform scales', () => {
  for (const [width, height] of [[1000, 1000], [1200, 630], [800, 1200]]) {
    for (let count = 1; count <= 8; count++) {
      const selected = Array.from({ length: count }, (_, i) => assets[i % assets.length]);
      const layout = context.composeScene(selected, [], false, width, height, 'auto', 0).placements;
      assert.equal(layout.length, count);
      for (const p of layout) {
        assert.ok(p.scale > 0);
        assert.ok(p.x >= 0 && p.y >= 0);
        assert.ok(p.x + p.asset.width * p.scale <= width);
        assert.ok(p.y + p.asset.height * p.scale <= height);
      }
      assert.equal(JSON.stringify(layout), JSON.stringify(context.composeScene(selected, [], false, width, height, 'auto', 0).placements));
    }
  }
});
test('Invalid geometry is rejected', () => {
  assert.throws(() => context.composeScene([], [], false, 1000, 1000, 'auto', 0));
  assert.throws(() => context.composeScene(assets, [], false, NaN, 1000, 'auto', 0));
  assert.throws(() => context.composeScene([{ ...assets[0], width: 0 }], [], false, 1000, 1000, 'auto', 0));
});

function realAssets(folder, role, size) {
  const directory = new URL(`../assets/${folder}/${size}/`, import.meta.url);
  return readdirSync(directory).filter(name => name.endsWith('.svg')).sort((a,b)=>a.localeCompare(b,'ru')).map((name,index) => {
    const svg = readFileSync(new URL(encodeURIComponent(name), directory), 'utf8');
    const box = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    return { id: names[index], name, size, role, svg, width: box[2], height: box[3], rotationAngles: rotationPolicy.angles[names[index]] };
  });
}

test('Square hero: all real variants, 1–8 objects, complete membership and no foreground collisions', () => {
  for (const size of ['large', 'small']) {
    const main = realAssets('mainground', 'main', size);
    const background = realAssets('background', 'background', size);
    for (let start = 0; start < main.length; start++) {
      for (let count = 1; count <= 8; count++) {
        const selected = Array.from({ length: count }, (_, i) => main[(start + i) % main.length]);
        const scene = context.composeScene(selected, background, true, 1000, 1000, 'diagonal', 0).placements;
        assert.equal(scene[0].role, 'background');
        assert.equal(scene[0].asset.id, selected[0].id);
        const foreground = scene.filter(p => p.role !== 'background');
        assert.deepEqual(Array.from(foreground, p => p.asset.id), selected.map(a => a.id));
        assert.equal(foreground[0].role, 'main');
        for (const [i, p] of foreground.entries()) {
          const b = bounds(p), w = b.width, h = b.height;
          assert.ok(b.x >= -.001 && b.y >= -.001 && b.x + w <= 1000.001 && b.y + h <= 1000.001);
          assert.ok(p.order > 0 && p.scale > 0);
          for (const q of foreground.slice(i + 1)) {
            const qb=bounds(q); const overlapW = Math.min(b.x + w, qb.x + qb.width) - Math.max(b.x, qb.x);
            const overlapH = Math.min(b.y + h, qb.y + qb.height) - Math.max(b.y, qb.y);
            assert.ok(overlapW <= .001 || overlapH <= .001, `Foreground collision: ${p.asset.name}, ${q.asset.name}`);
          }
        }
      }
    }
  }
});

test('Background is optional; duplicates remain explicit foreground instances', () => {
  const main = realAssets('mainground', 'main', 'large');
  const scene = context.composeScene([main[0], main[0]], [], false, 1000, 1000, 'diagonal', 0).placements;
  assert.equal(scene.length, 2);
  assert.equal(scene[0].asset, scene[1].asset);
  assert.ok(scene.every(p => p.role !== 'background'));
  assert.throws(() => context.composeScene([main[0]], [], true, 1000, 1000, 'diagonal', 0), /фоновый вариант/);
  assert.throws(() => context.composeScene([], [], false, 1000, 1000, 'diagonal', 0));
});

test('All templates preserve real foreground membership, bounds and separation in every format', () => {
  for (const size of ['large', 'small']) {
    const main = realAssets('mainground', 'main', size);
    const background = realAssets('background', 'background', size);
    for (const [width, height] of [[1000,1000],[1200,630],[800,1200]]) {
      for (const template of ['diagonal','focus','terrace','auto']) {
        for (const seed of [0,1,2,23,2147483647]) {
          for (let start = 0; start < main.length; start++) {
            for (let count = 1; count <= 8; count++) {
              const selected = Array.from({ length: count }, (_, i) => main[(start+i)%main.length]);
              const plan = context.composeScene(selected, background, true, width, height, template, seed);
              if(template!=='auto')assert.equal(plan.template,template,'An explicit style remains selected');
              const foreground = plan.placements.filter(p => p.role !== 'background');
              assert.equal(new Set(plan.placements.map(p=>p.scale)).size,1,'Every original and duplicate must use the same scene scale');
              assert.deepEqual(Array.from(foreground,p=>p.asset.id),selected.map(a=>a.id));
              assert.equal(foreground[0].role,'main');
              assert.equal(plan.placements[0].role,'background');
              for(const [i,p] of foreground.entries()) {
                const b=bounds(p),right=b.x+b.width,bottom=b.y+b.height;
                assert.ok(p.scale>0 && b.x>=-.001 && b.y>=-.001 && right<=width+.001 && bottom<=height+.001);
                for(const key of ['x','y','width','height'])assert.ok(Math.abs(b[key]-p.bounds[key])<.0001);
                for(const q of foreground.slice(i+1)) {
                  const qb=bounds(q); const dx=Math.min(right,qb.x+qb.width)-Math.max(b.x,qb.x);
                  const dy=Math.min(bottom,qb.y+qb.height)-Math.max(b.y,qb.y);
                  assert.ok(dx<=.001||dy<=.001,`${template} ${width}x${height} ${count} foreground collision`);
                }
              }
            }
          }
        }
      }
    }
  }
});

test('Seed reproduces the scene; next variants change the layout without changing objects', () => {
  const main=realAssets('mainground','main','large').slice(0,3);
  const make=(seed,template='auto')=>context.composeScene(main,[],false,1200,630,template,seed);
  assert.equal(JSON.stringify(make(17)),JSON.stringify(make(17)));
  assert.equal(new Set([0,1,2].map(seed=>JSON.stringify(make(seed).placements))).size,3,'Seed varies geometry; automatic template is selected by quality');
  for(const template of ['diagonal','focus','terrace'])assert.notEqual(JSON.stringify(make(0,template)),JSON.stringify(make(1,template)));
  for(const seed of [-1,NaN,1.5,2147483648])assert.throws(()=>make(seed));
  assert.throws(()=>make(0,'unknown'));
});

test('Quality search improves a varied acceptance corpus without changing the requested objects or scale ratios',()=>{
 let improved=0;
 for(const size of ['large','small']){
  const main=realAssets('mainground','main',size),background=realAssets('background','background',size);
  const sets=[['book'],['phone','puzzle'],['book','phone','coin'],['lamp','book','flowers'],['folder','wallet','coin'],['headphones','flowers'],['book','book','coin'],names.slice(0,6),names.slice(0,8)];
  for(const ids of sets)for(const [w,h] of [[1000,1000],[1200,630],[800,1200]])for(const mode of ['color','mixed','mono']){
   const selected=ids.map(id=>main.find(a=>a.id===id));
   const original=context.composeZonedScene(selected,background,true,w,h,'auto',0,mode);
   const result=context.composeScene(selected,background,true,w,h,'auto',0,mode);
   const baseline=context.compositionQuality(original,w,h);
   assert.ok(result.quality.score>=baseline.score-1e-8);
   if(result.quality.score>baseline.score+3)improved++;
   assert.equal(result.quality.version,'composition-v2');assert.ok(result.quality.candidates>1);
   assert.deepEqual(Array.from(result.placements.filter(p=>p.role!=='background'),p=>p.asset.id).sort(),[...ids].sort());
   assert.equal(new Set(result.placements.map(p=>p.scale)).size,1);
   for(const p of result.placements){const b=bounds(p);assert.ok(b.x>=-.001&&b.y>=-.001&&b.x+b.width<=w+.001&&b.y+b.height<=h+.001,'Including the background duplicate');}
   assert.ok(result.quality.balance<.25,'Avoid a visually stranded cluster');
  }
 }
 assert.ok(improved>100,'Improvement must cover many sets, not one demonstration');
});

test('Sparse mixed-size recipe becomes larger while keeping source objects unchanged',()=>{
 const main=realAssets('mainground','main','large'),background=realAssets('background','background','large');
 const selected=['lamp','book','flowers'].map(id=>main.find(a=>a.id===id));
 const original=JSON.stringify(selected);
 const old=context.composeZonedScene(selected,background,true,1000,1000,'auto',0);
 const result=context.composeScene(selected,background,true,1000,1000,'auto',0);
 assert.ok(result.placements[0].scale>old.placements[0].scale*1.15,'A narrow slot must no longer shrink the entire scene');
 assert.equal(JSON.stringify(selected),original);
 for(const p of result.placements)assert.ok([...selected,...background].includes(p.asset),'Reuse original sources');
});

test('State replacement preserves local size and rejects unknown proportions or mismatched variants',()=>{
  const source={...assets[0],size:'large'};
  const target={...source,role:'background'};
  assert.ok(Math.abs(context.stateReplacementScale(source,target,source.width*.4,source.height*.4)-.4)<1e-12);
  assert.throws(()=>context.stateReplacementScale(source,target,source.width*.4,source.height*.5),/растянут/);
  assert.throws(()=>context.stateReplacementScale(source,{...target,width:100},100,100));
  assert.throws(()=>context.stateReplacementScale(source,{...target,id:'other'},100,100));
});

test('Known recipes contain automatic rotations; upright objects stay upright; matrix preserves geometry',()=>{
  const main=realAssets('mainground','main','large');
  const selected=['book','phone','coin'].map(id=>main.find(a=>a.id===id));
  const plan=context.composeScene(selected,[],false,1000,1000,'diagonal',0);
  assert.ok(plan.placements.some(p=>p.rotation!==0),'Known default recipe must rotate automatically');
  for(const p of plan.placements){
    assert.ok(p.asset.rotationAngles.includes(p.rotation));
    const m=p.transform;
    assert.ok(Math.abs(m[0][0]*m[1][1]-m[0][1]*m[1][0]-1)<1e-12,'rotation cannot reflect or deform');
    assert.ok(Math.abs(Math.hypot(m[0][0],m[1][0])-1)<1e-12);
    const cx=m[0][0]*p.asset.width*p.scale/2+m[0][1]*p.asset.height*p.scale/2+m[0][2];
    assert.ok(Math.abs(cx-p.bounds.x-p.bounds.width/2)<.001);
  }
  for(const id of ['lamp','flowers'])for(let seed=0;seed<6;seed++){
    const p=context.composeScene([main.find(a=>a.id===id)],[],false,800,1200,'auto',seed).placements[0];
    assert.equal(p.rotation,0);
  }
});

test('State modes preserve explicit instances and put monochrome objects behind colored ones',()=>{
  for(const size of ['large','small']){
    const main=realAssets('mainground','main',size).slice(0,4), bg=realAssets('background','background',size);
    for(const mode of ['color','mixed','mono']){
      const scene=context.composeScene(main,bg,false,1200,630,'focus',5,mode).placements;
      assert.deepEqual(Array.from(scene,p=>p.asset.id).sort(),main.map(a=>a.id).sort());
      assert.equal(scene.length,main.length);
      if(mode==='color')assert.ok(scene.every(p=>p.asset.role==='main'));
      if(mode==='mono')assert.ok(scene.every(p=>p.asset.role==='background'));
      if(mode==='mixed'){
        assert.ok(scene.some(p=>p.asset.role==='main')&&scene.some(p=>p.asset.role==='background'));
        assert.equal(scene[0].asset.role,'background');
        assert.equal(scene.find(p=>p.role==='main').asset.id,main[0].id);
      }
    }
  }
  assert.throws(()=>context.composeScene(assets,[],false,1000,1000,'auto',0,'unknown'));
});
