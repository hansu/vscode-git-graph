import * as path from 'path';
import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { getConfig } from './config';
import { DataSource, GitConfigKey } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { RepoFileWatcher } from './repoFileWatcher';
import { RepoManager } from './repoManager';
import {
	ErrorInfo,
	GitConfigLocation,
	GitGraphViewInitialState,
	GitPushBranchMode,
	GitRepoSet,
	LoadGitGraphViewTo,
	RequestDropCommits,
	RequestMessage,
	RequestSquashCommits,
	ResponseMessage
} from './types';
import {
	UNABLE_TO_FIND_GIT_MSG,
	UNCOMMITTED,
	archive,
	copyFilePathToClipboard,
	copyToClipboard,
	createPullRequest,
	getNonce,
	getPathFromUri,
	openExtensionSettings,
	openExternalUrl,
	openFile,
	pathWithTrailingSlash,
	showErrorMessage,
	viewDiff,
	viewDiffWithWorkingFile,
	viewFileAtRevision,
	viewScm
} from './utils';
import { createWebviewNlsTranslator } from './utils/nlsWebview';
import { mergeWebviewExtraNls, mergeWebviewUserPromptNls } from './utils/webviewExtraNls';
import { Disposable, toDisposable } from './utils/disposable';

/**
 * Abstract base class for Git Graph Views containing all shared logic.
 */
export abstract class BaseGitGraphView extends Disposable {
	protected readonly extensionPath: string;
	protected readonly avatarManager: AvatarManager;
	protected readonly dataSource: DataSource;
	protected readonly extensionState: ExtensionState;
	protected readonly repoFileWatcher: RepoFileWatcher;
	protected readonly repoManager: RepoManager;
	protected readonly logger: Logger;
	protected isGraphViewLoaded: boolean = false;
	protected isPanelVisible: boolean = true;
	protected currentRepo: string | null = null;
	protected loadViewTo: LoadGitGraphViewTo = null;

	private loadRepoInfoRefreshId: number = 0;
	private loadCommitsRefreshId: number = 0;

	/**
	 * Get the webview instance.
	 */
	protected abstract get webview(): vscode.Webview;

	/**
	 * Check if the view is visible.
	 */
	protected abstract get isVisible(): boolean;

	/**
	 * Creates a base Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 */
	protected constructor(
		extensionPath: string,
		dataSource: DataSource,
		extensionState: ExtensionState,
		avatarManager: AvatarManager,
		repoManager: RepoManager,
		logger: Logger,
		loadViewTo: LoadGitGraphViewTo
	) {
		super();
		this.extensionPath = extensionPath;
		this.avatarManager = avatarManager;
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.repoManager = repoManager;
		this.logger = logger;
		this.loadViewTo = loadViewTo;

		// Instantiate a RepoFileWatcher that watches for file changes in the repository currently open in the Git Graph View
		this.repoFileWatcher = new RepoFileWatcher(logger, () => {
			if (this.isVisible) {
				this.sendMessage({ command: 'refresh' });
			}
		});
	}

