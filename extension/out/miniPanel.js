"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showMiniPanel = showMiniPanel;
const vscode = require("vscode");
function showMiniPanel() {
    const qp = vscode.window.createQuickPick();
    qp.placeholder = 'Search MyExt actions...';
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.items = [
        {
            label: '$(play) Start Session',
            description: 'Begin a new session',
            detail: 'Launches with your current workspace settings',
            action: 'start',
        },
        {
            label: '$(history) Recent Sessions',
            description: 'View and restore past sessions',
            action: 'recent',
        },
        {
            label: '$(refresh) Restart',
            description: 'Restart the current session',
            action: 'restart',
        },
        {
            label: '',
            kind: vscode.QuickPickItemKind.Separator,
        },
        {
            label: '$(gear) Open Settings',
            description: 'Configure MyExt',
            action: 'settings',
        },
        {
            label: '$(output) Show Logs',
            description: 'Open the output channel',
            action: 'logs',
        },
        {
            label: '',
            kind: vscode.QuickPickItemKind.Separator,
        },
        {
            label: '$(circle-slash) Disable for this Workspace',
            description: 'Turn off MyExt in this workspace only',
            action: 'disable',
        },
    ];
    qp.onDidAccept(() => {
        const selected = qp.selectedItems[0];
        qp.hide();
        if (!selected?.action)
            return;
        vscode.commands.executeCommand(`myext.action.${selected.action}`);
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
}
//# sourceMappingURL=miniPanel.js.map