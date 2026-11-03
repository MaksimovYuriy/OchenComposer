import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {SOURCE_GROUPS,PLUGIN_SOURCES} from '../scripts/sources.mjs';

test('Compiler and isolated test loaders include the same complete source graph exactly once',()=>{
 const config=JSON.parse(readFileSync('tsconfig.json','utf8'));
 assert.deepEqual(config.files,PLUGIN_SOURCES);
 assert.equal(new Set(PLUGIN_SOURCES).size,PLUGIN_SOURCES.length);
 const actual=readdirSync('src',{recursive:true}).filter(p=>p.endsWith('.ts')).map(p=>'src/'+p.replaceAll('\\','/')).sort();
 assert.deepEqual(PLUGIN_SOURCES.filter(p=>p.startsWith('src/')).sort(),actual);
});

test('Composition, scene rules and palette model have no Figma or network runtime access',()=>{
 for(const file of [...SOURCE_GROUPS.composition,...SOURCE_GROUPS.scene,...SOURCE_GROUPS.paletteModel,...SOURCE_GROUPS.ai.filter(p=>p.startsWith('src/library/'))]){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.ES2020,true);
  function visit(node){
   if(ts.isIdentifier(node))assert.ok(!['figma','fetch','document','window'].includes(node.text),file+' must stay independent of runtime adapters');
   ts.forEachChild(node,visit);
  }
  visit(source);
 }
});
