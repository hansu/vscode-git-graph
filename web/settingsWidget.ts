import { getText } from './utils';

interface SettingsWidgetState {
	readonly currentRepo: string | null;
	readonly scrollTop: number;
}

/**
 * Implements the Git Graph View's Settings Widget.
 */
class SettingsWidget {
	private readonly view: GitGraphView;

	private currentRepo: string | null = null;
	private repo: Readonly<GG.GitRepoState> | null = null;
	private config: Readonly<GG.GitRepoConfig> | null = null;
	private loading: boolean = false;
	private scrollTop: number = 0;

	private readonly widgetElem: HTMLElement;
	private readonly contentsElem: HTMLElement;
	private readonly loadingElem: HTMLElement;

	/**
	 * Construct a new SettingsWidget instance.
	 * @param view The Git Graph View that the SettingsWidget is for.
	 * @returns The SettingsWidget instance.
	 */
	constructor(view: GitGraphView) {
		this.view = view;

		this.widgetElem = document.createElement('div');
		this.widgetElem.id = 'settingsWidget';
		this.widgetElem.innerHTML = '<h2>' + getText('ui.repositorySettings') + '</h2><div id="settingsContent"></div><div id="settingsLoading"></div><div id="settingsClose"></div>';
		document.body.appendChild(this.widgetElem);

		observeElemScroll('settingsWidget', this.scrollTop, (scrollTop) => {
			this.scrollTop = scrollTop;
		}, () => {
			if (this.currentRepo !== null) {
				this.view.saveState();
			}
		});

		this.contentsElem = document.getElementById('settingsContent')!;
		this.loadingElem = document.getElementById('settingsLoading')!;

		const settingsClose = document.getElementById('settingsClose')!;
		settingsClose.innerHTML = SVG_ICONS.close;
		settingsClose.addEventListener('click', () => this.close());
	}

	/**
	 * Show the Settings Widget.
	 * @param currentRepo The repository that is currently loaded in the view.
	 * @param isInitialLoad Is this the initial load of the Setting Widget, or is it being shown when restoring a previous state.
	 * @param scrollTop The scrollTop the Settings Widget should initially be set to.
	 */
	public show(currentRepo: string, isInitialLoad: boolean = true, scrollTop: number = 0) {
		if (this.currentRepo !== null) return;
		this.currentRepo = currentRepo;
		this.scrollTop = scrollTop;
		alterClass(this.widgetElem, CLASS_TRANSITION, isInitialLoad);
		this.widgetElem.classList.add(CLASS_ACTIVE);
		this.view.saveState();
		this.refresh();
		if (isInitialLoad) {
			this.view.requestLoadConfig();
		}
	}

	/**
	 * Refresh the Settings Widget after an action affecting it's content has completed.
	 */
	public refresh() {
		if (this.currentRepo === null) return;
		this.repo = this.view.getRepoState(this.currentRepo);
		this.config = this.view.getRepoConfig();
		this.loading = this.view.isConfigLoading();
		this.render();
	}

	/**
	 * Close the Settings Widget, sliding it up out of view.
	 */
	public close() {
		if (this.currentRepo === null) return;
		this.currentRepo = null;
		this.repo = null;
		this.config = null;
		this.loading = false;
		this.widgetElem.classList.add(CLASS_TRANSITION);
		this.widgetElem.classList.remove(CLASS_ACTIVE);
		this.widgetElem.classList.remove(CLASS_LOADING);
		this.contentsElem.innerHTML = '';
		this.loadingElem.innerHTML = '';
		this.view.saveState();
	}


	/* State */

	/**
	 * Get the current state of the Settings Widget.
	 */
	public getState(): SettingsWidgetState {
		return {
			currentRepo: this.currentRepo,
			scrollTop: this.scrollTop
		};
	}

	/**
	 * Restore the Settings Widget to an existing state.
	 * @param state The previous Settings Widget state.
	 */
	public restoreState(state: SettingsWidgetState) {
		if (state.currentRepo === null) return;
		this.show(state.currentRepo, false, state.scrollTop);
	}

	/**
	 * Is the Settings Widget currently visible.
	 * @returns TRUE => The Settings Widget is visible, FALSE => The Settings Widget is not visible
	 */
	public isVisible() {
		return this.currentRepo !== null;
	}


	/* Render Methods */

