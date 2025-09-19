import * as path from 'path';
import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { BaseGitGraphView } from './baseGitGraphView';
import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { LoadGitGraphViewTo } from './types';
import { toDisposable } from './utils/disposable';

/**
 * Manages the Git Graph View in the panel (sidebar/bottom panel).
 */
export class GitGraphPanelView extends BaseGitGraphView implements vscode.WebviewViewProvider {
	public static readonly viewType = 'git-graph.panel';
	private static instance: GitGraphPanelView | undefined;
	private _view?: vscode.WebviewView;
	private _isInitialized = false;

	/**
	 * Get or create the singleton instance.
	 */
	public static getInstance(
		extensionPath: string,
		dataSource: DataSource,
		extensionState: ExtensionState,
		avatarManager: AvatarManager,
		repoManager: RepoManager,
		logger: Logger
	): GitGraphPanelView {
		if (!GitGraphPanelView.instance) {
			GitGraphPanelView.instance = new GitGraphPanelView(
				extensionPath,
				dataSource,
				extensionState,
				avatarManager,
				repoManager,
				logger
			);
		}
		return GitGraphPanelView.instance;
	}

	/**
	 * Get the webview instance.
	 */
	protected get webview(): vscode.Webview {
		if (!this._view) {
			throw new Error('GitGraphPanelView webview not initialized');
		}
		return this._view.webview;
	}

	/**
	 * Check if the view is visible.
	 */
	protected get isVisible(): boolean {
		return this._view?.visible ?? false;
	}

	/**
	 * Creates a Git Graph Panel View.
	 */
	private constructor(
		extensionPath: string,
		dataSource: DataSource,
		extensionState: ExtensionState,
		avatarManager: AvatarManager,
		repoManager: RepoManager,
		logger: Logger
	) {
		super(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, null);
		this.registerDisposables(
			toDisposable(() => {
				GitGraphPanelView.instance = undefined;
			})
		);
	}

	/**
	 * Called when the webview view is resolved.
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.file(path.join(this.extensionPath, 'media'))]
		};

		// Only initialize once
		if (!this._isInitialized) {
			this._isInitialized = true;

			// Handle visibility changes
			this.registerDisposables(
				webviewView.onDidChangeVisibility(() => {
					this.onDidChangeVisibility(webviewView.visible);
				}),

				// Handle disposal
				webviewView.onDidDispose(() => {
					this._view = undefined;
					this._isInitialized = false;
				})
			);

			// Initialize common functionality
			this.initializeCommon();
		} else {
			// If already initialized, just update the view
			this.update();
		}

		// If we have a saved state, restore it
		if (context.state) {
			// Handle state restoration if needed
		}
	}

	/**
	 * Show the panel view.
	 */
	public async show(loadViewTo: LoadGitGraphViewTo) {
		if (!this._view) {
			// If view is not yet created, try to reveal it which will trigger resolveWebviewView
			try {
				await vscode.commands.executeCommand('git-graph.panel.focus');
			} catch {
				// Try alternative commands to show the panel
				try {
					await vscode.commands.executeCommand('workbench.view.extension.git-graph-panel');
				} catch {
					this.logger.logError('Failed to reveal Git Graph panel');
				}
			}
		}

		if (this._view) {
			this._view.show?.(true);
			this.updateWithRepos(this.repoManager.getRepos(), loadViewTo);
		} else {
			// Save the loadViewTo for when the view is resolved
			this.loadViewTo = loadViewTo;
		}
	}
}
