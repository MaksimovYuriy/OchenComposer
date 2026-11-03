import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const catalog=JSON.parse(readFileSync(new URL('../catalog/palettes.json',import.meta.url),'utf8'));
const normalize=value=>value.toLowerCase()==='white'?'#FFFFFF':value.toLowerCase()==='black'?'#000000':value.toUpperCase();
const colors=svg=>[...new Set([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map(m=>m[1]).filter(v=>v!=='none').map(normalize))];

test('Every source color has a palette role; monochrome and backgrounds use only permitted roles',()=>{
  const palette=catalog.palettes.find(p=>p.id==='violet');
  for(const [folder,area] of [['mainground','object'],['background','monochrome']]) {
    const allowed=Object.entries(palette.colors).filter(([role])=>catalog.roles[role].areas.includes(area)).map(([,hex])=>hex);
    for(const size of ['large','small'])for(const file of readdirSync(new URL(`../assets/${folder}/${size}/`,import.meta.url))) {
      const svg=readFileSync(new URL(`../assets/${folder}/${size}/${encodeURIComponent(file)}`,import.meta.url),'utf8');
      for(const color of colors(svg))assert.ok(allowed.includes(color),`${file}: ${color} is not allowed for ${area}`);
    }
  }
  for(const [file,id] of [['Фон.svg','violet'],['Фон-1.svg','turquoise'],['Фон-2.svg','orange']]) {
    const p=catalog.palettes.find(p=>p.id===id);
    const allowed=Object.entries(p.colors).filter(([role])=>catalog.roles[role].areas.includes('background')).map(([,hex])=>hex);
    for(const size of ['large','small'])for(const color of colors(readFileSync(new URL(`../assets/colors/${size}/${encodeURIComponent(file)}`,import.meta.url),'utf8')))assert.ok(allowed.includes(color));
  }
});

test('All palette swatches match the data; border black is not a ninth role',()=>{
  for(const palette of catalog.palettes){
    const svg=readFileSync(new URL('../'+palette.source,import.meta.url),'utf8');
    const swatches=[...svg.matchAll(/\bfill="([^"]+)"/g)].map(m=>m[1]).filter(c=>c!=='none').map(normalize);
    assert.deepEqual([...new Set(swatches)].sort(),Object.values(palette.colors).sort());
    assert.equal(Object.keys(palette.colors).length,8);
    assert.equal(catalog.roles.ink.areas.includes('background'),false);
  }
  const example=JSON.parse(readFileSync(new URL('../catalog/custom-palette.example.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(example.colors).sort(),Object.keys(catalog.roles).sort());
});
