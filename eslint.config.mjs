import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import reactHooks from 'eslint-plugin-react-hooks';
import { fixupPluginRules } from '@eslint/compat';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**', 'main.js', '*.min.js', 'web/**', 'docs/**', 'coverage/**', 'obsidian-dev-vault/**', 'tools/**'],
        linterOptions: {
            reportUnusedDisableDirectives: 'error'
        }
    },
    {
        ...js.configs.recommended,
        files: ['**/*.{js,cjs,mjs,ts,tsx}']
    },
    ...tseslint.configs.recommended,
    ...obsidianmd.configs.recommended,
    {
        files: ['src/**/*.{test,spec}.{ts,tsx}', 'test_helpers/**/*.{ts,tsx}', '__mocks__/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest
            },
            parserOptions: {
                project: './tsconfig.eslint.json'
            }
        },
        rules: {
            // Tests may legitimately use Node built-ins (e.g. reading fixture files).
            // Keep this rule enabled for `src/**` to avoid shipping Node-only imports in the plugin runtime.
            'import/no-nodejs-modules': 'off',
            'obsidianmd/no-nodejs-modules': 'off',
            // Tests run in Node and may use test harness globals instead of Obsidian's active document.
            'obsidianmd/prefer-active-doc': 'off',
            'no-restricted-properties': [
                'error',
                {
                    object: 'describe',
                    property: 'only',
                    message: 'Do not commit describe.only()'
                },
                {
                    object: 'it',
                    property: 'only',
                    message: 'Do not commit it.only()'
                },
                {
                    object: 'test',
                    property: 'only',
                    message: 'Do not commit test.only()'
                }
            ]
        }
    },
    {
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/**/*.{test,spec}.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                React: 'readonly'
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                },
                project: './tsconfig.json'
            }
        },
        plugins: {
            'react-hooks': fixupPluginRules(reactHooks),
            obsidianmd: obsidianmd
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'no-console': 'off',
            'no-debugger': 'error',
            'prefer-const': 'error',
            'no-var': 'error',
            'no-restricted-syntax': [
                'error',
                {
                    selector: "NewExpression[callee.name='Notice']",
                    message: 'Use showNotice(...) instead of new Notice(...).'
                }
            ],
            // Upgrade the Obsidian trash rule from warn to error.
            'obsidianmd/prefer-file-manager-trash-file': 'error',

            // Type assertions
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            '@typescript-eslint/prefer-as-const': 'warn',
            
            // Remove in newer version.
            '@typescript-eslint/no-deprecated': 'off',
            
            // Code style
            eqeqeq: ['error', 'always'], // Require === and !== instead of == and !=
            'prefer-template': 'warn', // Use template literals instead of string concatenation
            '@typescript-eslint/array-type': ['warn', { default: 'array' }], // Prefer T[] over Array<T>
            'prefer-object-spread': 'warn', // Use {...obj} instead of Object.assign()
            curly: ['warn', 'multi-line'], // Require curly braces for multi-line blocks
            'no-else-return': 'warn', // Remove unnecessary else after return
            'obsidianmd/ui/sentence-case': [
                'warn',
                {
                    acronyms: ['RRGGBB', 'RRGGBBAA']
                }
            ]
        }
    },
    {
        files: ['src/utils/eventActions.ts'],
        rules: {
            'no-restricted-syntax': 'off'
        }
    // },
    // {
    //     rules: {
    //         'no-useless-assignment': 'warn',
    //         'preserve-caught-error': 'warn'
    //     }
    }
);
