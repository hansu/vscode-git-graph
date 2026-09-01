import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';

interface IssueLinkingApi {
	parseIssueLinkingConfig: (config: { issue: string, remote?: string, url: string } | null, remotes: ReadonlyArray<{ name: string, url: string | null }>) => ParsedIssueLinking | null;
	generateIssueLinkFromMatch: (match: RegExpExecArray, issueLinking: ParsedIssueLinking) => string | null;
}

interface ParsedIssueLinking {
	readonly regexp: RegExp;
	readonly remoteMatch: RegExpExecArray | null;
	readonly url: string;
}

describe('Issue Linking', () => {
	let api: IssueLinkingApi;

	beforeAll(() => {
		const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'issueLinking.ts'), 'utf8') +
			'\n(globalThis as any).__issueLinkingApi = { parseIssueLinkingConfig, generateIssueLinkFromMatch };';
		const script = ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.None,
				target: ts.ScriptTarget.ES2018
			}
		}).outputText;
		const context: { __issueLinkingApi?: IssueLinkingApi } = {};
		vm.runInNewContext(script, context);
		api = context.__issueLinkingApi!;
	});

	const generateUrl = (config: { issue: string, remote?: string, url: string }, remotes: ReadonlyArray<{ name: string, url: string | null }>, issue: string) => {
		const parsed = api.parseIssueLinkingConfig(config, remotes);
		if (parsed === null) return null;
		const match = parsed.regexp.exec(issue);
		return match !== null ? api.generateIssueLinkFromMatch(match, parsed) : null;
	};

	it('Should preserve legacy issue placeholders when no Remote Regex is configured', () => {
		expect(generateUrl({ issue: '#(\\d+)', url: 'https://example.com/issues/$1' }, [], '#123')).toBe('https://example.com/issues/123');
	});

	it('Should expand positional, named, full-match, and escaped placeholders', () => {
		expect(generateUrl(
			{ issue: '#(?<num>\\d+)', url: 'https://example.com/${issue.0}/${issue.1}/${issue.num}/$1/$${issue.1}' },
			[],
			'#123'
		)).toBe('https://example.com/#123/123/123/123/${issue.1}');
	});

	it('Should prefer upstream, then origin, before other remotes', () => {
		expect(generateUrl(
			{
				issue: '#(?<num>\\d+)',
				remote: 'github\\.com[/:](?<owner>[^/]+)/(?<repo>[^/.]+)',
				url: 'https://github.com/${remote.owner}/${remote.repo}/issues/${issue.num}'
			},
			[
				{ name: 'fork', url: 'https://github.com/fork/repo.git' },
				{ name: 'origin', url: 'git@github.com:user/repo.git' },
				{ name: 'upstream', url: 'https://github.com/org/repo.git' }
			],
			'#123'
		)).toBe('https://github.com/org/repo/issues/123');
	});

	it('Should try origin when upstream does not match', () => {
		expect(generateUrl(
			{ issue: '#(\\d+)', remote: 'github\\.com[/:]([^/]+)/([^/.]+)', url: 'https://github.com/${remote.1}/${remote.2}/issues/$1' },
			[
				{ name: 'upstream', url: 'https://gitlab.com/org/repo.git' },
				{ name: 'origin', url: 'git@github.com:user/repo.git' }
			],
			'#3'
		)).toBe('https://github.com/user/repo/issues/3');
	});

	it('Should preserve Git order for remotes other than upstream and origin', () => {
		expect(generateUrl(
			{ issue: '#(\\d+)', remote: 'example\\.com[/:]([^/]+)', url: 'https://issues.example.com/${remote.1}/$1' },
			[
				{ name: 'second-by-name', url: 'git@example.com:first.git' },
				{ name: 'first-by-name', url: 'git@example.com:second.git' }
			],
			'#7'
		)).toBe('https://issues.example.com/first.git/7');
	});

	it('Should allow a Remote Regex to act only as an applicability condition', () => {
		expect(generateUrl(
			{ issue: '#(\\d+)', remote: 'github\\.com[/:]', url: 'https://issues.example.com/${issue.1}' },
			[{ name: 'origin', url: 'https://github.com/org/repo.git' }],
			'#9'
		)).toBe('https://issues.example.com/9');
	});

	it('Should not create links when the Remote Regex does not match', () => {
		expect(api.parseIssueLinkingConfig(
			{ issue: '#(\\d+)', remote: 'github\\.com[/:]', url: 'https://issues.example.com/${issue.1}' },
			[{ name: 'origin', url: 'https://gitlab.com/org/repo.git' }]
		)).toBeNull();
	});

	it('Should not create links when a referenced capture is unavailable', () => {
		expect(generateUrl({ issue: '#(\\d+)(?:-(\\w+))?', url: 'https://example.com/${issue.2}/${issue.1}' }, [], '#123')).toBeNull();
	});

	it('Should not try another remote after the first regex match is selected', () => {
		expect(generateUrl(
			{
				issue: '#(\\d+)',
				remote: 'github\\.com[/:](?:(?<owner>[^/]+)/)?(?<repo>[^/.]+)',
				url: 'https://github.com/${remote.owner}/${remote.repo}/issues/$1'
			},
			[
				{ name: 'upstream', url: 'https://github.com/repo.git' },
				{ name: 'origin', url: 'https://github.com/user/repo.git' }
			],
			'#5'
		)).toBeNull();
	});

	it('Should reject templates without an issue placeholder', () => {
		expect(api.parseIssueLinkingConfig(
			{ issue: '#(\\d+)', remote: 'github\\.com[/:](.+)', url: 'https://example.com/${remote.1}' },
			[{ name: 'origin', url: 'https://github.com/org/repo.git' }]
		)).toBeNull();
	});

	it('Should reject unsupported placeholders', () => {
		expect(api.parseIssueLinkingConfig(
			{ issue: '#(\\d+)', url: 'https://example.com/${unknown.1}/${issue.1}' },
			[]
		)).toBeNull();
	});

	it('Should reject invalid persisted regular expressions', () => {
		expect(api.parseIssueLinkingConfig({ issue: '(', url: 'https://example.com/${issue.0}' }, [])).toBeNull();
		expect(api.parseIssueLinkingConfig(
			{ issue: '#(\\d+)', remote: '(', url: 'https://example.com/${issue.1}' },
			[{ name: 'origin', url: 'https://github.com/org/repo.git' }]
		)).toBeNull();
	});
});
