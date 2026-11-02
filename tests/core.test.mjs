import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
vm.runInContext(ts.transpile(readFileSync(new URL('../core.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2020 }), context);
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
      const layout = context.layoutObjects(selected, width, height);
      assert.equal(layout.length, count);
      for (const p of layout) {
        assert.ok(p.scale > 0);
        assert.ok(p.x >= 0 && p.y >= 0);
        assert.ok(p.x + p.asset.width * p.scale <= width);
        assert.ok(p.y + p.asset.height * p.scale <= height);
      }
      assert.equal(JSON.stringify(layout), JSON.stringify(context.layoutObjects(selected, width, height)));
    }
  }
});
test('Invalid geometry is rejected', () => {
  assert.throws(() => context.layoutObjects([], 1000, 1000));
  assert.throws(() => context.layoutObjects(assets, NaN, 1000));
  assert.throws(() => context.layoutObjects([{ ...assets[0], width: 0 }], 1000, 1000));
});

function realAssets(folder, role, size) {
  const directory = new URL(`../assets/${folder}/${size}/`, import.meta.url);
  return readdirSync(directory).filter(name => name.endsWith('.svg')).map(name => {
    const svg = readFileSync(new URL(encodeURIComponent(name), directory), 'utf8');
    const box = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    return { id: name, name, size, role, svg, width: box[2], height: box[3] };
  });
}

test('Square hero: all real variants, 1–8 objects, complete membership and no foreground collisions', () => {
  for (const size of ['large', 'small']) {
    const main = realAssets('mainground', 'main', size);
    const background = realAssets('background', 'background', size);
    for (let start = 0; start < main.length; start++) {
      for (let count = 1; count <= 8; count++) {
        const selected = Array.from({ length: count }, (_, i) => main[(start + i) % main.length]);
        const scene = context.composeSquare(selected, background, true);
        assert.equal(scene[0].role, 'background');
        assert.equal(scene[0].asset.id, selected[0].id);
        const foreground = scene.filter(p => p.role !== 'background');
        assert.deepEqual(Array.from(foreground, p => p.asset.id), selected.map(a => a.id));
        assert.equal(foreground[0].role, 'main');
        for (const [i, p] of foreground.entries()) {
          const w = p.asset.width * p.scale, h = p.asset.height * p.scale;
          assert.ok(p.x >= 0 && p.y >= 0 && p.x + w <= 1000 && p.y + h <= 1000);
          assert.ok(p.order > 0 && p.scale > 0);
          for (const q of foreground.slice(i + 1)) {
            const overlapW = Math.min(p.x + w, q.x + q.asset.width * q.scale) - Math.max(p.x, q.x);
            const overlapH = Math.min(p.y + h, q.y + q.asset.height * q.scale) - Math.max(p.y, q.y);
            assert.ok(overlapW <= .001 || overlapH <= .001, `Foreground collision: ${p.asset.name}, ${q.asset.name}`);
          }
        }
      }
    }
  }
});

test('Background is optional; duplicates remain explicit foreground instances', () => {
  const main = realAssets('mainground', 'main', 'large');
  const scene = context.composeSquare([main[0], main[0]], [], false);
  assert.equal(scene.length, 2);
  assert.equal(scene[0].asset, scene[1].asset);
  assert.ok(scene.every(p => p.role !== 'background'));
  assert.throws(() => context.composeSquare([main[0]], [], true), /фоновый вариант/);
  assert.throws(() => context.composeSquare([], [], false));
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
              const foreground = plan.placements.filter(p => p.role !== 'background');
              assert.deepEqual(Array.from(foreground,p=>p.asset.id),selected.map(a=>a.id));
              assert.equal(foreground[0].role,'main');
              assert.equal(plan.placements[0].role,'background');
              for(const [i,p] of foreground.entries()) {
                const right=p.x+p.asset.width*p.scale,bottom=p.y+p.asset.height*p.scale;
                assert.ok(p.scale>0 && p.x>=0 && p.y>=0 && right<=width && bottom<=height);
                for(const q of foreground.slice(i+1)) {
                  const dx=Math.min(right,q.x+q.asset.width*q.scale)-Math.max(p.x,q.x);
                  const dy=Math.min(bottom,q.y+q.asset.height*q.scale)-Math.max(p.y,q.y);
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
  assert.equal(new Set([0,1,2].map(seed=>make(seed).template)).size,3);
  for(const template of ['diagonal','focus','terrace'])assert.notEqual(JSON.stringify(make(0,template)),JSON.stringify(make(1,template)));
  for(const seed of [-1,NaN,1.5,2147483648])assert.throws(()=>make(seed));
  assert.throws(()=>make(0,'unknown'));
});
