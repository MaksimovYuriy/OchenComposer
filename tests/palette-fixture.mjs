import {readFileSync} from 'node:fs';
import ts from 'typescript';
export const paletteCatalog=JSON.parse(readFileSync(new URL('../catalog/palettes.json',import.meta.url),'utf8'));
export const paletteLibrary=paletteCatalog.palettes.map(p=>({schemaVersion:1,...p}));
export const palettePrelude=ts.transpile(
  readFileSync(new URL('../palette-core.ts',import.meta.url),'utf8')+
  '\nconst PALETTE_LIBRARY='+JSON.stringify(paletteLibrary)+';const PALETTE_ROLES='+JSON.stringify(paletteCatalog.roles)+';\n'+
  readFileSync(new URL('../palette-registry.ts',import.meta.url),'utf8')+'\n'+
  readFileSync(new URL('../palette-figma.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2020});
