import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

function readNlsJson(filePath: string): Record<string, string> {
	return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, string>;
}

function getFileBundleMap(extensionPath: string, useZh: boolean): Record<string, string> {
	const base = readNlsJson(path.join(extensionPath, 'package.nls.json'));
	if (useZh) {
		const zhBundlePath = path.join(extensionPath, 'package.nls.zh.json');
		return fs.existsSync(zhBundlePath) ? { ...base, ...readNlsJson(zhBundlePath) } : base;
	}
	return base;
}

/**
 * Resolve strings shown in the Git Graph webview.
 * - `git-graph.language` **zh** / **en**: read `package.nls*.json` from disk (explicit override).
 * - **empty** (default): use `vscode.l10n.t`, same as the rest of the extension and the active VS Code / Language Pack locale.
 */
export function createWebviewNlsTranslator(
	extensionPath: string,
	gitGraphLanguageSetting: string
): (key: string) => string {
	const norm = gitGraphLanguageSetting.trim().toLowerCase();
	if (norm === 'zh') {
		const map = getFileBundleMap(extensionPath, true);
		return (key: string) => map[key] ?? key;
	}
	if (norm === 'en') {
		const map = getFileBundleMap(extensionPath, false);
		return (key: string) => map[key] ?? key;
	}
	return (key: string) => {
		// Check if VS Code language is Chinese (zh, zh-CN, zh-TW, etc.)
		const useZh = vscode.env.language.toLowerCase().startsWith('zh');
		const map = getFileBundleMap(extensionPath, useZh);
		const translated = map[key];
		if (translated !== undefined) {
			return translated;
		}
		// Fallback: try vscode.l10n.t
		const fromL10n = vscode.l10n.t(key);
		if (fromL10n !== key) {
			return fromL10n;
		}
		// Final fallback: return the key itself
		return key;
	};
}