	/**
	 * Initialize common event handlers and update the view.
	 */
	protected initializeCommon() {
		this.registerDisposables(
			// Subscribe to events triggered when a repository is added or deleted from Git Graph
			this.repoManager.onDidChangeRepos((event) => {
				if (!this.isVisible) return;
				const loadViewTo = event.loadRepo !== null ? { repo: event.loadRepo } : null;
				if ((event.numRepos === 0 && this.isGraphViewLoaded) || (event.numRepos > 0 && !this.isGraphViewLoaded)) {
					this.loadViewTo = loadViewTo;
					this.update();
				} else {
					this.respondLoadRepos(event.repos, loadViewTo);
				}
			}),
			// Refresh workspace folder paths when workspace folders change
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				if (!this.isVisible || !this.isGraphViewLoaded) return;
				this.respondLoadRepos(this.repoManager.getRepos(), null);
			}),
			// Refresh the webview when autoScroll configuration changes so it takes effect immediately
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('git-graph.commitDetailsView.autoScroll')) {
					this.update();
				}
			}),
			// Subscribe to events triggered when an avatar is available
			this.avatarManager.onAvatar((event) => {
				this.sendMessage({
					command: 'fetchAvatar',
					email: event.email,
					image: event.image
				});
			}),

			// Respond to messages sent from the Webview
			this.webview.onDidReceiveMessage((msg) => this.respondToMessage(msg)),

			// Dispose Git Graph View resources when disposed
			toDisposable(() => {
				this.repoFileWatcher.stop();
			})
		);

		// Render the content of the Webview
		this.update();

		this.logger.log(
			'Created Git Graph View' + (this.loadViewTo !== null ? ' (active repo: ' + this.loadViewTo.repo + ')' : '')
		);
	}

	/**
	 * Handle visibility changes.
	 * @param visible Whether the view is now visible.
	 */
	protected onDidChangeVisibility(visible: boolean) {
		if (visible !== this.isPanelVisible) {
			if (visible) {
				this.update();
			} else {
				this.currentRepo = null;
				this.repoFileWatcher.stop();
			}
			this.isPanelVisible = visible;
		}
	}

	/**
	 * Update the view with the provided repositories and load target.
	 * @param repos The repositories to show.
	 * @param loadViewTo What to load the view to.
	 */
	public updateWithRepos(repos: GitRepoSet, loadViewTo: LoadGitGraphViewTo) {
		if (this.isVisible) {
			if (loadViewTo !== null) {
				this.respondLoadRepos(repos, loadViewTo);
			}
		} else {
			this.loadViewTo = loadViewTo;
		}
	}

	/**
	 * Respond to a message sent from the front-end.
	 * @param msg The message that was received.
	 */
	private async respondToMessage(msg: RequestMessage) {
		this.repoFileWatcher.mute();
		let errorInfos: ErrorInfo[];

		switch (msg.command) {
			case 'addRemote':
				this.sendMessage({
					command: 'addRemote',
					error: await this.dataSource.addRemote(msg.repo, msg.name, msg.url, msg.pushUrl, msg.fetch)
				});
				break;
			case 'addTag':
				errorInfos = [
					await this.dataSource.addTag(msg.repo, msg.tagName, msg.commitHash, msg.type, msg.message, msg.force)
				];
				if (errorInfos[0] === null && msg.pushToRemote !== null) {
					errorInfos.push(
						...(await this.dataSource.pushTag(
							msg.repo,
							msg.tagName,
							[msg.pushToRemote],
							msg.commitHash,
							msg.pushSkipRemoteCheck
						))
					);
				}
				this.sendMessage({
					command: 'addTag',
					repo: msg.repo,
					tagName: msg.tagName,
					pushToRemote: msg.pushToRemote,
					commitHash: msg.commitHash,
					errors: errorInfos
				});
				break;
			case 'applyStash':
				this.sendMessage({
					command: 'applyStash',
					error: await this.dataSource.applyStash(msg.repo, msg.selector, msg.reinstateIndex)
				});
				break;
			case 'branchFromStash':
				this.sendMessage({
					command: 'branchFromStash',
					error: await this.dataSource.branchFromStash(msg.repo, msg.selector, msg.branchName)
				});
				break;
			case 'checkoutBranch':
				errorInfos = [await this.dataSource.checkoutBranch(msg.repo, msg.branchName, msg.remoteBranch)];
				if (errorInfos[0] === null && msg.pullAfterwards !== null) {
					errorInfos.push(
						await this.dataSource.pullBranch(
							msg.repo,
							msg.pullAfterwards.branchName,
							msg.pullAfterwards.remote,
							msg.pullAfterwards.createNewCommit,
							msg.pullAfterwards.squash,
							msg.pullAfterwards.noVerify
						)
					);
				}
				this.sendMessage({
					command: 'checkoutBranch',
					pullAfterwards: msg.pullAfterwards,
					errors: errorInfos
				});
				break;
			case 'checkoutCommit':
				this.sendMessage({
					command: 'checkoutCommit',
					error: await this.dataSource.checkoutCommit(msg.repo, msg.commitHash)
				});
				break;
			case 'cherrypickCommit':
				errorInfos = [
					await this.dataSource.cherrypickCommit(
						msg.repo,
						msg.commitHash,
						msg.parentIndex,
						msg.recordOrigin,
						msg.noCommit
					)
				];
				if (errorInfos[0] === null && msg.noCommit) {
					errorInfos.push(await viewScm());
				}
				this.sendMessage({ command: 'cherrypickCommit', errors: errorInfos });
				break;
			case 'cleanUntrackedFiles':
				this.sendMessage({
					command: 'cleanUntrackedFiles',
					error: await this.dataSource.cleanUntrackedFiles(msg.repo, msg.directories)
				});
				break;
			case 'commitDetails':
				let data = await Promise.all([
					msg.commitHash === UNCOMMITTED
						? this.dataSource.getUncommittedDetails(msg.repo)
						: msg.stash === null
							? this.dataSource.getCommitDetails(msg.repo, msg.commitHash, msg.hasParents)
							: this.dataSource.getStashDetails(msg.repo, msg.commitHash, msg.stash),
					msg.avatarEmail !== null ? this.avatarManager.getAvatarImage(msg.avatarEmail) : Promise.resolve(null)
				]);
				this.sendMessage({
					command: 'commitDetails',
					...data[0],
					avatar: data[1],
					codeReview:
						msg.commitHash !== UNCOMMITTED ? this.extensionState.getCodeReview(msg.repo, msg.commitHash) : null,
					refresh: msg.refresh
				});
				break;
			case 'compareCommits':
				this.sendMessage({
					command: 'compareCommits',
					commitHash: msg.commitHash,
					compareWithHash: msg.compareWithHash,
					...(await this.dataSource.getCommitComparison(msg.repo, msg.fromHash, msg.toHash)),
					codeReview:
						msg.toHash !== UNCOMMITTED
							? this.extensionState.getCodeReview(msg.repo, msg.fromHash + '-' + msg.toHash)
							: null,
					refresh: msg.refresh
				});
				break;
			case 'copyFilePath':
				this.sendMessage({
					command: 'copyFilePath',
					error: await copyFilePathToClipboard(msg.repo, msg.filePath, msg.absolute)
				});
				break;
			case 'copyToClipboard':
				this.sendMessage({
					command: 'copyToClipboard',
					type: msg.type,
					error: await copyToClipboard(msg.data)
				});
				break;
			case 'createArchive':
				this.sendMessage({
					command: 'createArchive',
					error: await archive(msg.repo, msg.ref, this.dataSource)
				});
				break;
			case 'createBranch':
				this.sendMessage({
					command: 'createBranch',
					errors: await this.dataSource.createBranch(msg.repo, msg.branchName, msg.commitHash, msg.checkout, msg.force)
				});
				break;
			case 'createPullRequest':
				errorInfos = [
					msg.push
						? await this.dataSource.pushBranch(
								msg.repo,
								msg.sourceBranch,
								msg.sourceRemote,
								true,
								GitPushBranchMode.Normal,
								false
							)
						: null
				];
				if (errorInfos[0] === null) {
					errorInfos.push(await createPullRequest(msg.config, msg.sourceOwner, msg.sourceRepo, msg.sourceBranch));
				}
				this.sendMessage({
					command: 'createPullRequest',
					push: msg.push,
					errors: errorInfos
				});
				break;
			case 'deleteBranch':
				errorInfos = [await this.dataSource.deleteBranch(msg.repo, msg.branchName, msg.forceDelete)];
				if (errorInfos[0] === null) {
					for (let i = 0; i < msg.deleteOnRemotes.length; i++) {
						errorInfos.push(await this.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.deleteOnRemotes[i]));
					}
				}
				this.sendMessage({
					command: 'deleteBranch',
					repo: msg.repo,
					branchName: msg.branchName,
					deleteOnRemotes: msg.deleteOnRemotes,
					errors: errorInfos
				});
				break;
			case 'deleteRemote':
				this.sendMessage({
					command: 'deleteRemote',
					error: await this.dataSource.deleteRemote(msg.repo, msg.name)
				});
				break;
			case 'deleteRemoteBranch':
				this.sendMessage({
					command: 'deleteRemoteBranch',
					error: await this.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.remote)
				});
				break;
			case 'deleteTag':
				this.sendMessage({
					command: 'deleteTag',
					error: await this.dataSource.deleteTag(msg.repo, msg.tagName, msg.deleteOnRemote)
				});
				break;
			case 'deleteUserDetails':
				errorInfos = [];
				if (msg.name) {
					errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, msg.location));
				}
				if (msg.email) {
					errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, msg.location));
				}
				this.sendMessage({
					command: 'deleteUserDetails',
					errors: errorInfos
				});
				break;
			case 'dropCommit':
				this.sendMessage({
					command: 'dropCommit',
					error: await this.dataSource.dropCommit(msg.repo, msg.commitHash)
				});
				break;
			case 'dropCommits':
				this.sendMessage({
					command: 'dropCommits',
					error: await this.dataSource.dropCommits(msg.repo, (msg as RequestDropCommits).commits)
				});
				break;
			case 'dropStash':
				this.sendMessage({
					command: 'dropStash',
					error: await this.dataSource.dropStash(msg.repo, msg.selector)
				});
				break;
			case 'squashCommits':
				this.sendMessage({
					command: 'squashCommits',
					error: await this.dataSource.squashCommits(
						msg.repo,
						(msg as RequestSquashCommits).commits,
						(msg as RequestSquashCommits).commitMessage,
						(msg as RequestSquashCommits).noVerify
					)
				});
				break;
			case 'editRemote':
				this.sendMessage({
					command: 'editRemote',
					error: await this.dataSource.editRemote(
						msg.repo,
						msg.nameOld,
						msg.nameNew,
						msg.urlOld,
						msg.urlNew,
						msg.pushUrlOld,
						msg.pushUrlNew
					)
				});
				break;
			case 'editUserDetails':
				errorInfos = [
					await this.dataSource.setConfigValue(msg.repo, GitConfigKey.UserName, msg.name, msg.location),
					await this.dataSource.setConfigValue(msg.repo, GitConfigKey.UserEmail, msg.email, msg.location)
				];
				if (errorInfos[0] === null && errorInfos[1] === null) {
					if (msg.deleteLocalName) {
						errorInfos.push(
							await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, GitConfigLocation.Local)
						);
					}
					if (msg.deleteLocalEmail) {
						errorInfos.push(
							await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, GitConfigLocation.Local)
						);
					}
				}
				this.sendMessage({
					command: 'editUserDetails',
					errors: errorInfos
				});
				break;
			case 'endCodeReview':
				this.extensionState.endCodeReview(msg.repo, msg.id);
				break;
			case 'exportRepoConfig':
				this.sendMessage({
					command: 'exportRepoConfig',
					error: await this.repoManager.exportRepoConfig(msg.repo)
				});
				break;
			case 'fetch':
				this.sendMessage({
					command: 'fetch',
					error: await this.dataSource.fetch(msg.repo, msg.name, msg.prune, msg.pruneTags)
				});
				break;
			case 'fetchAvatar':
				this.avatarManager.fetchAvatarImage(msg.email, msg.repo, msg.remote, msg.commits);
				break;
			case 'fetchIntoLocalBranch':
				this.sendMessage({
					command: 'fetchIntoLocalBranch',
					error: await this.dataSource.fetchIntoLocalBranch(
						msg.repo,
						msg.remote,
						msg.remoteBranch,
						msg.localBranch,
						msg.force
					)
				});
				break;
			case 'loadCommits':
				this.loadCommitsRefreshId = msg.refreshId;
				this.sendMessage({
					command: 'loadCommits',
					refreshId: msg.refreshId,
					onlyFollowFirstParent: msg.onlyFollowFirstParent,
					...(await this.dataSource.getCommits(
						msg.repo,
						msg.branches,
						msg.authors,
						msg.maxCommits,
						msg.showTags,
						msg.showRemoteBranches,
						msg.includeCommitsMentionedByReflogs,
						msg.onlyFollowFirstParent,
						msg.commitOrdering,
						msg.remotes,
						msg.hideRemotes,
						msg.stashes,
						msg.simplifyByDecoration,
						msg.pathFilter
					))
				});
				break;
			case 'loadConfig':
				this.sendMessage({
					command: 'loadConfig',
					repo: msg.repo,
					...(await this.dataSource.getConfig(msg.repo, msg.remotes))
				});
				break;
			case 'loadRepoInfo':
				this.loadRepoInfoRefreshId = msg.refreshId;
				let repoInfo = await this.dataSource.getRepoInfo(
						msg.repo,
						msg.showRemoteBranches,
						msg.showStashes,
						msg.hideRemotes
					),
					isRepo = true;
				if (repoInfo.error) {
					// If an error occurred, check to make sure the repo still exists
					isRepo = (await this.dataSource.repoRoot(msg.repo)) !== null;
					if (!isRepo) repoInfo.error = null; // If the error is caused by the repo no longer existing, clear the error message
				}
				this.sendMessage({
					command: 'loadRepoInfo',
					refreshId: msg.refreshId,
					...repoInfo,
					isRepo: isRepo
				});
				if (msg.repo !== this.currentRepo) {
					this.currentRepo = msg.repo;
					this.extensionState.setLastActiveRepo(msg.repo);
					this.repoFileWatcher.start(msg.repo);
				}
				break;
			case 'loadRepos':
				if (!msg.check || !(await this.repoManager.checkReposExist())) {
					// If not required to check repos, or no changes were found when checking, respond with repos
					this.respondLoadRepos(this.repoManager.getRepos(), null);
				}
				break;
			case 'merge':
				this.sendMessage({
					command: 'merge',
					actionOn: msg.actionOn,
					error: await this.dataSource.merge(
						msg.repo,
						msg.obj,
						msg.actionOn,
						msg.createNewCommit,
						msg.allowUnrelatedHistories,
						msg.squash,
						msg.noVerify,
						msg.noCommit
					)
				});
				break;
			case 'openExtensionSettings':
				this.sendMessage({
					command: 'openExtensionSettings',
					error: await openExtensionSettings()
				});
				break;
			case 'openExternalDirDiff':
				this.sendMessage({
					command: 'openExternalDirDiff',
					error: await this.dataSource.openExternalDirDiff(msg.repo, msg.fromHash, msg.toHash, msg.isGui)
				});
				break;
			case 'openExternalUrl':
				this.sendMessage({
					command: 'openExternalUrl',
					error: await openExternalUrl(msg.url)
				});
				break;
			case 'openFile':
				this.sendMessage({
					command: 'openFile',
					error: await openFile(msg.repo, msg.filePath, msg.hash, this.dataSource)
				});
				break;
			case 'openTerminal':
				this.sendMessage({
					command: 'openTerminal',
					error: await this.dataSource.openGitTerminal(msg.repo, null, msg.name)
				});
				break;
			case 'popStash':
				this.sendMessage({
					command: 'popStash',
					error: await this.dataSource.popStash(msg.repo, msg.selector, msg.reinstateIndex)
				});
				break;
			case 'pruneRemote':
				this.sendMessage({
					command: 'pruneRemote',
					error: await this.dataSource.pruneRemote(msg.repo, msg.name)
				});
				break;
			case 'pullBranch':
				this.sendMessage({
					command: 'pullBranch',
					error: await this.dataSource.pullBranch(
						msg.repo,
						msg.branchName,
						msg.remote,
						msg.createNewCommit,
						msg.squash,
						msg.noVerify
					)
				});
				break;
			case 'pushBranch':
				this.sendMessage({
					command: 'pushBranch',
					willUpdateBranchConfig: msg.willUpdateBranchConfig,
					errors: await this.dataSource.pushBranchToMultipleRemotes(
						msg.repo,
						msg.branchName,
						msg.remotes,
						msg.setUpstream,
						msg.mode,
						msg.noVerify
					)
				});
				break;
			case 'pushStash':
				this.sendMessage({
					command: 'pushStash',
					error: await this.dataSource.pushStash(msg.repo, msg.message, msg.includeUntracked)
				});
				break;
			case 'pushTag':
				this.sendMessage({
					command: 'pushTag',
					repo: msg.repo,
					tagName: msg.tagName,
					remotes: msg.remotes,
					commitHash: msg.commitHash,
					errors: await this.dataSource.pushTag(msg.repo, msg.tagName, msg.remotes, msg.commitHash, msg.skipRemoteCheck)
				});
				break;
			case 'rebase':
				this.sendMessage({
					command: 'rebase',
					actionOn: msg.actionOn,
					interactive: msg.interactive,
					error: await this.dataSource.rebase(
						msg.repo,
						msg.obj,
						msg.actionOn,
						msg.ignoreDate,
						msg.interactive,
						msg.signoff
					)
				});
				break;
			case 'getRebaseTodoList': {
				const todoResult = await this.dataSource.getRebaseTodoList(msg.repo, msg.obj, msg.actionOn);
				this.sendMessage({
					command: 'getRebaseTodoList',
					items: todoResult.items,
					error: todoResult.error
				});
				break;
			}
			case 'rebaseInteractive':
				this.sendMessage({
					command: 'rebaseInteractive',
					error: await this.dataSource.rebaseInteractiveWithTodo(
						msg.repo,
						msg.obj,
						msg.actionOn,
						msg.entries,
						msg.signoff
					)
				});
				break;
			case 'renameBranch':
				this.sendMessage({
					command: 'renameBranch',
					error: await this.dataSource.renameBranch(msg.repo, msg.oldName, msg.newName)
				});
				break;
			case 'rescanForRepos':
				if (!(await this.repoManager.searchWorkspaceForRepos())) {
					showErrorMessage(vscode.l10n.t('ui.noGitRepositoriesFound'));
				}
				break;
			case 'resetFileToRevision':
				this.sendMessage({
					command: 'resetFileToRevision',
					error: await this.dataSource.resetFileToRevision(msg.repo, msg.commitHash, msg.filePath)
				});
				break;
			case 'resetToCommit':
				this.sendMessage({
					command: 'resetToCommit',
					error: await this.dataSource.resetToCommit(msg.repo, msg.commit, msg.resetMode)
				});
				break;
			case 'revertCommit':
				this.sendMessage({
					command: 'revertCommit',
					error: await this.dataSource.revertCommit(msg.repo, msg.commitHash, msg.parentIndex)
				});
				break;
			case 'undoLastCommit':
				this.sendMessage({
					command: 'undoLastCommit',
					error: await this.dataSource.undoLastCommit(msg.repo)
				});
				break;
			case 'editCommitMessage':
				this.sendMessage({
					command: 'editCommitMessage',
					error: await this.dataSource.editCommitMessage(msg.repo, msg.commitHash, msg.message, msg.noVerify)
				});
				break;
			case 'setGlobalViewState':
				this.sendMessage({
					command: 'setGlobalViewState',
					error: await this.extensionState.setGlobalViewState(msg.state)
				});
				break;
			case 'setRepoState':
				this.repoManager.setRepoState(msg.repo, msg.state);
				break;
			case 'setWorkspaceViewState':
				this.sendMessage({
					command: 'setWorkspaceViewState',
					error: await this.extensionState.setWorkspaceViewState(msg.state)
				});
				break;
			case 'showErrorMessage':
				showErrorMessage(msg.message);
				break;
			case 'startCodeReview':
				this.sendMessage({
					command: 'startCodeReview',
					commitHash: msg.commitHash,
					compareWithHash: msg.compareWithHash,
					...(await this.extensionState.startCodeReview(msg.repo, msg.id, msg.files, msg.lastViewedFile))
				});
				break;
			case 'tagDetails':
				this.sendMessage({
					command: 'tagDetails',
					tagName: msg.tagName,
					commitHash: msg.commitHash,
					...(await this.dataSource.getTagDetails(msg.repo, msg.tagName))
				});
				break;
			case 'updateCodeReview':
				this.sendMessage({
					command: 'updateCodeReview',
					error: await this.extensionState.updateCodeReview(msg.repo, msg.id, msg.remainingFiles, msg.lastViewedFile)
				});
				break;
			case 'viewDiff':
				this.sendMessage({
					command: 'viewDiff',
					error: await viewDiff(msg.repo, msg.fromHash, msg.toHash, msg.oldFilePath, msg.newFilePath, msg.type)
				});
				break;
			case 'viewDiffWithWorkingFile':
				this.sendMessage({
					command: 'viewDiffWithWorkingFile',
					error: await viewDiffWithWorkingFile(msg.repo, msg.hash, msg.filePath, this.dataSource)
				});
				break;
			case 'viewFileAtRevision':
				this.sendMessage({
					command: 'viewFileAtRevision',
					error: await viewFileAtRevision(msg.repo, msg.hash, msg.filePath)
				});
				break;
			case 'viewScm':
				this.sendMessage({
					command: 'viewScm',
					error: await viewScm()
				});
				break;
		}

		this.repoFileWatcher.unmute();
	}

	/**
	 * Send a message to the front-end.
	 * @param msg The message to be sent.
	 */
	protected sendMessage(msg: ResponseMessage) {
		if (this.isDisposed()) {
			this.logger.log('The Git Graph View has already been disposed, ignored sending "' + msg.command + '" message.');
		} else {
			this.webview.postMessage(msg).then(
				() => {},
				() => {
					if (this.isDisposed()) {
						this.logger.log('The Git Graph View was disposed while sending "' + msg.command + '" message.');
					} else {
						this.logger.logError('Unable to send "' + msg.command + '" message to the Git Graph View.');
					}
				}
			);
		}
	}

	/**
	 * Update the HTML document loaded in the Webview.
	 */
	protected update() {
		this.webview.html = this.getHtmlForWebview();
	}

	/**
	 * Get the HTML document to be loaded in the Webview.
	 * @returns The HTML.
	 */
	protected getHtmlForWebview() {
		const config = getConfig(),
			nonce = getNonce();
		// Create NLS translator for webview strings
		const wt = createWebviewNlsTranslator(this.extensionPath, config.language);
		// Build i18n object with extra NLS keys and user prompt keys
		// Use uppercase keys for compatibility with webview getText function
		const i18n = {
			GIT_FILE_CHANGE_TYPES: {
				A: wt('git.fileChangeTypes.added'),
				M: wt('git.fileChangeTypes.modified'),
				D: wt('git.fileChangeTypes.deleted'),
				R: wt('git.fileChangeTypes.renamed'),
				U: wt('git.fileChangeTypes.untracked')
			},
			GIT_SIGNATURE_STATUS_DESCRIPTIONS: {
				G: wt('git.signatureStatusDescriptions.valid'),
				U: wt('git.signatureStatusDescriptions.unknown'),
				X: wt('git.signatureStatusDescriptions.expired'),
				Y: wt('git.signatureStatusDescriptions.expiredKey'),
				R: wt('git.signatureStatusDescriptions.revokedKey'),
				E: wt('git.signatureStatusDescriptions.unchecked'),
				B: wt('git.signatureStatusDescriptions.bad')
			},
			UNCOMMITTED_CHANGES: wt('ui.uncommittedChanges'),
			SHOW_ALL_BRANCHES: wt('ui.showAllBranches'),
			LOADING: wt('ui.loading'),
			REFRESHING: wt('ui.refreshing'),
			NO_COMMITS: wt('ui.noCommits'),
			NO_REPOSITORIES: wt('ui.noRepositories'),
			RESCAN_FOR_REPOS: wt('ui.rescanForRepos'),
			UNABLE_TO_LOAD: wt('ui.unableToLoad'),
			UNABLE_TO_FIND_GIT: wt('ui.unableToFindGit'),
			REPOSITORY_SETTINGS: wt('ui.repositorySettings'),
			GENERAL: wt('ui.general'),
			EDIT_NAME: wt('ui.editName'),
			DELETE_NAME: wt('ui.deleteName'),
			EDIT_INITIAL_BRANCHES: wt('ui.editInitialBranches'),
			CLEAR_INITIAL_BRANCHES: wt('ui.clearInitialBranches'),
			SHOW_STASHES: wt('ui.showStashes'),
			SHOW_TAGS: wt('ui.showTags'),
			INCLUDE_COMMITS_MENTIONED_BY_REFLOGS: wt('ui.includeCommitsMentionedByReflogs'),
			ONLY_FOLLOW_FIRST_PARENT: wt('ui.onlyFollowFirstParent'),
			USER_DETAILS: wt('ui.userDetails'),
			USER_NAME: wt('ui.userName'),
			USER_EMAIL: wt('ui.userEmail'),
			EDIT: wt('ui.edit'),
			REMOVE: wt('ui.remove'),
			ADD_USER_DETAILS: wt('ui.addUserDetails'),
			REMOTE_CONFIGURATION: wt('ui.remoteConfiguration'),
			REMOTE: wt('ui.remote'),
			URL: wt('ui.url'),
			TYPE: wt('ui.type'),
			ACTIONS: wt('ui.actions'),
			CLICK_TO_SHOW_BRANCHES: wt('ui.clickToShowBranches'),
			CLICK_TO_HIDE_BRANCHES: wt('ui.clickToHideBranches'),
			FETCH_URL: wt('ui.fetchUrl'),
			FETCH: wt('ui.fetch'),
			FETCH_FROM_REMOTE: wt('ui.fetchFromRemote'),
			PRUNE_REMOTE: wt('ui.pruneRemote'),
			EDIT_REMOTE: wt('ui.editRemote'),
			DELETE_REMOTE: wt('ui.deleteRemote'),
			PUSH_URL: wt('ui.pushUrl'),
			PUSH: wt('ui.push'),
			NO_REMOTES_CONFIGURED: wt('ui.noRemotesConfigured'),
			ADD_REMOTE: wt('ui.addRemote'),
			ISSUE_LINKING: wt('ui.issueLinking'),
			ISSUE_REGEX: wt('ui.issueRegex'),
			ISSUE_URL: wt('ui.issueUrl'),
			ADD_ISSUE_LINKING: wt('ui.addIssueLinking'),
			PULL_REQUEST_CREATION: wt('ui.pullRequestCreation'),
			PROVIDER: wt('ui.provider'),
			SOURCE_REPOSITORY: wt('ui.sourceRepository'),
			DESTINATION_REPOSITORY: wt('ui.destinationRepository'),
			DESTINATION_BRANCH: wt('ui.destinationBranch'),
			CONFIGURE_PULL_REQUEST_INTEGRATION: wt('ui.configurePullRequestIntegration'),
			GIT_GRAPH_CONFIGURATION: wt('ui.gitGraphConfiguration'),
			OPEN_GIT_GRAPH_EXTENSION_SETTINGS: wt('ui.openGitGraphExtensionSettings'),
			EXPORT_REPOSITORY_CONFIG: wt('ui.exportRepositoryConfig'),
			REPOS: wt('ui.repos'),
			BRANCHES: wt('ui.branches'),
			AUTHORS: wt('ui.authors'),
			FETCH_AND_PRUNE: wt('ui.fetchAndPrune'),
			FROM_REMOTES: wt('ui.fromRemotes'),
			OPENING_TERMINAL: wt('ui.openingTerminal'),
			UNABLE_TO_LOAD_REPO_INFO: wt('ui.unableToLoadRepoInfo'),
			UNABLE_TO_LOAD_COMMITS: wt('ui.unableToLoadCommits'),
			RETRY: wt('ui.retry'),
			HEAD: wt('ui.head'),
			CONFIGURE_INITIAL_BRANCHES: wt('ui.configureInitialBranches'),
			CONFIGURE_INITIAL_BRANCHES_DESCRIPTION: wt('ui.configureInitialBranchesDescription'),
			CONFIGURE_INITIAL_BRANCHES_NOTE: wt('ui.configureInitialBranchesNote'),
			USE_GLOBALLY: wt('ui.useGlobally'),
			USE_GLOBALLY_DESCRIPTION: wt('ui.useGloballyDescription'),
			PRUNE_TAGS: wt('ui.pruneTags'),
			PRUNE_TAGS_DESCRIPTION: wt('ui.pruneTagsDescription'),
			CANNOT_CONFIGURE_PULL_REQUEST_INTEGRATION: wt('ui.cannotConfigurePullRequestIntegration'),
			CANNOT_CONFIGURE_PULL_REQUEST_INTEGRATION_DESCRIPTION: wt('ui.cannotConfigurePullRequestIntegrationDescription'),
			CONFIRM_REMOVE_PULL_REQUEST_INTEGRATION: wt('ui.confirmRemovePullRequestIntegration'),
			YES_REMOVE: wt('ui.yesRemove'),
			ISSUE_URL_DESCRIPTION: wt('ui.issueUrlDescription'),
			USE_GLOBALLY_ISSUE_LINKING: wt('ui.useGloballyIssueLinking'),
			USE_GLOBALLY_ISSUE_LINKING_DESCRIPTION: wt('ui.useGloballyIssueLinkingDescription'),
			CONFIGURE_PULL_REQUEST_CREATION_STEP1: wt('ui.configurePullRequestCreationStep1'),
			CONFIGURE_PULL_REQUEST_CREATION_STEP2: wt('ui.configurePullRequestCreationStep2'),
			SAVE_CONFIGURATION: wt('ui.saveConfiguration'),
			FIND_PLACEHOLDER: wt('ui.findPlaceholder'),
			FIND_CASE_SENSITIVE: wt('ui.findCaseSensitive'),
			FIND_REGEX: wt('ui.findRegex'),
			FIND_PREVIOUS_MATCH: wt('ui.findPreviousMatch'),
			FIND_NEXT_MATCH: wt('ui.findNextMatch'),
			FIND_OPEN_COMMIT_DETAILS_VIEW: wt('ui.findOpenCommitDetailsView'),
			FIND_CLOSE: wt('ui.findClose'),
			cancel: wt('ui.cancel'),
			close: wt('ui.close'),
			error: wt('ui.error'),
			filter: wt('ui.filter'),
			noResults: wt('ui.noResults'),
			none: wt('ui.none'),
			noZeroLengthMatch: wt('ui.noZeroLengthMatch'),
			loading: wt('ui.loading'),
			name: wt('ui.name'),
			fileSystemDefaultName: wt('ui.fileSystemDefaultName'),
			initialBranches: wt('ui.initialBranches'),
			local: wt('ui.local'),
			global: wt('ui.global'),
			onlyApplicableWhenShowingAllBranches: wt('ui.onlyApplicableWhenShowingAllBranches'),
			whenDiscoveringCommitsToLoadDoNotFollowAllParentCommitsOnlyFollowTheFirstParentCommit: wt(
				'ui.whenDiscoveringCommitsToLoadDoNotFollowAllParentCommitsOnlyFollowTheFirstParentCommit'
			),
			userDetailsAreUsedByGitToRecordTheAuthorAndCommitterOfCommitObjects: wt(
				'ui.userDetailsAreUsedByGitToRecordTheAuthorAndCommitterOfCommitObjects'
			),
			notSet: wt('ui.notSet'),
			issueLinkingConvertsIssueNumbersInCommitAndTagMessagesToHyperlinksThatOpenTheIssueInYourIssueTrackingSystemIfABranchNameContainsAnIssueNumberYouCanViewTheIssueViaTheBranchSContextMenu:
				wt(
					'ui.issueLinkingConvertsIssueNumbersInCommitAndTagMessagesToHyperlinksThatOpenTheIssueInYourIssueTrackingSystemIfABranchNameContainsAnIssueNumberYouCanViewTheIssueViaTheBranchSContextMenu'
				),
			pullRequestCreationAutomatesTheOpeningAndPreFillingOfPullRequestFormsDirectlyFromTheBranchSContextMenu: wt(
				'ui.pullRequestCreationAutomatesTheOpeningAndPreFillingOfPullRequestFormsDirectlyFromTheBranchSContextMenu'
			),
			specifyANameForThisRepository: wt('ui.specifyANameForThisRepository'),
			saveName: wt('ui.saveName'),
			areYouSureYouWantToDeleteTheManuallyConfiguredNameForThisRepository: wt(
				'ui.areYouSureYouWantToDeleteTheManuallyConfiguredNameForThisRepository'
			),
			andUseTheFileSystemsDefaultName: wt('ui.andUseTheFileSystemsDefaultName'),
			yesDelete: wt('ui.yesDelete'),
			checkedOutBranch: wt('ui.checkedOutBranch'),
			specificBranches: wt('ui.specificBranches'),
			saveConfiguration: wt('ui.saveConfiguration'),
			areYouSureYouWantToClearTheBranchesInitiallyShownWhenLoadingThisRepositoryInTheGitGraphView: wt(
				'ui.areYouSureYouWantToClearTheBranchesInitiallyShownWhenLoadingThisRepositoryInTheGitGraphView'
			),
			yesClear: wt('ui.yesClear'),
			setTheUsernameAndEmailThatGitUsesToRecordTheAuthorAndCommitterOfCommitObjects: wt(
				'ui.setTheUsernameAndEmailThatGitUsesToRecordTheAuthorAndCommitterOfCommitObjects'
			),
			setUserDetails: wt('ui.setUserDetails'),
			areYouSureYouWantToRemoveThe: wt('ui.areYouSureYouWantToRemoveThe'),
			configurationThatGitUsesToRecordTheAuthorAndCommitterOfCommits: wt(
				'ui.configurationThatGitUsesToRecordTheAuthorAndCommitterOfCommits'
			),
			removeUserDetails: wt('ui.removeUserDetails'),
			leaveBlankToUseFetchUrl: wt('ui.leaveBlankToUseFetchUrl'),
			addARemoteRepositoryToThisRepository: wt('ui.addARemoteRepositoryToThisRepository'),
			fetchUrl: wt('ui.fetchUrl'),
			pushUrl: wt('ui.pushUrl'),
			fetchImmediately: wt('ui.fetchImmediately'),
			addingRemote: wt('ui.addingRemote'),
			editRemoteRepository: wt('ui.editRemoteRepository'),
			saveChanges: wt('ui.saveChanges'),
			savingRemoteChanges: wt('ui.savingRemoteChanges'),
			areYouSureYouWantToDeleteTheRemoteRepository: wt('ui.areYouSureYouWantToDeleteTheRemoteRepository'),
			deletingRemote: wt('ui.deletingRemote'),
			areYouSureYouWantToFetchFromTheRemoteRepository: wt('ui.areYouSureYouWantToFetchFromTheRemoteRepository'),
			prune: wt('ui.prune'),
			beforeFetchDeleteRemoteTrackingReferencesThatNoLongerExistOnTheRemote: wt(
				'ui.beforeFetchDeleteRemoteTrackingReferencesThatNoLongerExistOnTheRemote'
			),
			yesFetch: wt('ui.yesFetch'),
			fetchingFromRemote: wt('ui.fetchingFromRemote'),
			areYouSureYouWantToPruneRemoteTrackingReferencesThatNoLongerExistOnTheRemoteRepository: wt(
				'ui.areYouSureYouWantToPruneRemoteTrackingReferencesThatNoLongerExistOnTheRemoteRepository'
			),
			yesPrune: wt('ui.yesPrune'),
			pruningRemote: wt('ui.pruningRemote'),
			clickTo: wt('ui.clickTo'),
			show: wt('ui.show'),
			hide: wt('ui.hide'),
			theBranchesForThisRemoteRepository: wt('ui.theBranchesForThisRemoteRepository'),
			areYouSureYouWantToRemove: wt('ui.areYouSureYouWantToRemove'),
			theLocallyConfiguredInThisRepository: wt('ui.theLocallyConfiguredInThisRepository'),
			issueLinking: wt('ui.issueLinking'),
			theGloballyConfiguredIssueLinkingInGitGraph: wt('ui.theGloballyConfiguredIssueLinkingInGitGraph'),
			exportingGitGraphRepositoryConfigurationWillGenerateAFileThatCanBeCommittedToThisRepositorySoThatOtherCollaboratorsCanUseTheSameConfiguration:
				wt(
					'ui.exportingGitGraphRepositoryConfigurationWillGenerateAFileThatCanBeCommittedToThisRepositorySoThatOtherCollaboratorsCanUseTheSameConfiguration'
				),
			import: wt('ui.import'),
			importRepositoryConfiguration: wt('ui.importRepositoryConfiguration'),
			importing: wt('ui.importing'),
			successfullyImported: wt('ui.successfullyImported'),
			successfullyImportedDescription: wt('ui.successfullyImportedDescription'),
			ok: wt('ui.ok'),
			unableToImport: wt('ui.unableToImport'),
			unableToImportDescription: wt('ui.unableToImportDescription'),
			errors: wt('ui.errors'),
			viewError: wt('ui.viewError'),
			viewErrors: wt('ui.viewErrors'),
			paths: wt('ui.paths'),
			simplify: wt('ui.simplify'),
			current: wt('ui.current'),
			find: wt('ui.find'),
			openTerminal: wt('ui.openTerminal'),
			repo: wt('ui.repo'),
			remotes: wt('ui.remotes'),
			selectPathByContextMenu: wt('ui.selectPathByContextMenu'),
			showRemoteBranches: wt('ui.showRemoteBranches'),
			simplifyByDecoration: wt('ui.simplifyByDecoration'),
			unableToLoadGitGraph: wt('ui.unableToLoadGitGraph'),
			noGitRepositoriesFound: wt('ui.noGitRepositoriesFound'),
			maxDepthOfRepoSearchHelp: wt('ui.maxDepthOfRepoSearchHelp'),
			...mergeWebviewExtraNls(wt),
			...mergeWebviewUserPromptNls(wt)
		};
		const initialState: GitGraphViewInitialState = {
			config: {
				commitDetailsView: config.commitDetailsView,
				commitOrdering: config.commitOrder,
				contextMenuActionsVisibility: config.contextMenuActionsVisibility,
				customBranchGlobPatterns: config.customBranchGlobPatterns,
				customEmojiShortcodeMappings: config.customEmojiShortcodeMappings,
				customPullRequestProviders: config.customPullRequestProviders,
				dateFormat: config.dateFormat,
				defaultColumnVisibility: config.defaultColumnVisibility,
				stickyHeader: config.stickyHeader,
				dialogDefaults: config.dialogDefaults,
				enhancedAccessibility: config.enhancedAccessibility,
				fetchAndPrune: config.fetchAndPrune,
				fetchAndPruneTags: config.fetchAndPruneTags,
				fetchAvatars: config.fetchAvatars && this.extensionState.isAvatarStorageAvailable(),
				graph: config.graph,
				includeCommitsMentionedByReflogs: config.includeCommitsMentionedByReflogs,
				initialLoadCommits: config.initialLoadCommits,
				keybindings: config.keybindings,
				language: config.language,
				loadMoreCommits: config.loadMoreCommits,
				loadMoreCommitsAutomatically: config.loadMoreCommitsAutomatically,
				markdown: config.markdown,
				mute: config.muteCommits,
				onlyFollowFirstParent: config.onlyFollowFirstParent,
				onRepoLoad: config.onRepoLoad,
				referenceLabels: config.referenceLabels,
				repoDropdownOrder: config.repoDropdownOrder,
				singleAuthorSelect: config.singleAuthorSelect,
				singleBranchSelect: config.singleBranchSelect,
				showRemoteBranches: config.showRemoteBranches,
				simplifyByDecoration: config.simplifyByDecoration,
				showStashes: config.showStashes,
				showTags: config.showTags,
				toolbarButtonVisibility: config.toolbarButtonVisibility
			},
			i18n: i18n as any,
			lastActiveRepo: this.extensionState.getLastActiveRepo(),
			loadViewTo: this.loadViewTo,
			repos: this.repoManager.getRepos(),
			loadRepoInfoRefreshId: this.loadRepoInfoRefreshId,
			loadCommitsRefreshId: this.loadCommitsRefreshId,
			workspaceFolderPaths: getWorkspaceFolderRelativePaths(this.repoManager.getRepos())
		};
		const globalState = this.extensionState.getGlobalViewState();
		const workspaceState = this.extensionState.getWorkspaceViewState();

		let body,
			numRepos = Object.keys(initialState.repos).length,
			colorVars = '',
			colorParams = '';
		for (let i = 0; i < initialState.config.graph.colours.length; i++) {
			colorVars += '--git-graph-color' + i + ':' + initialState.config.graph.colours[i] + '; ';
			colorParams += '[data-color="' + i + '"]{--git-graph-color:var(--git-graph-color' + i + ');} ';
		}

		if (this.dataSource.isGitExecutableUnknown()) {
			body = `<body class="unableToLoad">
			<h2>Unable to load Git Graph</h2>
			<p class="unableToLoadMessage">${UNABLE_TO_FIND_GIT_MSG}</p>
			</body>`;
		} else if (numRepos > 0) {
			const stickyClassAttr = initialState.config.stickyHeader ? ' class="sticky"' : '';
			let hideRemotes = '',
				hideSimplify = '';
			if (!config.toolbarButtonVisibility.remotes) {
				hideRemotes = 'style="display: none"';
			}
			if (!config.toolbarButtonVisibility.simplify) {
				hideSimplify = 'style="display: none"';
			}
			body = `<body>
			<div id="view" tabindex="-1">
				<div id="controls"${stickyClassAttr}>
					<span id="repoControl"><span class="unselectable">${wt('ui.repo')}: </span><div id="repoDropdown" class="dropdown"></div></span>
					<span id="branchControl"><span class="unselectable">${wt('ui.branches')}: </span><div id="branchDropdown" class="dropdown"></div></span>
					<span id="pathFilterControl" title="${wt('ui.selectPathByContextMenu')}"><span class="unselectable">${wt('ui.paths')}: </span><div id="pathFilterDropdown" class="dropdown"></div></span>
					<span id="authorControl"><span class="unselectable">${wt('ui.authors')}: </span><div id="authorDropdown" class="dropdown"></div></span>
					<label ${hideRemotes} id="showRemoteBranchesControl" title="${wt('ui.showRemoteBranches')}"><input type="checkbox" id="showRemoteBranchesCheckbox" tabindex="-1"><span class="customCheckbox"></span>${wt('ui.remotes')}</label>
					<label ${hideSimplify} id="simplifyByDecorationControl" title="${wt('ui.simplifyByDecoration')}"><input type="checkbox" id="simplifyByDecorationCheckbox" tabindex="-1"><span class="customCheckbox"></span>${wt('ui.simplify')}</label>
					<div id="currentBtn" title="${wt('ui.current')}"></div>
					<div id="findBtn" title="${wt('ui.find')}"></div>
					<div id="terminalBtn" title="${wt('ui.openTerminal')}"></div>
					<div id="settingsBtn" title="${wt('ui.repositorySettings')}"></div>
					<div id="fetchBtn"></div>
					<div id="refreshBtn"></div>
				</div>
				<div id="content">
					<div id="commitGraph"></div>
					<div id="commitTable"></div>
				</div>
				<div id="footer"></div>
			</div>
			<script nonce="${nonce}">var initialState = ${JSON.stringify(initialState)}, globalState = ${JSON.stringify(globalState)}, workspaceState = ${JSON.stringify(workspaceState)};</script>
			<script nonce="${nonce}" src="${this.getMediaUri('out.min.js')}"></script>
			</body>`;
		} else {
			body = `<body class="unableToLoad">
			<h2>${wt('ui.unableToLoadGitGraph')}</h2>
			<p class="unableToLoadMessage">${wt('ui.noGitRepositoriesFound')}</p>
			<p>${wt('ui.maxDepthOfRepoSearchHelp')}</p>
			<p><div id="rescanForReposBtn" class="roundedBtn">${wt('ui.rescanForRepos')}</div></p>
			<script nonce="${nonce}">(function(){ var api = acquireVsCodeApi(); document.getElementById('rescanForReposBtn').addEventListener('click', function(){ api.postMessage({command: 'rescanForRepos'}); }); })();</script>
			</body>`;
		}
		this.isGraphViewLoaded = numRepos > 0;
		this.loadViewTo = null;

		return `<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${standardiseCspSource(this.webview.cspSource)} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link rel="stylesheet" type="text/css" href="${this.getMediaUri('out.min.css')}">
				<title>Git Graph</title>
				<style>body{${colorVars}} ${colorParams}</style>
			</head>
			${body}
		</html>`;
	}

	/**
	 * Get a WebviewUri for a media file included in the extension.
	 * @param file The file name in the `media` directory.
	 * @returns The WebviewUri.
	 */
	protected getMediaUri(file: string) {
		return this.webview.asWebviewUri(this.getUri('media', file));
	}

	/**
	 * Get a File Uri for a resource file included in the extension.
	 * @param file The file name in the `resource` directory.
	 * @returns The Uri.
	 */
	protected getResourcesUri(file: string) {
		return this.getUri('resources', file);
	}

	/**
	 * Get a File Uri for a file included in the extension.
	 * @param pathComps The path components relative to the root directory of the extension.
	 * @returns The File Uri.
	 */
	protected getUri(...pathComps: string[]) {
		return vscode.Uri.file(path.join(this.extensionPath, ...pathComps));
	}

	/**
	 * Send the known repositories to the front-end.
	 * @param repos The set of known repositories.
	 * @param loadViewTo What to load the view to.
	 */
	protected respondLoadRepos(repos: GitRepoSet, loadViewTo: LoadGitGraphViewTo) {
		this.sendMessage({
			command: 'loadRepos',
			repos: repos,
			lastActiveRepo: this.extensionState.getLastActiveRepo(),
			loadViewTo: loadViewTo,
			workspaceFolderPaths: getWorkspaceFolderRelativePaths(repos)
		});
	}
}