	/**
	 * Render the Settings Widget.
	 */
	private render() {
		if (this.currentRepo !== null && this.repo !== null) {
			const escapedRepoName = escapeHtml(this.repo.name || getRepoName(this.currentRepo));

			const initialBranchesLocallyConfigured = this.repo.onRepoLoadShowCheckedOutBranch !== GG.BooleanOverride.Default || this.repo.onRepoLoadShowSpecificBranches !== null;
			const initialBranches: string[] = [];
			if (getOnRepoLoadShowCheckedOutBranch(this.repo.onRepoLoadShowCheckedOutBranch)) {
				initialBranches.push('Checked Out');
			}
			const branchOptions = this.view.getBranchOptions();
			getOnRepoLoadShowSpecificBranches(this.repo.onRepoLoadShowSpecificBranches).forEach((branch) => {
				const option = branchOptions.find((option) => option.value === branch);
				if (option) {
					initialBranches.push(option.name);
				}
			});
			const initialBranchesStr = initialBranches.length > 0
				? escapeHtml(formatCommaSeparatedList(initialBranches))
				: getText('ui.showAllBranches');

			let html = '<div class="settingsSection general"><h3>' + getText('ui.general') + '</h3>' +
				'<table>' +
				'<tr class="lineAbove"><td class="left">' + getText('ui.name') + ':</td><td class="leftWithEllipsis" title="' + escapedRepoName + (this.repo.name === null ? ' (' + getText('ui.fileSystemDefaultName') + ')' : '') + '">' + escapedRepoName + '</td><td class="btns right"><div id="editRepoName" title="' + getText('ui.editName') + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (this.repo.name !== null ? ' <div id="deleteRepoName" title="' + getText('ui.deleteName') + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
				'<tr class="lineAbove lineBelow"><td class="left">' + getText('ui.initialBranches') + ':</td><td class="leftWithEllipsis" title="' + initialBranchesStr + ' (' + (initialBranchesLocallyConfigured ? getText('ui.local') : getText('ui.global')) + ')">' + initialBranchesStr + '</td><td class="btns right"><div id="editInitialBranches" title="' + getText('ui.editInitialBranches') + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (initialBranchesLocallyConfigured ? ' <div id="clearInitialBranches" title="' + getText('ui.clearInitialBranches') + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
				'</table>' +
				'<label id="settingsShowStashes"><input type="checkbox" id="settingsShowStashesCheckbox" tabindex="-1"><span class="customCheckbox"></span>' + getText('ui.showStashes') + '</label><br/>' +
				'<label id="settingsShowTags"><input type="checkbox" id="settingsShowTagsCheckbox" tabindex="-1"><span class="customCheckbox"></span>' + getText('ui.showTags') + '</label><br/>' +
				'<label id="settingsIncludeCommitsMentionedByReflogs"><input type="checkbox" id="settingsIncludeCommitsMentionedByReflogsCheckbox" tabindex="-1"><span class="customCheckbox"></span>' + getText('ui.includeCommitsMentionedByReflogs') + '</label><span class="settingsWidgetInfo" title="' + getText('ui.onlyApplicableWhenShowingAllBranches') + '">' + SVG_ICONS.info + '</span><br/>' +
				'<label id="settingsOnlyFollowFirstParent"><input type="checkbox" id="settingsOnlyFollowFirstParentCheckbox" tabindex="-1"><span class="customCheckbox"></span>' + getText('ui.onlyFollowFirstParent') + '</label><span class="settingsWidgetInfo" title="' + getText('ui.whenDiscoveringCommitsToLoadDoNotFollowAllParentCommitsOnlyFollowTheFirstParentCommit') + '">' + SVG_ICONS.info + '</span>' +
				'</div>';

			let userNameSet = false, userEmailSet = false;
			if (this.config !== null) {
					html += '<div class="settingsSection centered"><h3>' + getText('ui.userDetails') + '</h3>';
					const userName = this.config.user.name, userEmail = this.config.user.email;
					userNameSet = userName.local !== null || userName.global !== null;
					userEmailSet = userEmail.local !== null || userEmail.global !== null;
					if (userNameSet || userEmailSet) {
						const escapedUserName = escapeHtml(userName.local ?? userName.global ?? getText('ui.notSet'));
						const escapedUserEmail = escapeHtml(userEmail.local ?? userEmail.global ?? getText('ui.notSet'));
						html += '<table>' +
							'<tr><td class="left">' + getText('ui.userName') + '</td><td class="leftWithEllipsis" title="' + escapedUserName + (userNameSet ? ' (' + (userName.local !== null ? getText('ui.local') : getText('ui.global')) + ')' : '') + '">' + escapedUserName + '</td></tr>' +
							'<tr><td class="left">' + getText('ui.userEmail') + '</td><td class="leftWithEllipsis" title="' + escapedUserEmail + (userEmailSet ? ' (' + (userEmail.local !== null ? getText('ui.local') : getText('ui.global')) + ')' : '') + '">' + escapedUserEmail + '</td></tr>' +
							'</table>' +
							'<div class="settingsSectionButtons"><div id="editUserDetails" class="editBtn">' + SVG_ICONS.pencil + getText('ui.edit') + '</div><div id="removeUserDetails" class="removeBtn">' + SVG_ICONS.close + getText('ui.remove') + '</div></div>';
					} else {
						html += '<span>' + getText('ui.userDetailsAreUsedByGitToRecordTheAuthorAndCommitterOfCommitObjects') + '</span>' +
						'<div class="settingsSectionButtons"><div id="editUserDetails" class="addBtn">' + SVG_ICONS.plus + getText('ui.addUserDetails') + '</div></div>';
					}
				html += '</div>';


				html += '<div class="settingsSection"><h3>' + getText('ui.remoteConfiguration') + '</h3><table><tr><th>' + getText('ui.remote') + '</th><th>' + getText('ui.url') + '</th><th>' + getText('ui.type') + '</th><th>' + getText('ui.actions') + '</th></tr>';
				if (this.config.remotes.length > 0) {
					const hideRemotes = this.repo.hideRemotes;
					this.config.remotes.forEach((remote, i) => {
						const hidden = hideRemotes.includes(remote.name);
						const fetchUrl = escapeHtml(remote.url || getText('ui.notSet')), pushUrl = escapeHtml(remote.pushUrl || remote.url || getText('ui.notSet'));
						html += '<tr class="lineAbove">' +
							'<td class="left" rowspan="2"><span class="hideRemoteBtn" data-index="' + i + '" title="' + (hidden ? getText('ui.clickToShowBranches') : getText('ui.clickToHideBranches')) + '">' + (hidden ? SVG_ICONS.eyeClosed : SVG_ICONS.eyeOpen) + '</span>' + escapeHtml(remote.name) + '</td>' +
							'<td class="leftWithEllipsis" title="' + getText('ui.fetchUrl') + fetchUrl + '">' + fetchUrl + '</td><td>' + getText('ui.fetch') + '</td>' +
							'<td class="btns remoteBtns" rowspan="2" data-index="' + i + '"><div class="fetchRemote" title="' + getText('ui.fetchFromRemote') + ELLIPSIS + '">' + SVG_ICONS.download + '</div> <div class="pruneRemote" title="' + getText('ui.pruneRemote') + ELLIPSIS + '">' + SVG_ICONS.branch + '</div><br><div class="editRemote" title="' + getText('ui.editRemote') + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div> <div class="deleteRemote" title="' + getText('ui.deleteRemote') + ELLIPSIS + '">' + SVG_ICONS.close + '</div></td>' +
							'</tr><tr><td class="leftWithEllipsis" title="' + getText('ui.pushUrl') + pushUrl + '">' + pushUrl + '</td><td>' + getText('ui.push') + '</td></tr>';
					});
				} else {
					html += '<tr class="lineAbove"><td colspan="4">' + getText('ui.noRemotesConfigured') + '</td></tr>';
				}
				html += '</table><div class="settingsSectionButtons lineAbove"><div id="settingsAddRemote" class="addBtn">' + SVG_ICONS.plus + getText('ui.addRemote') + '</div></div></div>';
			}

			html += '<div class="settingsSection centered"><h3>' + getText('ui.issueLinking') + '</h3>';
				const issueLinkingConfig = this.repo.issueLinkingConfig || globalState.issueLinkingConfig;
				if (issueLinkingConfig !== null) {
					const escapedIssue = escapeHtml(issueLinkingConfig.issue), escapedUrl = escapeHtml(issueLinkingConfig.url);
					html += '<table><tr><td class="left">' + getText('ui.issueRegex') + '</td><td class="leftWithEllipsis" title="' + escapedIssue + '">' + escapedIssue + '</td></tr><tr><td class="left">' + getText('ui.issueUrl') + '</td><td class="leftWithEllipsis" title="' + escapedUrl + '">' + escapedUrl + '</td></tr></table>' +
						'<div class="settingsSectionButtons"><div id="editIssueLinking" class="editBtn">' + SVG_ICONS.pencil + getText('ui.edit') + '</div><div id="removeIssueLinking" class="removeBtn">' + SVG_ICONS.close + getText('ui.remove') + '</div></div>';
				} else {
					html += '<span>' + getText('ui.issueLinkingConvertsIssueNumbersInCommitAndTagMessagesToHyperlinksThatOpenTheIssueInYourIssueTrackingSystemIfABranchNameContainsAnIssueNumberYouCanViewTheIssueViaTheBranchSContextMenu') + '</span>' +
					'<div class="settingsSectionButtons"><div id="editIssueLinking" class="addBtn">' + SVG_ICONS.plus + getText('ui.addIssueLinking') + '</div></div>';
				}
				html += '</div>';

			if (this.config !== null) {
					html += '<div class="settingsSection centered"><h3>' + getText('ui.pullRequestCreation') + '</h3>';
					const pullRequestConfig = this.repo.pullRequestConfig;
					if (pullRequestConfig !== null) {
						const provider = escapeHtml((pullRequestConfig.provider === GG.PullRequestProvider.Bitbucket
							? 'Bitbucket'
							: pullRequestConfig.provider === GG.PullRequestProvider.Custom
								? pullRequestConfig.custom.name
								: pullRequestConfig.provider === GG.PullRequestProvider.GitHub
									? 'GitHub'
									: 'GitLab'
						) + ' (' + pullRequestConfig.hostRootUrl + ')');
						const source = escapeHtml(pullRequestConfig.sourceOwner + '/' + pullRequestConfig.sourceRepo + ' (' + pullRequestConfig.sourceRemote + ')');
						const destination = escapeHtml(pullRequestConfig.destOwner + '/' + pullRequestConfig.destRepo + (pullRequestConfig.destRemote !== null ? ' (' + pullRequestConfig.destRemote + ')' : ''));
						const destinationBranch = escapeHtml(pullRequestConfig.destBranch);
						html += '<table><tr><td class="left">' + getText('ui.provider') + '</td><td class="leftWithEllipsis" title="' + provider + '">' + provider + '</td></tr>' +
							'<tr><td class="left">' + getText('ui.sourceRepository') + '</td><td class="leftWithEllipsis" title="' + source + '">' + source + '</td></tr>' +
							'<tr><td class="left">' + getText('ui.destinationRepository') + '</td><td class="leftWithEllipsis" title="' + destination + '">' + destination + '</td></tr>' +
							'<tr><td class="left">' + getText('ui.destinationBranch') + '</td><td class="leftWithEllipsis" title="' + destinationBranch + '">' + destinationBranch + '</td></tr></table>' +
							'<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="editBtn">' + SVG_ICONS.pencil + getText('ui.edit') + '</div><div id="removePullRequestIntegration" class="removeBtn">' + SVG_ICONS.close + getText('ui.remove') + '</div></div>';
					} else {
						html += '<span>' + getText('ui.pullRequestCreationAutomatesTheOpeningAndPreFillingOfPullRequestFormsDirectlyFromTheBranchSContextMenu') + '</span>' +
						'<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="addBtn">' + SVG_ICONS.plus + getText('ui.configurePullRequestIntegration') + '</div></div>';
					}
					html += '</div>';
				}

				html += '<div class="settingsSection"><h3>' + getText('ui.gitGraphConfiguration') + '</h3><div class="settingsSectionButtons">' +
					'<div id="openExtensionSettings">' + SVG_ICONS.gear + getText('ui.openGitGraphExtensionSettings') + '</div><br/>' +
					'<div id="exportRepositoryConfig">' + SVG_ICONS.package + getText('ui.exportRepositoryConfig') + '</div>' +
					'</div></div>';

			this.contentsElem.innerHTML = html;

			document.getElementById('editRepoName')!.addEventListener('click', () => {
				if (this.currentRepo === null || this.repo === null) return;
				dialog.showForm(getText('ui.specifyANameForThisRepository'), [
					{ type: DialogInputType.Text, name: getText('ui.name'), default: this.repo.name || '', placeholder: getRepoName(this.currentRepo) }
				], getText('ui.saveName'), (values) => {
					if (this.currentRepo === null) return;
					this.view.saveRepoStateValue(this.currentRepo, 'name', <string>values[0] || null);
					this.view.renderRepoDropdownOptions();
					this.render();
				}, null);
			});

			if (this.repo.name !== null) {
				document.getElementById('deleteRepoName')!.addEventListener('click', () => {
					if (this.currentRepo === null || this.repo === null || this.repo.name === null) return;
					dialog.showConfirmation(getText('ui.areYouSureYouWantToDeleteTheManuallyConfiguredNameForThisRepository') + ' <b><i>' + escapeHtml(this.repo.name) + '</i></b>，' + getText('ui.andUseTheFileSystemsDefaultName') + ' <b><i>' + escapeHtml(getRepoName(this.currentRepo)) + '</i></b>？', getText('ui.yesDelete'), () => {
						if (this.currentRepo === null) return;
						this.view.saveRepoStateValue(this.currentRepo, 'name', null);
						this.view.renderRepoDropdownOptions();
						this.render();
					}, null);
				});
			}

			document.getElementById('editInitialBranches')!.addEventListener('click', () => {
				if (this.repo === null) return;
				const showCheckedOutBranch = getOnRepoLoadShowCheckedOutBranch(this.repo.onRepoLoadShowCheckedOutBranch);
				const showSpecificBranches = getOnRepoLoadShowSpecificBranches(this.repo.onRepoLoadShowSpecificBranches);
				dialog.showForm('<b>' + getText('ui.configureInitialBranches') + '</b><p style="margin:6px 0;">' + getText('ui.configureInitialBranchesDescription') + '</p><p style="font-size:12px; margin:6px 0 0 0;">' + getText('ui.configureInitialBranchesNote') + '</p>', [
					{ type: DialogInputType.Checkbox, name: getText('ui.checkedOutBranch'), value: showCheckedOutBranch },
					{ type: DialogInputType.Select, name: getText('ui.specificBranches'), options: this.view.getBranchOptions(), defaults: showSpecificBranches, multiple: true }
				], getText('ui.saveConfiguration'), (values) => {
					if (this.currentRepo === null) return;
					if (showCheckedOutBranch !== values[0] || !arraysStrictlyEqualIgnoringOrder(showSpecificBranches, <string[]>values[1])) {
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowCheckedOutBranch', values[0] ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowSpecificBranches', <string[]>values[1]);
						this.render();
						}
					}, null, getText('ui.cancel'), null, false);
			});

			if (initialBranchesLocallyConfigured) {
				document.getElementById('clearInitialBranches')!.addEventListener('click', () => {
					dialog.showConfirmation(getText('ui.areYouSureYouWantToClearTheBranchesInitiallyShownWhenLoadingThisRepositoryInTheGitGraphView'), getText('ui.yesClear'), () => {
						if (this.currentRepo === null) return;
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowCheckedOutBranch', GG.BooleanOverride.Default);
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowSpecificBranches', null);
						this.render();
					}, null);
				});
			}

			const showStashesElem = <HTMLInputElement>document.getElementById('settingsShowStashesCheckbox');
			showStashesElem.checked = getShowStashes(this.repo.showStashes);
			showStashesElem.addEventListener('change', () => {
				if (this.currentRepo === null) return;
				const elem = <HTMLInputElement | null>document.getElementById('settingsShowStashesCheckbox');
				if (elem === null) return;
				this.view.saveRepoStateValue(this.currentRepo, 'showStashes', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
				this.view.refresh(true);
			});

			const showTagsElem = <HTMLInputElement>document.getElementById('settingsShowTagsCheckbox');
			showTagsElem.checked = getShowTags(this.repo.showTags);
			showTagsElem.addEventListener('change', () => {
				if (this.currentRepo === null) return;
				const elem = <HTMLInputElement | null>document.getElementById('settingsShowTagsCheckbox');
				if (elem === null) return;
				this.view.saveRepoStateValue(this.currentRepo, 'showTags', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
				this.view.refresh(true);
			});

			const includeCommitsMentionedByReflogsElem = <HTMLInputElement>document.getElementById('settingsIncludeCommitsMentionedByReflogsCheckbox');
			includeCommitsMentionedByReflogsElem.checked = getIncludeCommitsMentionedByReflogs(this.repo.includeCommitsMentionedByReflogs);
			includeCommitsMentionedByReflogsElem.addEventListener('change', () => {
				if (this.currentRepo === null) return;
				const elem = <HTMLInputElement | null>document.getElementById('settingsIncludeCommitsMentionedByReflogsCheckbox');
				if (elem === null) return;
				this.view.saveRepoStateValue(this.currentRepo, 'includeCommitsMentionedByReflogs', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
				this.view.refresh(true);
			});

			const settingsOnlyFollowFirstParentElem = <HTMLInputElement>document.getElementById('settingsOnlyFollowFirstParentCheckbox');
			settingsOnlyFollowFirstParentElem.checked = getOnlyFollowFirstParent(this.repo.onlyFollowFirstParent);
			settingsOnlyFollowFirstParentElem.addEventListener('change', () => {
				if (this.currentRepo === null) return;
				const elem = <HTMLInputElement | null>document.getElementById('settingsOnlyFollowFirstParentCheckbox');
				if (elem === null) return;
				this.view.saveRepoStateValue(this.currentRepo, 'onlyFollowFirstParent', elem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
				this.view.refresh(true);
			});

			if (this.config !== null) {
				document.getElementById('editUserDetails')!.addEventListener('click', () => {
					if (this.config === null) return;
					const userName = this.config.user.name, userEmail = this.config.user.email;
					dialog.showForm(getText('ui.setTheUsernameAndEmailThatGitUsesToRecordTheAuthorAndCommitterOfCommitObjects'), [
					{ type: DialogInputType.Text, name: getText('ui.userName'), default: userName.local ?? userName.global ?? '', placeholder: null },
					{ type: DialogInputType.Text, name: getText('ui.userEmail'), default: userEmail.local ?? userEmail.global ?? '', placeholder: null },
					{ type: DialogInputType.Checkbox, name: getText('ui.useGlobally'), value: userName.local === null && userEmail.local === null, info: getText('ui.useGloballyDescription') }
				], getText('ui.setUserDetails'), (values) => {
						if (this.currentRepo === null) return;
						const useGlobally = <boolean>values[2];
						runAction({
							command: 'editUserDetails',
							repo: this.currentRepo,
							name: <string>values[0],
							email: <string>values[1],
							location: useGlobally ? GG.GitConfigLocation.Global : GG.GitConfigLocation.Local,
							deleteLocalName: useGlobally && userName.local !== null,
							deleteLocalEmail: useGlobally && userEmail.local !== null
						}, 'Setting User Details');
					}, null);
				});

				if (userNameSet || userEmailSet) {
					document.getElementById('removeUserDetails')!.addEventListener('click', () => {
						if (this.config === null) return;
						const userName = this.config.user.name, userEmail = this.config.user.email;
						const isGlobal = userName.local === null && userEmail.local === null;
						dialog.showConfirmation(getText('ui.areYouSureYouWantToRemoveThe') + '<b>' + (isGlobal ? getText('ui.global') : getText('ui.local')) + getText('ui.configurationThatGitUsesToRecordTheAuthorAndCommitterOfCommits') + '？', getText('ui.yesRemove'), () => {
							if (this.currentRepo === null) return;
							runAction({
								command: 'deleteUserDetails',
								repo: this.currentRepo,
								name: (isGlobal ? userName.global : userName.local) !== null,
								email: (isGlobal ? userEmail.global : userEmail.local) !== null,
								location: isGlobal ? GG.GitConfigLocation.Global : GG.GitConfigLocation.Local
							}, getText('ui.removeUserDetails'));
						}, null);
					});
				}

				const pushUrlPlaceholder = getText('ui.leaveBlankToUseFetchUrl');
				document.getElementById('settingsAddRemote')!.addEventListener('click', () => {
					dialog.showForm(getText('ui.addARemoteRepositoryToThisRepository'), [
					{ type: DialogInputType.Text, name: getText('ui.name'), default: '', placeholder: null },
					{ type: DialogInputType.Text, name: getText('ui.fetchUrl'), default: '', placeholder: null },
					{ type: DialogInputType.Text, name: getText('ui.pushUrl'), default: '', placeholder: pushUrlPlaceholder },
					{ type: DialogInputType.Checkbox, name: getText('ui.fetchImmediately'), value: true }
				], getText('ui.addRemote'), (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'addRemote', repo: this.currentRepo, name: <string>values[0], url: <string>values[1], pushUrl: <string>values[2] !== '' ? <string>values[2] : null, fetch: <boolean>values[3] }, getText('ui.addingRemote'));
					}, { type: TargetType.Repo });
				});

				addListenerToClass('editRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showForm(getText('ui.editRemoteRepository') + ' <b><i>' + escapeHtml(remote.name) + '</i></b>：', [
					{ type: DialogInputType.Text, name: getText('ui.name'), default: remote.name, placeholder: null },
					{ type: DialogInputType.Text, name: getText('ui.fetchUrl'), default: remote.url !== null ? remote.url : '', placeholder: null },
					{ type: DialogInputType.Text, name: getText('ui.pushUrl'), default: remote.pushUrl !== null ? remote.pushUrl : '', placeholder: pushUrlPlaceholder }
				], getText('ui.saveChanges'), (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'editRemote', repo: this.currentRepo, nameOld: remote.name, nameNew: <string>values[0], urlOld: remote.url, urlNew: <string>values[1] !== '' ? <string>values[1] : null, pushUrlOld: remote.pushUrl, pushUrlNew: <string>values[2] !== '' ? <string>values[2] : null }, getText('ui.savingRemoteChanges'));
					}, { type: TargetType.Repo });
				});

				addListenerToClass('deleteRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showConfirmation(getText('ui.areYouSureYouWantToDeleteTheRemoteRepository') + ' <b><i>' + escapeHtml(remote.name) + '</i></b>？', getText('ui.yesDelete'), () => {
						if (this.currentRepo === null) return;
						runAction({ command: 'deleteRemote', repo: this.currentRepo, name: remote.name }, getText('ui.deletingRemote'));
					}, { type: TargetType.Repo });
				});

				addListenerToClass('fetchRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showForm(getText('ui.areYouSureYouWantToFetchFromTheRemoteRepository') + ' <b><i>' + escapeHtml(remote.name) + '</i></b>？', [
					{ type: DialogInputType.Checkbox, name: getText('ui.prune'), value: initialState.config.dialogDefaults.fetchRemote.prune, info: getText('ui.beforeFetchDeleteRemoteTrackingReferencesThatNoLongerExistOnTheRemote') },
					{ type: DialogInputType.Checkbox, name: getText('ui.pruneTags'), value: initialState.config.dialogDefaults.fetchRemote.pruneTags, info: getText('ui.pruneTagsDescription') }
				], getText('ui.yesFetch'), (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'fetch', repo: this.currentRepo, name: remote.name, prune: <boolean>values[0], pruneTags: <boolean>values[1] }, getText('ui.fetchingFromRemote'));
					}, { type: TargetType.Repo });
				});

				addListenerToClass('pruneRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showConfirmation(getText('ui.areYouSureYouWantToPruneRemoteTrackingReferencesThatNoLongerExistOnTheRemoteRepository') + ' <b><i>' + escapeHtml(remote.name) + '</i></b>？', getText('ui.yesPrune'), () => {
						if (this.currentRepo === null) return;
						runAction({ command: 'pruneRemote', repo: this.currentRepo, name: remote.name }, getText('ui.pruningRemote'));
					}, { type: TargetType.Repo });
				});

				addListenerToClass('hideRemoteBtn', 'click', (e) => {
					if (this.currentRepo === null || this.repo === null || this.config === null) return;
					const source = <HTMLElement>(<Element>e.target).closest('.hideRemoteBtn')!;
					const remote = this.config.remotes[parseInt(source.dataset.index!)].name;
					const hideRemote = !this.repo.hideRemotes.includes(remote);
					source.title = getText('ui.clickTo') + (hideRemote ? getText('ui.show') : getText('ui.hide')) + getText('ui.theBranchesForThisRemoteRepository');
					source.innerHTML = hideRemote ? SVG_ICONS.eyeClosed : SVG_ICONS.eyeOpen;
					if (hideRemote) {
						this.repo.hideRemotes.push(remote);
					} else {
						this.repo.hideRemotes.splice(this.repo.hideRemotes.indexOf(remote), 1);
					}
					this.view.saveRepoStateValue(this.currentRepo, 'hideRemotes', this.repo.hideRemotes);
					this.view.refresh(true);
				});
			}

			document.getElementById('editIssueLinking')!.addEventListener('click', () => {
				if (this.repo === null) return;
				const issueLinkingConfig = this.repo.issueLinkingConfig || globalState.issueLinkingConfig;
				if (issueLinkingConfig !== null) {
					this.showIssueLinkingDialog(issueLinkingConfig.issue, issueLinkingConfig.url, this.repo.issueLinkingConfig === null && globalState.issueLinkingConfig !== null, true);
				} else {
					this.showIssueLinkingDialog(null, null, false, false);
				}
			});

			if (this.repo.issueLinkingConfig !== null || globalState.issueLinkingConfig !== null) {
				document.getElementById('removeIssueLinking')!.addEventListener('click', () => {
					if (this.repo === null) return;
					const locallyConfigured = this.repo.issueLinkingConfig !== null;
					dialog.showConfirmation(getText('ui.areYouSureYouWantToRemove') + (locallyConfigured ? (globalState.issueLinkingConfig !== null ? getText('ui.theLocallyConfiguredInThisRepository') : '') + getText('ui.issueLinking') : getText('ui.theGloballyConfiguredIssueLinkingInGitGraph')) + '？', getText('ui.yesRemove'), () => {
						this.setIssueLinkingConfig(null, !locallyConfigured);
					}, null);
				});
			}

			if (this.config !== null) {
				document.getElementById('editPullRequestIntegration')!.addEventListener('click', () => {
					if (this.repo === null || this.config === null) return;

					if (this.config.remotes.length === 0) {
						dialog.showError(getText('ui.cannotConfigurePullRequestIntegration'), getText('ui.cannotConfigurePullRequestIntegrationDescription'), null, null);
						return;
					}

					let config: GG.DeepWriteable<GG.PullRequestConfig>;
					if (this.repo.pullRequestConfig === null) {
						let originIndex = this.config.remotes.findIndex((remote) => remote.name === 'origin');
						let sourceRemoteUrl = this.config.remotes[originIndex > -1 ? originIndex : 0].url;
						let provider: GG.PullRequestProvider;
						if (sourceRemoteUrl !== null) {
							if (sourceRemoteUrl.match(/^(https?:\/\/|git@)[^/]*github/) !== null) {
								provider = GG.PullRequestProvider.GitHub;
							} else if (sourceRemoteUrl.match(/^(https?:\/\/|git@)[^/]*gitlab/) !== null) {
								provider = GG.PullRequestProvider.GitLab;
							} else {
								provider = GG.PullRequestProvider.Bitbucket;
							}
						} else {
							provider = GG.PullRequestProvider.Bitbucket;
						}
						config = {
							provider: provider, hostRootUrl: '',
							sourceRemote: '', sourceOwner: '', sourceRepo: '',
							destRemote: '', destOwner: '', destRepo: '', destProjectId: '', destBranch: '',
							custom: null
						};
					} else {
						config = Object.assign({}, this.repo.pullRequestConfig);
					}
					this.showCreatePullRequestIntegrationDialog1(config);
				});

				if (this.repo.pullRequestConfig !== null) {
					document.getElementById('removePullRequestIntegration')!.addEventListener('click', () => {
						dialog.showConfirmation(getText('ui.confirmRemovePullRequestIntegration'), getText('ui.yesRemove'), () => {
							this.setPullRequestConfig(null);
						}, null);
					});
				}
			}

			document.getElementById('openExtensionSettings')!.addEventListener('click', () => {
				sendMessage({ command: 'openExtensionSettings' });
			});

			document.getElementById('exportRepositoryConfig')!.addEventListener('click', () => {
				dialog.showConfirmation(getText('ui.exportingGitGraphRepositoryConfigurationWillGenerateAFileThatCanBeCommittedToThisRepositorySoThatOtherCollaboratorsCanUseTheSameConfiguration'), getText('ui.yesExport'), () => {
					if (this.currentRepo === null) return;
					runAction({ command: 'exportRepoConfig', repo: this.currentRepo }, getText('ui.exportingRepositoryConfiguration'));
				}, null);
			});
		}

		alterClass(this.widgetElem, CLASS_LOADING, this.loading);
		this.loadingElem.innerHTML = this.loading ? '<span>' + SVG_ICONS.loading + getText('ui.loading') + '</span>' : '';
		this.widgetElem.scrollTop = this.scrollTop;
		this.loadingElem.style.top = (this.scrollTop + (this.widgetElem.clientHeight / 2) - 12) + 'px';
	}


	/* Private Helper Methods */

	/**
	 * Save the issue linking configuration for this repository, and refresh the view so these changes are taken into affect.
	 * @param config The issue linking configuration to save.
	 * @param global Should this configuration be set globally for all repositories, or locally for this specific repository.
	 */
	private setIssueLinkingConfig(config: GG.IssueLinkingConfig | null, global: boolean) {
		if (this.currentRepo === null || this.repo === null) return;

		if (global) {
			if (this.repo.issueLinkingConfig !== null) {
				this.view.saveRepoStateValue(this.currentRepo, 'issueLinkingConfig', null);
			}
			updateGlobalViewState('issueLinkingConfig', config);
		} else {
			this.view.saveRepoStateValue(this.currentRepo, 'issueLinkingConfig', config);
		}

		this.view.refresh(true);
		this.render();
	}

	/**
	 * Save the pull request configuration for this repository.
	 * @param config The pull request configuration to save.
	 */
	private setPullRequestConfig(config: GG.PullRequestConfig | null) {
		if (this.currentRepo === null) return;
		this.view.saveRepoStateValue(this.currentRepo, 'pullRequestConfig', config);
		this.render();
	}

	/**
	 * Show the dialog allowing the user to configure the issue linking for this repository.
	 * @param defaultIssueRegex The default regular expression used to match issue numbers.
	 * @param defaultIssueUrl The default URL for the issue number to be substituted into.
	 * @param defaultUseGlobally The default value for the checkbox determining whether the issue linking configuration should be used globally (for all repositories).
	 * @param isEdit Is the dialog editing an existing issue linking configuration.
	 */
	private showIssueLinkingDialog(defaultIssueRegex: string | null, defaultIssueUrl: string | null, defaultUseGlobally: boolean, isEdit: boolean) {
		let html = '<b>' + (isEdit ? getText('ui.editIssueLinkingForThisRepository') : getText('ui.addIssueLinkingForThisRepository')) + '</b>';
		html += '<p style="font-size:12px; margin:6px 0;">' + getText('ui.theFollowingExampleWillLink') + ' <b>#123</b> ' + getText('ui.inCommitMessagesTo') + ' <b>https://github.com/mhutchie/repo/issues/123</b>：</p>';
		html += '<table style="display:inline-table; width:360px; text-align:left; font-size:12px; margin-bottom:2px;"><tr><td>' + getText('ui.issueRegex') + '：</td><td>#(\d+)</td></tr><tr><td>' + getText('ui.issueUrl') + '：</td><td>https://github.com/mhutchie/repo/issues/$1</td></tr></tbody></table>';

		if (!isEdit && defaultIssueRegex === null && defaultIssueUrl === null) {
			defaultIssueRegex = SettingsWidget.autoDetectIssueRegex(this.view.getCommits());
			if (defaultIssueRegex !== null) {
				html += '<p style="font-size:12px"><i>' + getText('ui.theIssueRegexHasBeenAutomaticallyDetectedFromTheCommitMessagesInThisRepositoryAndPreFilledPleaseReviewAndModifyIfNecessary') + '</i></p>';
			}
		}

		dialog.showForm(html, [
			{ type: DialogInputType.Text, name: getText('ui.issueRegex'), default: defaultIssueRegex !== null ? defaultIssueRegex : '', placeholder: null, info: getText('ui.aRegularExpressionThatMatchesYourIssueNumbersContainingOneOrMoreCapturingGroupsThatWillBeSubstitutedIntoTheIssueUrl') },
			{ type: DialogInputType.Text, name: getText('ui.issueUrl'), default: defaultIssueUrl !== null ? defaultIssueUrl : '', placeholder: null, info: getText('ui.issueUrlDescription') },
				{ type: DialogInputType.Checkbox, name: getText('ui.useGloballyIssueLinking'), value: defaultUseGlobally, info: getText('ui.useGloballyIssueLinkingDescription') }
		], getText('ui.save'), (values) => {
			let issueRegex = (<string>values[0]).trim(), issueUrl = (<string>values[1]).trim(), useGlobally = <boolean>values[2];
			let regExpParseError = null;
			try {
				if (issueRegex.indexOf('(') === -1 || issueRegex.indexOf(')') === -1) {
					regExpParseError = getText('ui.theRegularExpressionDoesNotContainAnyCapturingGroups');
				} else if (new RegExp(issueRegex, 'gu')) {
					regExpParseError = null;
				}
			} catch (e) {
				regExpParseError = (e as Error).message;
			}
			if (regExpParseError !== null) {
				dialog.showError(getText('ui.invalidIssueRegex'), regExpParseError, getText('ui.return'), () => {
					this.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
				});
			} else if (!(/\$([1-9][0-9]*)/.test(issueUrl))) {
				dialog.showError(getText('ui.invalidIssueUrl'), getText('ui.theIssueUrlDoesNotContainAnyPlaceholdersForReplacingTheIssueNumberComponentsCapturedByTheIssueRegex'), getText('ui.return'), () => {
					this.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
				});
			} else {
				this.setIssueLinkingConfig({ issue: issueRegex, url: issueUrl }, useGlobally);
			}
		}, null, getText('ui.cancel'), null, false);
	}

	/**
	 * Show the first dialog for configuring the pull request integration.
	 * @param config The pull request configuration.
	 */
	private showCreatePullRequestIntegrationDialog1(config: GG.DeepWriteable<GG.PullRequestConfig>) {
		if (this.config === null) return;

		let originIndex = this.config.remotes.findIndex((remote) => remote.name === 'origin');
		let upstreamIndex = this.config.remotes.findIndex((remote) => remote.name === 'upstream');
		let sourceRemoteIndex = this.config.remotes.findIndex((remote) => remote.name === config.sourceRemote);
		let destRemoteIndex = this.config.remotes.findIndex((remote) => remote.name === config.destRemote);

		if (config.sourceRemote === '' || sourceRemoteIndex === -1) {
			sourceRemoteIndex = originIndex > -1 ? originIndex : 0;
		}
		if (config.destRemote === '') {
			destRemoteIndex = upstreamIndex > -1 ? upstreamIndex : originIndex > -1 ? originIndex : 0;
		}

		let defaultProvider = config.provider.toString();
		let providerOptions = [
			{ name: 'Bitbucket', value: (GG.PullRequestProvider.Bitbucket).toString() },
			{ name: 'GitHub', value: (GG.PullRequestProvider.GitHub).toString() },
			{ name: 'GitLab', value: (GG.PullRequestProvider.GitLab).toString() }
		];
		let providerTemplateLookup: { [name: string]: string } = {};
		initialState.config.customPullRequestProviders.forEach((provider) => {
			providerOptions.push({ name: provider.name, value: (providerOptions.length + 1).toString() });
			providerTemplateLookup[provider.name] = provider.templateUrl;
		});
		if (config.provider === GG.PullRequestProvider.Custom) {
			if (!providerOptions.some((provider) => provider.name === config.custom.name)) {
				// The existing custom Pull Request provider no longer exists, so add it.
				providerOptions.push({ name: config.custom.name, value: (providerOptions.length + 1).toString() });
				providerTemplateLookup[config.custom.name] = config.custom.templateUrl;
			}
			defaultProvider = providerOptions.find((provider) => provider.name === config.custom.name)!.value;
		}
		providerOptions.sort((a, b) => a.name.localeCompare(b.name));

		let sourceRemoteOptions = this.config.remotes.map((remote, index) => ({ name: remote.name, value: index.toString() }));
		let destRemoteOptions = sourceRemoteOptions.map((option) => option);
		destRemoteOptions.push({ name: getText('ui.nonRemoteRepository'), value: '-1' });

		dialog.showForm(getText('ui.configurePullRequestCreationStep1'), [
			{
						type: DialogInputType.Select, name: getText('ui.provider'),
						options: providerOptions, default: defaultProvider,
						info: getText('ui.inAdditionToTheBuiltInPubliclyHostedPullRequestProvidersYouCanConfigureCustomProvidersUsingTheExtensionSetting')
					},
			{
						type: DialogInputType.Select, name: getText('ui.sourceRemoteRepository'),
						options: sourceRemoteOptions, default: sourceRemoteIndex.toString(),
						info: getText('ui.correspondsToTheRemoteRepositoryForTheSourceOfThePullRequest')
					},
			{
						type: DialogInputType.Select, name: getText('ui.destinationRemoteRepository'),
						options: destRemoteOptions, default: destRemoteIndex.toString(),
						info: getText('ui.correspondsToTheRemoteRepositoryForTheDestinationOfThePullRequest')
					}
		], getText('ui.nextStep'), (values) => {
			if (this.config === null) return;

			let newProvider = <GG.PullRequestProvider>parseInt(<string>values[0]);
			if (newProvider > 3) newProvider = GG.PullRequestProvider.Custom;

			const newSourceRemoteIndex = parseInt(<string>values[1]);
			const newDestRemoteIndex = parseInt(<string>values[2]);
			const newSourceRemote = this.config.remotes[newSourceRemoteIndex].name;
			const newDestRemote = newDestRemoteIndex > -1 ? this.config.remotes[newDestRemoteIndex].name : null;
			const newSourceUrl = this.config.remotes[newSourceRemoteIndex].url;
			const newDestUrl = newDestRemoteIndex > -1 ? this.config.remotes[newDestRemoteIndex].url : null;

			if (config.hostRootUrl === '' || config.provider !== newProvider) {
				const remoteUrlForHost = newSourceUrl !== null ? newSourceUrl : newDestUrl;
				if (remoteUrlForHost !== null) {
					const match = remoteUrlForHost.match(/^(https?:\/\/|git@)((?=[^/]+@)[^@]+@|(?![^/]+@))([^/:]+)/);
					config.hostRootUrl = match !== null ? 'https://' + match[3] : '';
				} else {
					config.hostRootUrl = '';
				}
			}

			if (newProvider === GG.PullRequestProvider.Custom) {
				const customProviderName = providerOptions.find((provider) => provider.value === <string>values[0])!.name;
				config.custom = { name: customProviderName, templateUrl: providerTemplateLookup[customProviderName] };
			} else {
				config.custom = null;
			}
			config.provider = newProvider;

			if (config.sourceRemote !== newSourceRemote) {
				config.sourceRemote = newSourceRemote;
				const match = newSourceUrl !== null ? newSourceUrl.match(/^(https?:\/\/|git@)[^/:]+[/:]([^/]+)\/([^/]*?)(.git|)$/) : null;
				config.sourceOwner = match !== null ? match[2] : '';
				config.sourceRepo = match !== null ? match[3] : '';
			}

			if (config.provider !== GG.PullRequestProvider.GitLab || config.destRemote !== newDestRemote) {
				config.destProjectId = '';
			}

			if (config.destRemote !== newDestRemote) {
				config.destRemote = newDestRemote;
				if (newDestRemote !== null) {
					const match = newDestUrl !== null ? newDestUrl.match(/^(https?:\/\/|git@)[^/:]+[/:]([^/]+)\/([^/]*?)(.git|)$/) : null;
					config.destOwner = match !== null ? match[2] : '';
					config.destRepo = match !== null ? match[3] : '';
					const branches = this.view.getBranches()
						.filter((branch) => branch.startsWith('remotes/' + newDestRemote + '/') && branch !== ('remotes/' + newDestRemote + '/HEAD'))
						.map((branch) => branch.substring(newDestRemote.length + 9));
					config.destBranch = branches.length > 0 ? branches.includes('master') ? 'master' : branches[0] : '';
				} else {
					config.destOwner = '';
					config.destRepo = '';
					config.destBranch = '';
				}
			}

			this.showCreatePullRequestIntegrationDialog2(config);
		}, { type: TargetType.Repo });
	}

	/**
	 * Show the second dialog for configuring the pull request integration.
	 * @param config The pull request configuration.
	 */
	private showCreatePullRequestIntegrationDialog2(config: GG.DeepWriteable<GG.PullRequestConfig>) {
		if (this.config === null) return;

		const destBranches = config.destRemote !== null
			? this.view.getBranches()
				.filter((branch) => branch.startsWith('remotes/' + config.destRemote + '/') && branch !== ('remotes/' + config.destRemote + '/HEAD'))
				.map((branch) => branch.substring(config.destRemote!.length + 9))
			: [];
		const destBranchInfo = getText('ui.theNameOfTheBranchThatIsTheTargetDestinationOfThePullRequest');

		const updateConfigWithFormValues = (values: DialogInputValue[]) => {
			const hostRootUri = <string>values[0];
			config.hostRootUrl = hostRootUri.endsWith('/') ? hostRootUri.substring(0, hostRootUri.length - 1) : hostRootUri;
			config.sourceOwner = <string>values[1];
			config.sourceRepo = <string>values[2];
			config.destOwner = <string>values[3];
			config.destRepo = <string>values[4];
			config.destProjectId = config.provider === GG.PullRequestProvider.GitLab ? <string>values[5] : '';
			const destBranch = <string>values[config.provider === GG.PullRequestProvider.GitLab ? 6 : 5];
			config.destBranch = config.destRemote === null || destBranches.length === 0
				? destBranch
				: destBranches[parseInt(destBranch)];
		};

		const inputs: DialogInput[] = [
					{ type: DialogInputType.Text, name: getText('ui.hostRootUrl'), default: config.hostRootUrl, placeholder: null, info: getText('ui.theRootUrlOfTheHostForThePullRequestProviderE') },
					{ type: DialogInputType.Text, name: getText('ui.sourceOwner'), default: config.sourceOwner, placeholder: null, info: getText('ui.theOwnerOfTheRepositoryThatIsTheSourceOfThePullRequest') },
					{ type: DialogInputType.Text, name: getText('ui.sourceRepo'), default: config.sourceRepo, placeholder: null, info: getText('ui.theNameOfTheRepositoryThatIsTheSourceOfThePullRequest') },
					{ type: DialogInputType.Text, name: getText('ui.destOwner'), default: config.destOwner, placeholder: null, info: getText('ui.theOwnerOfTheRepositoryThatIsTheTargetDestinationOfThePullRequest') },
					{ type: DialogInputType.Text, name: getText('ui.destRepo'), default: config.destRepo, placeholder: null, info: getText('ui.theNameOfTheRepositoryThatIsTheTargetDestinationOfThePullRequest') }
				];
		if (config.provider === GG.PullRequestProvider.GitLab) {
			inputs.push({ type: DialogInputType.Text, name: getText('ui.destProjectId'), default: config.destProjectId, placeholder: null, info: getText('ui.theProjectIdInGitLabForThePullRequestTargetLeaveBlankToUseTheDefaultTargetConfiguredInGitLab') });
		}
		inputs.push(config.destRemote === null || destBranches.length === 0
					? { type: DialogInputType.Text, name: getText('ui.destinationBranch'), default: config.destBranch, placeholder: null, info: destBranchInfo }
					: {
						type: DialogInputType.Select,
						name: getText('ui.destinationBranch'),
						options: destBranches.map((branch, index) => ({ name: branch, value: index.toString() })),
						default: destBranches.includes(config.destBranch) ? destBranches.indexOf(config.destBranch).toString() : '0',
						info: destBranchInfo
					}
				);

		dialog.showForm(getText('ui.configurePullRequestCreationStep2'), inputs, getText('ui.saveConfiguration'), (values) => {
			updateConfigWithFormValues(values);
			this.setPullRequestConfig(config);
		}, { type: TargetType.Repo }, getText('ui.return'), (values) => {
			updateConfigWithFormValues(values);
			this.showCreatePullRequestIntegrationDialog1(config);
		});
	}

	/**
	 * Get the remote details corresponding to a mouse event.
	 * @param e The mouse event.
	 * @returns The details of the remote.
	 */
	private getRemoteForBtnEvent(e: Event) {
		return this.config !== null
			? this.config.remotes[parseInt((<HTMLElement>(<Element>e.target).closest('.remoteBtns')!).dataset.index!)]
			: null;
	}

	/**
	 * Automatically detect common issue number formats in the specified commits, returning the most common.
	 * @param commits The commits to analyse.
	 * @returns The regular expression of the most likely issue number format.
	 */
	private static autoDetectIssueRegex(commits: ReadonlyArray<GG.GitCommit>) {
		const patterns = ['#(\\d+)', '^(\\d+)\\.(?=\\s|$)', '^(\\d+):(?=\\s|$)', '([A-Za-z]+-\\d+)'].map((pattern) => {
			const regexp = new RegExp(pattern);
			return {
				pattern: pattern,
				matches: commits.filter((commit) => regexp.test(commit.message)).length
			};
		}).sort((a, b) => b.matches - a.matches);

		if (patterns[0].matches > 0.1 * commits.length) {
			// If the most common pattern was matched in more than 10% of commits, return the pattern
			return patterns[0].pattern;
		}
		return null;
	}
}
