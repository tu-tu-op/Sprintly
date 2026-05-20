"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showSessionPanel = showSessionPanel;
const vscode = require("vscode");
function showSessionPanel(tracker, onStart, onPause, onResume, onStop, onReset) {
    const qp = vscode.window.createQuickPick();
    qp.title = '⚡ Sprintly';
    qp.placeholder = 'Select an action';
    qp.ignoreFocusOut = false;
    const fmt = (n) => n.toString();
    const fmtTime = (s) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = (s % 60).toString().padStart(2, '0');
        return `${m}:${ss}`;
    };
    const buildItems = () => {
        const stats = tracker.getStats();
        const paused = tracker.isPaused();
        if (!stats.isRecording) {
            return [
                { label: '', kind: vscode.QuickPickItemKind.Separator },
                { label: '○  No active session', alwaysShow: true },
                { label: '', kind: vscode.QuickPickItemKind.Separator },
                { label: '$(play)  Start Session', alwaysShow: true },
            ];
        }
        const archetype = tracker.getArchetype();
        return [
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: `$(clock)  Duration`, description: fmtTime(stats.durationSeconds), alwaysShow: true },
            { label: `$(edit)  Edits`, description: fmt(stats.fileEdits), alwaysShow: true },
            { label: `$(save)  Saves`, description: fmt(stats.fileSaves), alwaysShow: true },
            { label: `$(files)  Active Files`, description: fmt(stats.activeFiles.size), alwaysShow: true },
            { label: `$(arrow-swap)  Switches`, description: fmt(stats.fileSwitches), alwaysShow: true },
            { label: `$(terminal)  Terminal`, description: fmt(stats.terminalCommands), alwaysShow: true },
            { label: `$(star)  Archetype`, description: archetype, alwaysShow: true },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            ...(paused
                ? [{ label: '$(debug-continue)  Resume', alwaysShow: true }]
                : [{ label: '$(debug-pause)  Pause', alwaysShow: true }]),
            { label: '$(debug-stop)  Stop Session', alwaysShow: true },
            { label: '$(trash)  Reset Session', alwaysShow: true },
        ];
    };
    qp.items = buildItems();
    // Refresh stats every second while panel is open
    const refreshTimer = setInterval(() => {
        qp.items = buildItems();
    }, 1000);
    qp.onDidAccept(() => {
        const sel = qp.selectedItems[0];
        if (!sel)
            return;
        qp.hide();
        const label = sel.label;
        if (label.includes('Start Session')) {
            onStart();
        }
        else if (label.includes('Pause')) {
            onPause();
        }
        else if (label.includes('Resume')) {
            onResume();
        }
        else if (label.includes('Stop')) {
            onStop();
        }
        else if (label.includes('Reset')) {
            vscode.window.showWarningMessage('Reset this session? All stats will be cleared.', 'Reset', 'Cancel').then(c => { if (c === 'Reset')
                onReset(); });
        }
    });
    qp.onDidHide(() => {
        clearInterval(refreshTimer);
        qp.dispose();
    });
    qp.show();
}
//# sourceMappingURL=sessionPanel.js.map