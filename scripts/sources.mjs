import {readFileSync} from 'node:fs';

// Logical source units used by the bundle and isolated VM tests.
export const SOURCE_GROUPS={
  composition:['src/composition/types.ts','src/composition/layout.ts','src/composition/geometry.ts','src/composition/names.ts'],
  paletteModel:['src/palette/model.ts'],
  paletteRegistry:['src/palette/registry.ts'],
  paletteFigma:['src/palette/figma.ts'],
  editor:['src/plugin/editor.ts'],
  svgExport:['src/plugin/svg-export.ts'],
  scene:['src/scene/contract.ts','src/scene/relations.ts','src/scene/layout.ts'],
  ai:['src/library/subjects.ts','src/ai/prompt.ts','src/ai/settings.ts','src/ai/openrouter.ts','src/ai/response.ts','src/ai/planner.ts'],
  plugin:['src/plugin/main.ts'],
};
export const PLUGIN_SOURCES=[...SOURCE_GROUPS.composition,...SOURCE_GROUPS.paletteModel,'generated/assets.ts',...SOURCE_GROUPS.paletteRegistry,...SOURCE_GROUPS.paletteFigma,...SOURCE_GROUPS.editor,...SOURCE_GROUPS.svgExport,...SOURCE_GROUPS.scene,...SOURCE_GROUPS.ai,...SOURCE_GROUPS.plugin];
export function readSource(group){
  const paths=SOURCE_GROUPS[group]||(group==='generated/assets.ts'?[group]:null);
  if(!paths)throw new Error('Unknown source group: '+group);
  return paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')).join('\n');
}
