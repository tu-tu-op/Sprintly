"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.START_SPRINT_LABEL = void 0;
exports.requestSessionStart = requestSessionStart;
exports.runConsentFlow = runConsentFlow;
const vscode = require("vscode");
exports.START_SPRINT_LABEL = '$(play) Start Sprint';
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
async function runConsentFlow(onAccept) {
    if (await requestSessionStart()) {
        await onAccept();
    }
}
//# sourceMappingURL=consentFlow.js.map