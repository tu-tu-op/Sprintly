"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runConsentFlow = runConsentFlow;
const vscode = require("vscode");
async function runConsentFlow(context, onAccept) {
    const choice = await vscode.window.showInformationMessage('🏃 Sprintly — Want to record this coding session?', { modal: false }, 'Start Recording', 'Not now');
    if (choice === 'Start Recording')
        onAccept();
}
//# sourceMappingURL=consentFlow.js.map