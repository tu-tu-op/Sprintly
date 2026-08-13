"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.START_SPRINT_LABEL = void 0;
exports.requestSessionStart = requestSessionStart;
exports.shouldPromptOnStartup = shouldPromptOnStartup;
exports.isSprintlyEnabled = isSprintlyEnabled;
exports.isAutoPromptEnabled = isAutoPromptEnabled;
exports.runConsentFlow = runConsentFlow;
const vscode = require("vscode");
const privacySettings_1 = require("./tracking/privacySettings");
exports.START_SPRINT_LABEL = '$(play) Start Sprint';
const STARTUP_PROMPT_MARKER = 'sprintly.startupPromptProcess';
async function requestSessionStart() {
    const choice = await vscode.window.showQuickPick([
        {
            label: 'Session tracking',
            kind: vscode.QuickPickItemKind.Separator,
            action: 'dismiss',
        },
        {
            label: exports.START_SPRINT_LABEL,
            description: 'Track this coding session',
            detail: 'Counts activity, agent usage, tokens, and build failures. Source code and command text stay private.',
            action: 'start',
            alwaysShow: true,
        },
        {
            label: '$(close) Not Now',
            description: 'Keep Sprintly idle',
            action: 'dismiss',
            alwaysShow: true,
        },
    ], {
        title: 'Sprintly',
        placeHolder: 'Choose how to begin',
        matchOnDescription: false,
        matchOnDetail: false,
        ignoreFocusOut: false,
    });
    return choice?.action === 'start';
}
async function shouldPromptOnStartup(context) {
    if (!isSprintlyEnabled() || !isAutoPromptEnabled()) {
        return false;
    }
    const workspaceKey = getWorkspaceKey();
    const marker = `${process.pid}:${workspaceKey}`;
    if (context.workspaceState.get(STARTUP_PROMPT_MARKER) === marker) {
        return false;
    }
    await context.workspaceState.update(STARTUP_PROMPT_MARKER, marker);
    return true;
}
function isSprintlyEnabled() {
    return (0, privacySettings_1.getPrivacySettings)().enabled;
}
function isAutoPromptEnabled() {
    const settings = (0, privacySettings_1.getPrivacySettings)();
    return settings.autoPromptOnStartup && settings.enabled;
}
async function runConsentFlow(onAccept, context) {
    if (context && !(await shouldPromptOnStartup(context))) {
        return;
    }
    if (await requestSessionStart()) {
        await onAccept();
    }
}
function getSprintlyConfiguration() {
    if (vscode.workspace?.getConfiguration) {
        return vscode.workspace.getConfiguration('sprintly');
    }
    return { get: (_key, defaultValue) => defaultValue };
}
function getWorkspaceKey() {
    const workspaceFile = vscode.workspace?.workspaceFile?.toString();
    if (workspaceFile) {
        return workspaceFile;
    }
    const folders = (vscode.workspace?.workspaceFolders ?? [])
        .map((folder) => folder.uri.toString())
        .sort();
    return folders.join('|') || 'untitled';
}
//# sourceMappingURL=consentFlow.js.map