import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
	js.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				project: [
					'./src/tsconfig.json',
					'./tests/tsconfig.json',
					'./web/tsconfig.json'
				]
			},
			globals: {
				// Node.js globals
				__dirname: 'readonly',
				__filename: 'readonly',
				Buffer: 'readonly',
				console: 'readonly',
				process: 'readonly',
				global: 'readonly',
				// Timer functions
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				// TypeScript types
				NodeJS: 'readonly',
				Thenable: 'readonly',
				// Browser globals for web files
				window: 'readonly',
				document: 'readonly',
				Image: 'readonly',
				HTMLElement: 'readonly',
				Event: 'readonly',
				MouseEvent: 'readonly',
				KeyboardEvent: 'readonly',
				ClipboardEvent: 'readonly',
				SVGElement: 'readonly',
				SVGGraphicsElement: 'readonly',
				SVGTextContentElement: 'readonly',
				DOMRect: 'readonly',
				ResizeObserver: 'readonly',
				IntersectionObserver: 'readonly',
				// Extension specific globals
				vscode: 'readonly',
				acquireVsCodeApi: 'readonly',
				GG: 'writable',
				globalState: 'writable',
				workspaceState: 'writable',
				contextMenu: 'writable',
				dialog: 'writable',
				SvgIcons: 'readonly'
			}
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
			// Disable base rules that conflict with TypeScript
			'no-unused-vars': 'off',
			'no-undef': 'off',
			'no-empty': 'off',
			'no-useless-escape': 'off',
			'no-case-declarations': 'off',
			'no-async-promise-executor': 'off',
			'no-cond-assign': 'off',
			'no-constant-condition': 'off',
			'no-control-regex': 'off',
			// Enable TypeScript specific rules
			'@typescript-eslint/no-unused-vars': 'off',
			// Other rules
			'arrow-spacing': [
				'warn',
				{
					'before': true,
					'after': true
				}
			],
			'brace-style': [
				'warn',
				'1tbs',
				{
					'allowSingleLine': true
				}
			],
			'comma-dangle': 'warn',
			'comma-spacing': 'warn',
			'comma-style': 'warn',
			'dot-location': [
				'warn',
				'property'
			],
			'eol-last': 'warn',
			'eqeqeq': 'warn',
			'func-call-spacing': 'warn',
			'indent': [
				'warn',
				'tab',
				{
					'SwitchCase': 1
				}
			],
			'key-spacing': 'warn',
			'linebreak-style': [
				'warn',
				'windows'
			],
			'new-cap': 'warn',
			'new-parens': 'warn',
			'no-alert': 'error',
			'no-console': 'error',
			'no-eval': 'error',
			'no-extra-boolean-cast': 'warn',
			'no-implied-eval': 'error',
			'no-irregular-whitespace': 'warn',
			'no-labels': 'error',
			'no-multi-spaces': 'warn',
			'no-proto': 'error',
			'no-prototype-builtins': 'error',
			'no-redeclare': 'error',
			'no-global-assign': 'error',
			'no-return-await': 'warn',
			'no-shadow-restricted-names': 'error',
			'no-script-url': 'error',
			'no-sparse-arrays': 'warn',
			'no-throw-literal': 'warn',
			'no-trailing-spaces': 'warn',
			'no-unneeded-ternary': 'warn',
			'no-unsafe-negation': 'warn',
			'no-unused-expressions': 'warn',
			'no-var': 'warn',
			'no-whitespace-before-property': 'warn',
			'no-with': 'error',
			'padded-blocks': [
				'warn',
				{
					'classes': 'never',
					'switches': 'never'
				}
			],
			'quotes': [
				'warn',
				'single'
			],
			'rest-spread-spacing': 'warn',
			'semi': 'warn',
			'sort-imports': [
				'warn',
				{
					'allowSeparatedGroups': true,
					'ignoreDeclarationSort': true
				}
			],
			'space-before-function-paren': [
				'warn',
				{
					'anonymous': 'always',
					'named': 'never',
					'asyncArrow': 'always'
				}
			],
			'space-before-blocks': 'warn',
			'space-infix-ops': 'warn',
			'spaced-comment': 'warn',
			'template-curly-spacing': 'warn',
			'wrap-iife': [
				'warn',
				'inside'
			],
			'yoda': 'warn',
			'@typescript-eslint/await-thenable': 'warn',
			'@typescript-eslint/ban-ts-comment': 'error',
			'@typescript-eslint/class-literal-property-style': [
				'warn',
				'fields'
			],
			'@typescript-eslint/explicit-member-accessibility': [
				'warn',
				{
					'overrides': {
						'accessors': 'off',
						'constructors': 'off'
					}
				}
			],
			'@typescript-eslint/method-signature-style': [
				'warn',
				'property'
			],
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					'selector': 'class',
					'format': [
						'StrictPascalCase'
					]
				},
				{
					'selector': 'function',
					'format': [
						'camelCase'
					]
				}
			],
			'@typescript-eslint/no-misused-new': 'warn',
			'@typescript-eslint/no-this-alias': 'warn',
			'@typescript-eslint/no-unnecessary-boolean-literal-compare': 'warn'
		}
	},
	{
		files: ['./src/askpass/*.ts'],
		rules: {
			'no-console': 'off',
			'spaced-comment': 'off'
		}
	},
	{
		files: ['./tests/mocks/*.ts'],
		rules: {
			'no-global-assign': 'off'
		}
	},
	{
		ignores: ['out/**', 'dist/**', 'node_modules/**', '*.js', '*.d.ts']
	}
];