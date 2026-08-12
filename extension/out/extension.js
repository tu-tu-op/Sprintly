"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const commands_1 = require("./commands");
const consentFlow_1 = require("./consentFlow");
const sessionTracker_1 = require("./sessionTracker");
const statusBar_1 = require("./panels/statusBar");
const agentLogWatcher_1 = require("./tracking/agentLogWatcher");
const buildFailureTracker_1 = require("./tracking/buildFailureTracker");
const dailyStateStore_1 = require("./tracking/dailyStateStore");
const sessionActivityTracker_1 = require("./tracking/sessionActivityTracker");
const sprintlyPanels_1 = require("./panels/sprintlyPanels");
function activate(context) {
    const tracker = new sessionTracker_1.SessionTracker();
    const dailyStore = new dailyStateStore_1.DailyStateStore(context.globalState);
    const sessionActivityTracker = new sessionActivityTracker_1.SessionActivityTracker(dailyStore);
    const workspacePaths = (vscode.workspace.workspaceFolders ?? [])
        .filter((folder) => folder.uri.scheme === 'file')
        .map((folder) => folder.uri.fsPath);
    const agentLogWatcher = new agentLogWatcher_1.AgentLogWatcher(dailyStore, undefined, workspacePaths);
    const buildFailureTracker = new buildFailureTracker_1.BuildFailureTracker(dailyStore);
    const statusBar = (0, statusBar_1.initStatusBar)(context, tracker, dailyStore);
    context.subscriptions.push(tracker, sessionActivityTracker, agentLogWatcher, buildFailureTracker, dailyStore);
    (0, commands_1.registerCommands)(context, tracker, statusBar, dailyStore, agentLogWatcher);
    void agentLogWatcher.start().catch(() => undefined);
    context.subscriptions.push(vscode.commands.registerCommand('sprintly.shareSession', () => {
        showInfo('Sprintly session sharing is coming soon.');
    }), vscode.commands.registerCommand('sprintly.saveSession', () => {
        showInfo('Sprintly session saved to history.');
    }), vscode.commands.registerCommand('sprintly.devOpenScreen', async () => {
        const pick = await pickDevScreen();
        if (!pick) {
            return;
        }
        if (pick.id === 'open') {
            runPanel(() => (0, sprintlyPanels_1.showOpeningPanel)(context, (0, sprintlyPanels_1.demoStats)()));
        }
        else if (pick.id === 'session') {
            runPanel(() => (0, sprintlyPanels_1.showSessionActivePanel)(context, (0, sprintlyPanels_1.demoSessionData)()));
        }
        else if (pick.id === 'leaderboard') {
            runPanel(() => (0, sprintlyPanels_1.showLeaderboardPanel)(context, (0, sprintlyPanels_1.demoLeaderboardData)()));
        }
        else if (pick.id === 'history') {
            runPanel(() => (0, sprintlyPanels_1.showHistoryPanel)(context, (0, sprintlyPanels_1.demoHistoryData)()));
        }
        else if (pick.id === 'end') {
            runPanel(() => (0, sprintlyPanels_1.showSessionEndPanel)(context, (0, sprintlyPanels_1.demoSessionResult)()));
        }
    }));
    void (0, consentFlow_1.runConsentFlow)(async () => {
        await agentLogWatcher.scanNow();
        dailyStore.startSession();
        tracker.start();
        statusBar.update();
        showInfo('Sprintly session started.');
    }).catch(() => undefined);
}
function deactivate() { }
async function pickDevScreen() {
    try {
        return await vscode.window.showQuickPick([
            { label: '$(zap) Opening Screen', id: 'open', alwaysShow: true },
            { label: '$(debug-start) Session Live', id: 'session', alwaysShow: true },
            { label: '$(trophy) Leaderboard', id: 'leaderboard', alwaysShow: true },
            { label: '$(history) History', id: 'history', alwaysShow: true },
            { label: '$(star-full) Session End', id: 'end', alwaysShow: true },
        ], {
            title: 'Sprintly - Jump to Screen',
            placeHolder: '',
            matchOnDescription: false,
            matchOnDetail: false,
        });
    }
    catch {
        showInfo('—');
        return undefined;
    }
}
function runPanel(task) {
    void task().catch(() => {
        showInfo('—');
    });
}
function showInfo(message) {
    void Promise.resolve(vscode.window.showInformationMessage(message)).catch(() => undefined);
}
//# sourceMappingURL=extension.js.map