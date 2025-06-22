import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { BaseGitGraphView } from './baseGitGraphView';
import { getConfig } from './config';
import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { LoadGitGraphViewTo, TabIconColourTheme } from './types';
import { toDisposable } from './utils/disposable';

/**
 * Manages the Git Graph View in the editor.
 */
export class GitGraphView extends BaseGitGraphView {
	public static currentPanel: GitGraphView | undefined;

	private readonly panel: vscode.WebviewPanel;

	/**
	 * If a Git Graph View already exists, show and update it. Otherwise, create a Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 */
	public static createOrShow(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadGitGraphViewTo) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		if (GitGraphView.currentPanel) {
			// If Git Graph panel already exists
			GitGraphView.currentPanel.updateWithRepos(repoManager.getRepos(), loadViewTo);
			GitGraphView.currentPanel.panel.reveal(column);
		} else {
			// If Git Graph panel doesn't already exist
			GitGraphView.currentPanel = new GitGraphView(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, loadViewTo, column);
		}
	}

	/**
	 * Get the webview instance.
	 */
	protected get webview(): vscode.Webview {
		return this.panel.webview;
	}

	/**
	 * Check if the view is visible.
	 */
	protected get isVisible(): boolean {
		return this.panel.visible;
	}

	/**
	 * Creates a Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 * @param column The column the view should be loaded in.
	 */
	private constructor(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadGitGraphViewTo, column: vscode.ViewColumn | undefined) {
		super(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, loadViewTo);

		const config = getConfig();
		this.panel = vscode.window.createWebviewPanel('git-graph', 'Git Graph', column || vscode.ViewColumn.One, {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.file(extensionPath + '/media')],
			retainContextWhenHidden: config.retainContextWhenHidden
		});
		this.panel.iconPath = config.tabIconColourTheme === TabIconColourTheme.Colour
			? this.getResourcesUri('webview-icon.svg')
			: {
				light: this.getResourcesUri('webview-icon-light.svg'),
				dark: this.getResourcesUri('webview-icon-dark.svg')
			};


		this.registerDisposables(
			// Dispose Git Graph View resources when disposed
			toDisposable(() => {
				GitGraphView.currentPanel = undefined;
			}),

			// Dispose this Git Graph View when the Webview Panel is disposed
			this.panel.onDidDispose(() => this.dispose()),

			// Register a callback that is called when the view is shown or hidden
			this.panel.onDidChangeViewState(() => {
				this.onDidChangeVisibility(this.panel.visible);
			}),

			// Dispose the Webview Panel when disposed
			this.panel
		);

		// Initialize common functionality
		this.initializeCommon();
	}
}
