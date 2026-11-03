const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const figmaPlugin = require('@figma/eslint-plugin-figma-plugins')

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
  {
    files: ['core.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(_|resolveNames$|composeScene$|stateReplacementScale$|Backdrop$)' }],
    },
  },
  {
    files: ['editor.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(editComposition|syncCurrentScene|selectedComposition|sceneItems)$' }],
    },
  },
  {
    files: ['palette-core.ts','palette-figma.ts','palette-registry.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error',{varsIgnorePattern:'^(validatePalette|paletteWarnings|mapPalettePaints|getScenePalette|recolorTree|applyScenePalette|sendPaletteCatalog|loadPersonalPalettes|requestedPalette|importPersonalPalette)$'}],
    },
  },
  {
    files:['export.ts'],
    rules:{'@typescript-eslint/no-unused-vars':['error',{varsIgnorePattern:'^(prepareSvgExport|SvgExport)$'}]},
  },
  {
    files:['scene-plan.ts'],
    rules:{'@typescript-eslint/no-unused-vars':['error',{varsIgnorePattern:'^(SemanticPlan|validateSemanticPlan|composeAiScene)$'}]},
  },
  {
    files:['semantics.ts'],
    rules:{'@typescript-eslint/no-unused-vars':['error',{varsIgnorePattern:'^(SEMANTIC_VERSION|sendSemanticSettings|loadSemanticSettings|configureSemanticSettings|deleteSemanticSettings|interpretMetaphor)$'}]},
  },
  {
    ignores: ['code.js', 'out/**', 'generated/**', 'scripts/**', 'tests/**', 'dist', 'eslint.config.js'],
  },
)
