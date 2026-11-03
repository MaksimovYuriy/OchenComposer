const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const figmaPlugin = require('@figma/eslint-plugin-figma-plugins')
const shared=(files,names)=>({files,rules:{'@typescript-eslint/no-unused-vars':['error',{varsIgnorePattern:'^('+names.join('|')+')$'}]}})

module.exports = tseslint.config(
  eslint.configs.recommended,
  // @typescript-eslint/recommended-type-checked is too aggressive for
  // widget code...it doesn't seem to like JSX element return values or
  // unbundling the `widget` object for use* hooks. So we'll use
  // tseslint.configs.recommended instead.
  tseslint.configs.recommended,
  {
    plugins: {
      '@figma/figma-plugins': figmaPlugin,
    },
    rules: {
      ...figmaPlugin.configs.recommended.rules,
      // allow underscore-prefixing of unused variables
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  shared(['src/composition/types.ts'],['Asset','Placement','Backdrop','Matrix','Bounds','ScenePlacement','StateMode','TemplateId','CompositionQuality','ScenePlan','Zone']),
  shared(['src/composition/layout.ts'],['composeScene','compositionQuality']),
  shared(['src/composition/geometry.ts'],['rotatedSize','centeredTransform','stateReplacementScale']),
  shared(['src/composition/names.ts'],['normalizeName','resolveNames']),
  shared(['src/scene/contract.ts'],['SemanticPlan','validateSemanticPlan']),
  shared(['src/scene/relations.ts'],['checkSceneRelations']),
  shared(['src/scene/layout.ts'],['composeAiScene']),
  shared(['src/library/subjects.ts'],['SEMANTIC_CATALOG']),
  shared(['src/ai/prompt.ts'],['semanticRequest']),
  shared(['src/ai/settings.ts'],['loadSemanticSettings','configureSemanticSettings','deleteSemanticSettings']),
  shared(['src/ai/openrouter.ts'],['semanticApi']),
  shared(['src/ai/response.ts'],['requestSemanticPlan']),
  shared(['src/ai/planner.ts'],['interpretMetaphor']),
  shared(['src/plugin/editor.ts'],['editComposition','syncCurrentScene','selectedComposition','sceneItems']),
  shared(['src/plugin/svg-export.ts'],['prepareSvgExport','SvgExport']),
  shared(['src/palette/*.ts'],['validatePalette','paletteWarnings','mapPalettePaints','getScenePalette','recolorTree','applyScenePalette','sendPaletteCatalog','loadPersonalPalettes','requestedPalette','importPersonalPalette']),
  {
    files:['src/ui/*.js'],
    languageOptions:{globals:Object.fromEntries(['document','window','parent','URL','Blob','DOMParser','XMLSerializer','setTimeout'].map(name=>[name,'readonly']))},
  },
  {ignores:['code.js','out/**','generated/**','scripts/**','tests/**','dist/**','eslint.config.js']},
)
