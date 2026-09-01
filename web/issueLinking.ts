type IssueLinkingRegExpMatch = RegExpExecArray;

interface IssueLinking {
	readonly regexp: RegExp;
	readonly remoteMatch: IssueLinkingRegExpMatch | null;
	readonly url: string;
}

const ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP = /\$\$|\$([1-9][0-9]*)|\$\{(issue|remote)\.([^}]+)\}/g;
const ISSUE_LINKING_POSITIONAL_ARGUMENT_REGEXP = /^(0|[1-9][0-9]*)$/;

/**
 * Check whether an Issue Linking Configuration uses repository remote URLs.
 * @param config The Issue Linking Configuration.
 * @returns TRUE when a Remote Regex is configured.
 */
function issueLinkingConfigUsesRemote(config: GG.IssueLinkingConfig | null) {
	return config !== null && typeof config.remote === 'string' && config.remote !== '';
}

/**
 * Check whether an Issue URL contains at least one supported issue placeholder.
 * @param url The Issue URL template.
 * @returns TRUE when the template contains an issue placeholder.
 */
function issueLinkingUrlHasIssuePlaceholder(url: string) {
	ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP.lastIndex = 0;
	let match: RegExpExecArray | null;
	while (match = ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP.exec(url)) {
		if (typeof match[1] === 'string' || match[2] === 'issue') return true;
	}
	return false;
}

/**
 * Check whether every dollar sign in an Issue URL starts a supported placeholder or escape.
 * @param url The Issue URL template.
 * @returns TRUE when the template syntax is valid.
 */
function issueLinkingUrlHasValidTemplateSyntax(url: string) {
	ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP.lastIndex = 0;
	let nextDollarIndex = url.indexOf('$'), match: RegExpExecArray | null;
	while (match = ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP.exec(url)) {
		if (nextDollarIndex !== match.index) return false;
		nextDollarIndex = url.indexOf('$', ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP.lastIndex);
	}
	return nextDollarIndex === -1;
}

/**
 * Get the error in an Issue Linking Configuration, if one exists.
 * @param config The Issue Linking Configuration.
 * @returns The configuration error, or NULL when it is valid.
 */
function getIssueLinkingConfigError(config: GG.IssueLinkingConfig) {
	if (!issueLinkingUrlHasIssuePlaceholder(config.url)) {
		return 'The Issue URL does not contain an issue placeholder.';
	}
	if (!issueLinkingUrlHasValidTemplateSyntax(config.url)) {
		return 'The Issue URL contains an unsupported placeholder or an unescaped dollar sign.';
	}
	try {
		new RegExp(config.issue, 'gu');
	} catch (e) {
		return 'Invalid Issue Regex: ' + (e as Error).message;
	}
	if (issueLinkingConfigUsesRemote(config)) {
		try {
			new RegExp(config.remote!, 'u');
		} catch (e) {
			return 'Invalid Remote Regex: ' + (e as Error).message;
		}
	}
	return null;
}

/**
 * Parse an Issue Linking Configuration so it is ready for detecting issues and generating links.
 * @param config The Issue Linking Configuration.
 * @param remotes The repository's remotes and raw fetch URLs.
 * @returns The parsed Issue Linking configuration, or NULL if it is invalid or doesn't apply to the repository.
 */
function parseIssueLinkingConfig(config: GG.IssueLinkingConfig | null, remotes: ReadonlyArray<GG.GitRemoteUrl>): IssueLinking | null {
	if (config === null || getIssueLinkingConfigError(config) !== null) return null;

	try {
		let remoteMatch: IssueLinkingRegExpMatch | null = null;
		if (issueLinkingConfigUsesRemote(config)) {
			const remoteRegexp = new RegExp(config.remote!, 'u');
			const orderedRemotes: GG.GitRemoteUrl[] = [];
			const addRemote = (name: string) => {
				const remote = remotes.find((candidate) => candidate.name === name);
				if (remote !== undefined) orderedRemotes.push(remote);
			};
			addRemote('upstream');
			addRemote('origin');
			for (let i = 0; i < remotes.length; i++) {
				if (remotes[i].name !== 'upstream' && remotes[i].name !== 'origin') {
					orderedRemotes.push(remotes[i]);
				}
			}

			for (let i = 0; i < orderedRemotes.length; i++) {
				if (orderedRemotes[i].url !== null) {
					remoteMatch = remoteRegexp.exec(orderedRemotes[i].url!);
					if (remoteMatch !== null) break;
				}
			}
			if (remoteMatch === null) return null;
		}

		return {
			regexp: new RegExp(config.issue, 'gu'),
			remoteMatch,
			url: config.url
		};
	} catch (_) {
		return null;
	}
}

/**
 * Generate the URL for an issue link, performing all template substitutions.
 * @param issueMatch The match produced by the Issue Regex.
 * @param issueLinking The parsed Issue Linking configuration.
 * @returns The generated URL, or NULL if a referenced capture group is unavailable.
 */
function generateIssueLinkFromMatch(issueMatch: IssueLinkingRegExpMatch, issueLinking: IssueLinking) {
	let valid = true;
	ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP.lastIndex = 0;
	const url = issueLinking.url.replace(ISSUE_LINKING_TEMPLATE_ARGUMENT_REGEXP, (placeholder, legacyIssueIndex: string | undefined, scope: string | undefined, group: string | undefined) => {
		if (placeholder === '$$') return '$';

		const match = typeof legacyIssueIndex === 'string' || scope === 'issue'
			? issueMatch
			: issueLinking.remoteMatch;
		const argument = typeof legacyIssueIndex === 'string' ? legacyIssueIndex : group!;
		let value: string | undefined;
		if (match !== null) {
			if (ISSUE_LINKING_POSITIONAL_ARGUMENT_REGEXP.test(argument)) {
				const index = parseInt(argument);
				value = index < match.length ? match[index] : undefined;
			} else {
				const groups = match.groups as { [name: string]: string | undefined } | undefined;
				value = groups !== undefined ? groups[argument] : undefined;
			}
		}

		if (typeof value === 'undefined') {
			valid = false;
			return placeholder;
		}
		return value;
	});
	return valid ? url : null;
}
