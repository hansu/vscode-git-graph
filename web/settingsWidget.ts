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
		this.widgetElem.innerHTML = '<h2>仓库设置</h2><div id="settingsContent"></div><div id="settingsLoading"></div><div id="settingsClose"></div>';
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
				: 'Show All';

			let html = '<div class="settingsSection general"><h3>常规</h3>' +
				'<table>' +
				'<tr class="lineAbove"><td class="left">名称:</td><td class="leftWithEllipsis" title="' + escapedRepoName + (this.repo.name === null ? ' (文件系统默认名称)' : '') + '">' + escapedRepoName + '</td><td class="btns right"><div id="editRepoName" title="编辑名称' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (this.repo.name !== null ? ' <div id="deleteRepoName" title="删除名称' + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
				'<tr class="lineAbove lineBelow"><td class="left">初始分支:</td><td class="leftWithEllipsis" title="' + initialBranchesStr + ' (' + (initialBranchesLocallyConfigured ? '本地' : '全局') + ')">' + initialBranchesStr + '</td><td class="btns right"><div id="editInitialBranches" title="编辑初始分支' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div>' + (initialBranchesLocallyConfigured ? ' <div id="clearInitialBranches" title="清除初始分支' + ELLIPSIS + '">' + SVG_ICONS.close + '</div>' : '') + '</td></tr>' +
				'</table>' +
				'<label id="settingsShowStashes"><input type="checkbox" id="settingsShowStashesCheckbox" tabindex="-1"><span class="customCheckbox"></span>显示贮藏</label><br/>' +
				'<label id="settingsShowTags"><input type="checkbox" id="settingsShowTagsCheckbox" tabindex="-1"><span class="customCheckbox"></span>显示标签</label><br/>' +
				'<label id="settingsIncludeCommitsMentionedByReflogs"><input type="checkbox" id="settingsIncludeCommitsMentionedByReflogsCheckbox" tabindex="-1"><span class="customCheckbox"></span>包含仅在引用日志中提及的提交</label><span class="settingsWidgetInfo" title="仅在显示所有分支时适用。">' + SVG_ICONS.info + '</span><br/>' +
				'<label id="settingsOnlyFollowFirstParent"><input type="checkbox" id="settingsOnlyFollowFirstParentCheckbox" tabindex="-1"><span class="customCheckbox"></span>仅跟随提交的第一个父提交</label><span class="settingsWidgetInfo" title="发现要加载的提交时，不跟随所有父提交，仅跟随第一个父提交。">' + SVG_ICONS.info + '</span>' +
				'</div>';

			let userNameSet = false, userEmailSet = false;
			if (this.config !== null) {
				html += '<div class="settingsSection centered"><h3>用户详情</h3>';
				const userName = this.config.user.name, userEmail = this.config.user.email;
				userNameSet = userName.local !== null || userName.global !== null;
				userEmailSet = userEmail.local !== null || userEmail.global !== null;
				if (userNameSet || userEmailSet) {
					const escapedUserName = escapeHtml(userName.local ?? userName.global ?? '未设置');
					const escapedUserEmail = escapeHtml(userEmail.local ?? userEmail.global ?? '未设置');
					html += '<table>' +
						'<tr><td class="left">用户名:</td><td class="leftWithEllipsis" title="' + escapedUserName + (userNameSet ? ' (' + (userName.local !== null ? '本地' : '全局') + ')' : '') + '">' + escapedUserName + '</td></tr>' +
						'<tr><td class="left">用户邮箱:</td><td class="leftWithEllipsis" title="' + escapedUserEmail + (userEmailSet ? ' (' + (userEmail.local !== null ? '本地' : '全局') + ')' : '') + '">' + escapedUserEmail + '</td></tr>' +
						'</table>' +
						'<div class="settingsSectionButtons"><div id="editUserDetails" class="editBtn">' + SVG_ICONS.pencil + '编辑</div><div id="removeUserDetails" class="removeBtn">' + SVG_ICONS.close + '移除</div></div>';
				} else {
					html += '<span>用户详情（如名称和邮箱）由Git用于记录提交对象的作者和提交者。</span>' +
						'<div class="settingsSectionButtons"><div id="editUserDetails" class="addBtn">' + SVG_ICONS.plus + '添加用户详情</div></div>';
				}
				html += '</div>';


				html += '<div class="settingsSection"><h3>远程配置</h3><table><tr><th>远程</th><th>URL</th><th>类型</th><th>操作</th></tr>';
				if (this.config.remotes.length > 0) {
					const hideRemotes = this.repo.hideRemotes;
					this.config.remotes.forEach((remote, i) => {
						const hidden = hideRemotes.includes(remote.name);
						const fetchUrl = escapeHtml(remote.url || '未设置'), pushUrl = escapeHtml(remote.pushUrl || remote.url || '未设置');
						html += '<tr class="lineAbove">' +
							'<td class="left" rowspan="2"><span class="hideRemoteBtn" data-index="' + i + '" title="点击' + (hidden ? '显示' : '隐藏') + '此远程的分支。">' + (hidden ? SVG_ICONS.eyeClosed : SVG_ICONS.eyeOpen) + '</span>' + escapeHtml(remote.name) + '</td>' +
							'<td class="leftWithEllipsis" title="获取 URL: ' + fetchUrl + '">' + fetchUrl + '</td><td>获取</td>' +
							'<td class="btns remoteBtns" rowspan="2" data-index="' + i + '"><div class="fetchRemote" title="从远程获取' + ELLIPSIS + '">' + SVG_ICONS.download + '</div> <div class="pruneRemote" title="修剪远程' + ELLIPSIS + '">' + SVG_ICONS.branch + '</div><br><div class="editRemote" title="编辑远程' + ELLIPSIS + '">' + SVG_ICONS.pencil + '</div> <div class="deleteRemote" title="删除远程' + ELLIPSIS + '">' + SVG_ICONS.close + '</div></td>' +
							'</tr><tr><td class="leftWithEllipsis" title="推送 URL: ' + pushUrl + '">' + pushUrl + '</td><td>推送</td></tr>';
					});
				} else {
					html += '<tr class="lineAbove"><td colspan="4">此仓库未配置任何远程。</td></tr>';
				}
				html += '</table><div class="settingsSectionButtons lineAbove"><div id="settingsAddRemote" class="addBtn">' + SVG_ICONS.plus + '添加远程</div></div></div>';
			}

			html += '<div class="settingsSection centered"><h3>问题链接</h3>';
			const issueLinkingConfig = this.repo.issueLinkingConfig || globalState.issueLinkingConfig;
			if (issueLinkingConfig !== null) {
				const escapedIssue = escapeHtml(issueLinkingConfig.issue), escapedUrl = escapeHtml(issueLinkingConfig.url);
				html += '<table><tr><td class="left">问题正则表达式:</td><td class="leftWithEllipsis" title="' + escapedIssue + '">' + escapedIssue + '</td></tr><tr><td class="left">问题 URL:</td><td class="leftWithEllipsis" title="' + escapedUrl + '">' + escapedUrl + '</td></tr></table>' +
					'<div class="settingsSectionButtons"><div id="editIssueLinking" class="editBtn">' + SVG_ICONS.pencil + '编辑</div><div id="removeIssueLinking" class="removeBtn">' + SVG_ICONS.close + '移除</div></div>';
			} else {
				html += '<span>问题链接将提交和标签消息中的问题编号转换为超链接，在您的问题跟踪系统中打开问题。如果分支名称包含问题编号，可以通过分支的上下文菜单查看问题。</span>' +
					'<div class="settingsSectionButtons"><div id="editIssueLinking" class="addBtn">' + SVG_ICONS.plus + '添加问题链接</div></div>';
			}
			html += '</div>';

			if (this.config !== null) {
				html += '<div class="settingsSection centered"><h3>拉取请求创建</h3>';
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
					html += '<table><tr><td class="left">提供商:</td><td class="leftWithEllipsis" title="' + provider + '">' + provider + '</td></tr>' +
						'<tr><td class="left">源仓库:</td><td class="leftWithEllipsis" title="' + source + '">' + source + '</td></tr>' +
						'<tr><td class="left">目标仓库:</td><td class="leftWithEllipsis" title="' + destination + '">' + destination + '</td></tr>' +
						'<tr><td class="left">目标分支:</td><td class="leftWithEllipsis" title="' + destinationBranch + '">' + destinationBranch + '</td></tr></table>' +
						'<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="editBtn">' + SVG_ICONS.pencil + '编辑</div><div id="removePullRequestIntegration" class="removeBtn">' + SVG_ICONS.close + '移除</div></div>';
				} else {
					html += '<span>拉取请求创建自动化了拉取请求表单的打开和预填充，直接从分支的上下文菜单进行操作。</span>' +
						'<div class="settingsSectionButtons"><div id="editPullRequestIntegration" class="addBtn">' + SVG_ICONS.plus + '配置"拉取请求创建"集成</div></div>';
				}
				html += '</div>';
			}

			html += '<div class="settingsSection"><h3>Git Graph 配置</h3><div class="settingsSectionButtons">' +
				'<div id="openExtensionSettings">' + SVG_ICONS.gear + '打开 Git Graph 扩展设置</div><br/>' +
				'<div id="exportRepositoryConfig">' + SVG_ICONS.package + '导出仓库配置</div>' +
				'</div></div>';

			this.contentsElem.innerHTML = html;

			document.getElementById('editRepoName')!.addEventListener('click', () => {
				if (this.currentRepo === null || this.repo === null) return;
				dialog.showForm('为此仓库指定名称：', [
					{ type: DialogInputType.Text, name: '名称', default: this.repo.name || '', placeholder: getRepoName(this.currentRepo) }
				], '保存名称', (values) => {
					if (this.currentRepo === null) return;
					this.view.saveRepoStateValue(this.currentRepo, 'name', <string>values[0] || null);
					this.view.renderRepoDropdownOptions();
					this.render();
				}, null);
			});

			if (this.repo.name !== null) {
				document.getElementById('deleteRepoName')!.addEventListener('click', () => {
					if (this.currentRepo === null || this.repo === null || this.repo.name === null) return;
					dialog.showConfirmation('确定要删除为此仓库手动配置的名称 <b><i>' + escapeHtml(this.repo.name) + '</i></b>，并改用文件系统的默认名称 <b><i>' + escapeHtml(getRepoName(this.currentRepo)) + '</i></b> 吗？', '是，删除', () => {
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
				dialog.showForm('<b>配置初始分支</b><p style="margin:6px 0;">配置在Git图形视图中加载此存储库时最初显示的分支。</p><p style="font-size:12px; margin:6px 0 0 0;">注意：当"已检出分支"被禁用，且未选择任何"特定分支"时，将显示所有分支。</p>', [
					{ type: DialogInputType.Checkbox, name: '已检出分支', value: showCheckedOutBranch },
					{ type: DialogInputType.Select, name: '特定分支', options: this.view.getBranchOptions(), defaults: showSpecificBranches, multiple: true }
				], '保存配置', (values) => {
					if (this.currentRepo === null) return;
					if (showCheckedOutBranch !== values[0] || !arraysStrictlyEqualIgnoringOrder(showSpecificBranches, <string[]>values[1])) {
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowCheckedOutBranch', values[0] ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
						this.view.saveRepoStateValue(this.currentRepo, 'onRepoLoadShowSpecificBranches', <string[]>values[1]);
						this.render();
					}
				}, null, '取消', null, false);
			});

			if (initialBranchesLocallyConfigured) {
				document.getElementById('clearInitialBranches')!.addEventListener('click', () => {
					dialog.showConfirmation('确定要清除在Git图形视图中加载此存储库时最初显示的分支吗？', '是，清除', () => {
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
					dialog.showForm('设置Git用于记录提交对象的作者和提交者的用户名和电子邮件：', [
						{ type: DialogInputType.Text, name: '用户名', default: userName.local ?? userName.global ?? '', placeholder: null },
						{ type: DialogInputType.Text, name: '用户邮箱', default: userEmail.local ?? userEmail.global ?? '', placeholder: null },
						{ type: DialogInputType.Checkbox, name: '全局使用', value: userName.local === null && userEmail.local === null, info: '在所有Git存储库中全局使用此"用户名"和"用户邮箱"（可在每个存储库中覆盖）。' }
					], '设置用户详情', (values) => {
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
						dialog.showConfirmation('确定要移除 Git 用于记录提交作者与提交者的<b>' + (isGlobal ? '全局' : '本地') + '配置</b>用户名和邮箱吗？', '是，移除', () => {
							if (this.currentRepo === null) return;
							runAction({
								command: 'deleteUserDetails',
								repo: this.currentRepo,
								name: (isGlobal ? userName.global : userName.local) !== null,
								email: (isGlobal ? userEmail.global : userEmail.local) !== null,
								location: isGlobal ? GG.GitConfigLocation.Global : GG.GitConfigLocation.Local
							}, '移除用户信息');
						}, null);
					});
				}

				const pushUrlPlaceholder = '留空则使用获取 URL';
				document.getElementById('settingsAddRemote')!.addEventListener('click', () => {
					dialog.showForm('为此仓库添加远程仓库：', [
						{ type: DialogInputType.Text, name: '名称', default: '', placeholder: null },
						{ type: DialogInputType.Text, name: '获取 URL', default: '', placeholder: null },
						{ type: DialogInputType.Text, name: '推送 URL', default: '', placeholder: pushUrlPlaceholder },
						{ type: DialogInputType.Checkbox, name: '立即获取', value: true }
					], '添加远程', (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'addRemote', repo: this.currentRepo, name: <string>values[0], url: <string>values[1], pushUrl: <string>values[2] !== '' ? <string>values[2] : null, fetch: <boolean>values[3] }, '添加远程');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('editRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showForm('编辑远程仓库 <b><i>' + escapeHtml(remote.name) + '</i></b>：', [
						{ type: DialogInputType.Text, name: '名称', default: remote.name, placeholder: null },
						{ type: DialogInputType.Text, name: '获取 URL', default: remote.url !== null ? remote.url : '', placeholder: null },
						{ type: DialogInputType.Text, name: '推送 URL', default: remote.pushUrl !== null ? remote.pushUrl : '', placeholder: pushUrlPlaceholder }
					], '保存更改', (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'editRemote', repo: this.currentRepo, nameOld: remote.name, nameNew: <string>values[0], urlOld: remote.url, urlNew: <string>values[1] !== '' ? <string>values[1] : null, pushUrlOld: remote.pushUrl, pushUrlNew: <string>values[2] !== '' ? <string>values[2] : null }, '保存远程更改');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('deleteRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showConfirmation('确定要删除远程仓库 <b><i>' + escapeHtml(remote.name) + '</i></b> 吗？', '是，删除', () => {
						if (this.currentRepo === null) return;
						runAction({ command: 'deleteRemote', repo: this.currentRepo, name: remote.name }, '删除远程');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('fetchRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showForm('确定要从远程仓库 <b><i>' + escapeHtml(remote.name) + '</i></b> 获取吗？', [
						{ type: DialogInputType.Checkbox, name: '修剪', value: initialState.config.dialogDefaults.fetchRemote.prune, info: '在获取前，删除远程上不再存在的远程追踪引用。' },
						{ type: DialogInputType.Checkbox, name: '修剪标签', value: initialState.config.dialogDefaults.fetchRemote.pruneTags, info: '在获取前，删除远程上不再存在的本地标签。需要Git >= 2.17.0，并且需要启用"修剪"。' }
					], '是，获取', (values) => {
						if (this.currentRepo === null) return;
						runAction({ command: 'fetch', repo: this.currentRepo, name: remote.name, prune: <boolean>values[0], pruneTags: <boolean>values[1] }, '从远程获取');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('pruneRemote', 'click', (e) => {
					const remote = this.getRemoteForBtnEvent(e);
					if (remote === null) return;
					dialog.showConfirmation('确定要修剪远程仓库 <b><i>' + escapeHtml(remote.name) + '</i></b> 上不再存在的远程追踪引用吗？', '是，修剪', () => {
						if (this.currentRepo === null) return;
						runAction({ command: 'pruneRemote', repo: this.currentRepo, name: remote.name }, '修剪远程');
					}, { type: TargetType.Repo });
				});

				addListenerToClass('hideRemoteBtn', 'click', (e) => {
					if (this.currentRepo === null || this.repo === null || this.config === null) return;
					const source = <HTMLElement>(<Element>e.target).closest('.hideRemoteBtn')!;
					const remote = this.config.remotes[parseInt(source.dataset.index!)].name;
					const hideRemote = !this.repo.hideRemotes.includes(remote);
					source.title = '点击以' + (hideRemote ? '显示' : '隐藏') + '此远程仓库的分支。';
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
					dialog.showConfirmation('确定要移除' + (locallyConfigured ? (globalState.issueLinkingConfig !== null ? '此存储库中 <b>本地配置</b> 的' : '') + '问题链接' : 'Git Graph中 <b>全局配置</b> 的问题链接') + '吗？', '是，移除', () => {
						this.setIssueLinkingConfig(null, !locallyConfigured);
					}, null);
				});
			}

			if (this.config !== null) {
				document.getElementById('editPullRequestIntegration')!.addEventListener('click', () => {
					if (this.repo === null || this.config === null) return;

					if (this.config.remotes.length === 0) {
						dialog.showError('无法配置"拉取请求创建"集成', '配置"拉取请求创建"集成必须至少有一个远程仓库。当前存储库中没有远程仓库。', null, null);
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
						dialog.showConfirmation('确定要移除已配置的"拉取请求创建"集成吗？', '是，移除', () => {
							this.setPullRequestConfig(null);
						}, null);
					});
				}
			}

			document.getElementById('openExtensionSettings')!.addEventListener('click', () => {
				sendMessage({ command: 'openExtensionSettings' });
			});

			document.getElementById('exportRepositoryConfig')!.addEventListener('click', () => {
				dialog.showConfirmation('导出 Git Graph 仓库配置将生成一个可提交到此仓库的文件，以便其他协作者使用相同配置。', '是，导出', () => {
					if (this.currentRepo === null) return;
					runAction({ command: 'exportRepoConfig', repo: this.currentRepo }, '导出仓库配置');
				}, null);
			});
		}

		alterClass(this.widgetElem, CLASS_LOADING, this.loading);
		this.loadingElem.innerHTML = this.loading ? '<span>' + SVG_ICONS.loading + '加载中...</span>' : '';
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
		let html = '<b>' + (isEdit ? '编辑此仓库的问题链接' : '为此仓库添加问题链接') + '</b>';
		html += '<p style="font-size:12px; margin:6px 0;">以下示例将提交消息中的 <b>#123</b> 链接到 <b>https://github.com/mhutchie/repo/issues/123</b>：</p>';
		html += '<table style="display:inline-table; width:360px; text-align:left; font-size:12px; margin-bottom:2px;"><tr><td>问题正则：</td><td>#(\\d+)</td></tr><tr><td>问题 URL：</td><td>https://github.com/mhutchie/repo/issues/$1</td></tr></tbody></table>';

		if (!isEdit && defaultIssueRegex === null && defaultIssueUrl === null) {
			defaultIssueRegex = SettingsWidget.autoDetectIssueRegex(this.view.getCommits());
			if (defaultIssueRegex !== null) {
				html += '<p style="font-size:12px"><i>已根据此仓库提交消息自动检测并预填问题正则，请根据需要核对或修改。</i></p>';
			}
		}

		dialog.showForm(html, [
			{ type: DialogInputType.Text, name: '问题正则表达式', default: defaultIssueRegex !== null ? defaultIssueRegex : '', placeholder: null, info: '匹配您的问题编号的正则表达式，包含一个或多个捕获组 ( )，将被替换到"问题URL"中。' },
			{ type: DialogInputType.Text, name: '问题URL', default: defaultIssueUrl !== null ? defaultIssueUrl : '', placeholder: null, info: '您的问题跟踪系统中的问题URL，包含占位符 ($1, $2 等)，用于替换"问题正则表达式"中捕获的组。' },
			{ type: DialogInputType.Checkbox, name: '全局使用', value: defaultUseGlobally, info: '默认在所有存储库中使用此"问题正则表达式"和"问题URL"（可在每个存储库中覆盖）。注意：只有当相同的问题链接适用于大多数存储库时（例如使用JIRA或Pivotal Tracker时），"全局使用"才适用。' }
		], '保存', (values) => {
			let issueRegex = (<string>values[0]).trim(), issueUrl = (<string>values[1]).trim(), useGlobally = <boolean>values[2];
			let regExpParseError = null;
			try {
				if (issueRegex.indexOf('(') === -1 || issueRegex.indexOf(')') === -1) {
					regExpParseError = '正则表达式中未包含捕获组 ( )。';
				} else if (new RegExp(issueRegex, 'gu')) {
					regExpParseError = null;
				}
			} catch (e) {
				regExpParseError = (e as Error).message;
			}
			if (regExpParseError !== null) {
				dialog.showError('无效的问题正则表达式', regExpParseError, '返回', () => {
					this.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
				});
			} else if (!(/\$([1-9][0-9]*)/.test(issueUrl))) {
				dialog.showError('无效的问题URL', '问题URL不包含任何占位符 ($1, $2 等)，用于替换问题正则表达式中捕获的问题编号组件。', '返回', () => {
					this.showIssueLinkingDialog(issueRegex, issueUrl, useGlobally, isEdit);
				});
			} else {
				this.setIssueLinkingConfig({ issue: issueRegex, url: issueUrl }, useGlobally);
			}
		}, null, '取消', null, false);
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
		destRemoteOptions.push({ name: '非远程仓库', value: '-1' });

		dialog.showForm('配置"拉取请求创建"集成（步骤&nbsp;1/2）', [
			{
				type: DialogInputType.Select, name: '提供者',
				options: providerOptions, default: defaultProvider,
				info: '除了内置的公共托管拉取请求提供者外，还可以使用扩展设置"git-graph.customPullRequestProviders"配置自定义提供者（例如用于私有托管的拉取请求提供者）。'
			},
			{
				type: DialogInputType.Select, name: '源远程仓库',
				options: sourceRemoteOptions, default: sourceRemoteIndex.toString(),
				info: '对应于拉取请求源的远程仓库。'
			},
			{
				type: DialogInputType.Select, name: '目标远程仓库',
				options: destRemoteOptions, default: destRemoteIndex.toString(),
				info: '对应于拉取请求目标的远程仓库。'
			}
		], '下一步', (values) => {
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
		const destBranchInfo = '作为拉取请求目标/目的地的分支名称。';

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
			{ type: DialogInputType.Text, name: '主机根 URL', default: config.hostRootUrl, placeholder: null, info: '拉取请求提供方的主机根 URL（例如 https://github.com）。' },
			{ type: DialogInputType.Text, name: '源所有者', default: config.sourceOwner, placeholder: null, info: '作为拉取请求来源的仓库所有者。' },
			{ type: DialogInputType.Text, name: '源仓库', default: config.sourceRepo, placeholder: null, info: '作为拉取请求来源的仓库名称。' },
			{ type: DialogInputType.Text, name: '目标所有者', default: config.destOwner, placeholder: null, info: '作为拉取请求目标/目的地的仓库所有者。' },
			{ type: DialogInputType.Text, name: '目标仓库', default: config.destRepo, placeholder: null, info: '作为拉取请求目标/目的地的仓库名称。' }
		];
		if (config.provider === GG.PullRequestProvider.GitLab) {
			inputs.push({ type: DialogInputType.Text, name: '目标项目 ID', default: config.destProjectId, placeholder: null, info: '拉取请求目标在 GitLab 中的项目 ID。留空则使用 GitLab 中配置的默认目标。' });
		}
		inputs.push(config.destRemote === null || destBranches.length === 0
			? { type: DialogInputType.Text, name: '目标分支', default: config.destBranch, placeholder: null, info: destBranchInfo }
			: {
				type: DialogInputType.Select,
				name: '目标分支',
				options: destBranches.map((branch, index) => ({ name: branch, value: index.toString() })),
				default: destBranches.includes(config.destBranch) ? destBranches.indexOf(config.destBranch).toString() : '0',
				info: destBranchInfo
			}
		);

		dialog.showForm('配置"拉取请求创建"集成（步骤&nbsp;2/2）', inputs, '保存配置', (values) => {
			updateConfigWithFormValues(values);
			this.setPullRequestConfig(config);
		}, { type: TargetType.Repo }, '返回', (values) => {
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