/**
 * Compute workspace folder relative paths for each repository.
 * @param repos The set of known repositories.
 * @returns A mapping from repo path to an array of workspace folder relative paths within that repo.
 */
function getWorkspaceFolderRelativePaths(repos: GitRepoSet): { [repo: string]: string[] } {
	const result: { [repo: string]: string[] } = {};
	const wsFolders = vscode.workspace.workspaceFolders || [];
	const wsPaths = wsFolders.map((f) => getPathFromUri(f.uri));
	const repoPaths = Object.keys(repos);
	for (let i = 0; i < repoPaths.length; i++) {
		const repoPath = repoPaths[i];
		const repoPathWithSlash = pathWithTrailingSlash(repoPath);
		const paths: string[] = [];
		for (let j = 0; j < wsPaths.length; j++) {
			if (wsPaths[j] === repoPath) {
				// Workspace folder is the repo root — no filtering needed
				continue;
			}
			if (wsPaths[j].startsWith(repoPathWithSlash)) {
				paths.push(path.posix.relative(repoPath, wsPaths[j]));
			}
		}
		result[repoPath] = paths;
	}
	return result;
}

/**
 * Standardise the CSP Source provided by Visual Studio Code for use with the Webview. It is idempotent unless called with http/https URI's, in which case it keeps only the authority portion of the http/https URI. This is necessary to be compatible with some web browser environments.
 * @param cspSource The value provide by Visual Studio Code.
 * @returns The standardised CSP Source.
 */
export function standardiseCspSource(cspSource: string) {
	if (cspSource.startsWith('http://') || cspSource.startsWith('https://')) {
		const pathIndex = cspSource.indexOf('/', 8),
			queryIndex = cspSource.indexOf('?', 8),
			fragmentIndex = cspSource.indexOf('#', 8);
		let endOfAuthorityIndex = pathIndex;
		if (queryIndex > -1 && (queryIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1))
			endOfAuthorityIndex = queryIndex;
		if (fragmentIndex > -1 && (fragmentIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1))
			endOfAuthorityIndex = fragmentIndex;
		return endOfAuthorityIndex > -1 ? cspSource.substring(0, endOfAuthorityIndex) : cspSource;
	} else {
		return cspSource;
	}
}
