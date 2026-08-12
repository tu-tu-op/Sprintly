"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showStatusPanel = void 0;
exports.registerCommands = registerCommands;
const vscode = require("vscode");
const sessionQuickPick_1 = require("./panels/sessionQuickPick");
function registerCommands(context, tracker, statusBar, sessionStore, agentLogWatcher) {
    const refresh = () => statusBar.update();
    const start = async () => {
        await agentLogWatcher.scanNow();
        sessionStore.startSession();
        tracker.start();
        refresh();
        void vscode.window.showInformationMessage('Sprintly session started.');
    };
    const pause = async () => {
        await agentLogWatcher.scanNow();
        sessionStore.pauseSession();
        tracker.pause();
        refresh();
    };
    const resume = async () => {
        await agentLogWatcher.scanNow();
        sessionStore.resumeSession();
        tracker.resume();
        refresh();
    };
    const stop = async () => {
        const stats = tracker.get();
        await agentLogWatcher.scanNow();
        sessionStore.stopSession();
        tracker.stop();
        refresh();
        void vscode.window.showInformationMessage(`Sprintly session ended: ${stats.fileEdits} edits · ${Math.floor(stats.durationSeconds / 60)}m`);
    };
    const reset = async () => {
        await agentLogWatcher.scanNow();
        sessionStore.resetSession();
        tracker.reset();
        refresh();
    };
    context.subscriptions.push(vscode.commands.registerCommand('sprintly.startSession', start), vscode.commands.registerCommand('sprintly.stopSession', stop), vscode.commands.registerCommand('sprintly.pauseSession', pause), vscode.commands.registerCommand('sprintly.resumeSession', resume), vscode.commands.registerCommand('sprintly.resetSession', reset), vscode.commands.registerCommand(sessionQuickPick_1.SESSION_PANEL_COMMAND, () => (0, sessionQuickPick_1.showStatusPanel)(tracker, sessionStore)), vscode.commands.registerCommand('sprintly.openPanel', () => (0, sessionQuickPick_1.showStatusPanel)(tracker, sessionStore)));
}
var sessionQuickPick_2 = require("./panels/sessionQuickPick");
Object.defineProperty(exports, "showStatusPanel", { enumerable: true, get: function () { return sessionQuickPick_2.showStatusPanel; } });
//# sourceMappingURL=commands.js.map