import { readFileSync } from 'node:fs';
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
