import { WEBVIEW_USER_PROMPT_KEYS } from './webviewUserPromptKeys';

/**
 * NLS keys resolved at webview HTML build time and merged into `initialState.i18n`
 * so the webview can use getText('configuration.contextMenuActionsVisibility....').
 */
export const WEBVIEW_EXTRA_NLS_KEYS: readonly string[] = [
	'configuration.contextMenuActionsVisibility.branch.checkout',
	'configuration.contextMenuActionsVisibility.branch.rename',
	'configuration.contextMenuActionsVisibility.branch.createBranch',
	'configuration.contextMenuActionsVisibility.branch.delete',
	'configuration.contextMenuActionsVisibility.branch.merge',
	'configuration.contextMenuActionsVisibility.branch.rebase',
	'configuration.contextMenuActionsVisibility.branch.push',
	'configuration.contextMenuActionsVisibility.branch.pull',
	'configuration.contextMenuActionsVisibility.branch.viewIssue',
	'configuration.contextMenuActionsVisibility.branch.createPullRequest',
	'configuration.contextMenuActionsVisibility.branch.createArchive',
	'configuration.contextMenuActionsVisibility.branch.selectInBranchesDropdown',
	'configuration.contextMenuActionsVisibility.branch.unselectInBranchesDropdown',
	'configuration.contextMenuActionsVisibility.branch.copyName',
	'configuration.contextMenuActionsVisibility.commit.addTag',
	'configuration.contextMenuActionsVisibility.commit.createBranch',
	'configuration.contextMenuActionsVisibility.commit.checkout',
	'configuration.contextMenuActionsVisibility.commit.cherrypick',
	'configuration.contextMenuActionsVisibility.commit.revert',
	'configuration.contextMenuActionsVisibility.commit.editMessage',
	'configuration.contextMenuActionsVisibility.commit.undo',
	'configuration.contextMenuActionsVisibility.commit.drop',
	'configuration.contextMenuActionsVisibility.commit.merge',
	'configuration.contextMenuActionsVisibility.commit.rebase',
	'configuration.contextMenuActionsVisibility.commit.reset',
	'configuration.contextMenuActionsVisibility.commit.copyHash',
	'configuration.contextMenuActionsVisibility.commit.copySubject',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.viewDiff',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.viewFileAtThisRevision',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.viewDiffWithWorkingFile',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.openFile',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.markAsReviewed',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.markAsNotReviewed',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.resetFileToThisRevision',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.copyAbsoluteFilePath',
	'configuration.contextMenuActionsVisibility.commitDetailsViewFile.copyRelativeFilePath',
	'configuration.contextMenuActionsVisibility.remoteBranch.checkout',
	'configuration.contextMenuActionsVisibility.remoteBranch.delete',
	'configuration.contextMenuActionsVisibility.remoteBranch.fetch',
	'configuration.contextMenuActionsVisibility.remoteBranch.merge',
	'configuration.contextMenuActionsVisibility.remoteBranch.pull',
	'configuration.contextMenuActionsVisibility.remoteBranch.createBranch',
	'configuration.contextMenuActionsVisibility.remoteBranch.viewIssue',
	'configuration.contextMenuActionsVisibility.remoteBranch.createPullRequest',
	'configuration.contextMenuActionsVisibility.remoteBranch.createArchive',
	'configuration.contextMenuActionsVisibility.remoteBranch.selectInBranchesDropdown',
	'configuration.contextMenuActionsVisibility.remoteBranch.unselectInBranchesDropdown',
	'configuration.contextMenuActionsVisibility.remoteBranch.copyName',
	'configuration.contextMenuActionsVisibility.stash.apply',
	'configuration.contextMenuActionsVisibility.stash.createBranch',
	'configuration.contextMenuActionsVisibility.stash.pop',
	'configuration.contextMenuActionsVisibility.stash.drop',
	'configuration.contextMenuActionsVisibility.stash.copyName',
	'configuration.contextMenuActionsVisibility.stash.copyHash',
	'configuration.contextMenuActionsVisibility.tag.viewDetails',
	'configuration.contextMenuActionsVisibility.tag.delete',
	'configuration.contextMenuActionsVisibility.tag.push',
	'configuration.contextMenuActionsVisibility.tag.createArchive',
	'configuration.contextMenuActionsVisibility.tag.copyName',
	'configuration.contextMenuActionsVisibility.uncommittedChanges.stash',
	'configuration.contextMenuActionsVisibility.uncommittedChanges.reset',
	'configuration.contextMenuActionsVisibility.uncommittedChanges.clean',
	'configuration.contextMenuActionsVisibility.uncommittedChanges.openSourceControlView',
];

export function mergeWebviewExtraNls(wt: (key: string) => string): Record<string, string> {
	const o: Record<string, string> = {};
	for (const key of WEBVIEW_EXTRA_NLS_KEYS) {
		o[key] = wt(key);
	}
	return o;
}

export function mergeWebviewUserPromptNls(wt: (key: string) => string): Record<string, string> {
	const o: Record<string, string> = {};
	for (const key of WEBVIEW_USER_PROMPT_KEYS) {
		o[key] = wt(key);
	}
	return o;
}
