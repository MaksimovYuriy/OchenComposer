import {readSource} from '../scripts/sources.mjs';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
export const paletteCatalog=JSON.parse(readFileSync(new URL('../catalog/palettes.json',import.meta.url),'utf8'));
export const paletteLibrary=paletteCatalog.palettes.map(p=>({schemaVersion:1,...p}));
export const palettePrelude=ts.transpile(
  readSource('paletteModel')+
  '\nconst PALETTE_LIBRARY='+JSON.stringify(paletteLibrary)+';const PALETTE_ROLES='+JSON.stringify(paletteCatalog.roles)+';\n'+
  readSource('paletteRegistry')+'\n'+
  readSource('paletteFigma'),{target:ts.ScriptTarget.ES2020});
