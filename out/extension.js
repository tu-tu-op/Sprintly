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
const localSessionStore_1 = require("./tracking/localSessionStore");
const websiteHandoff_1 = require("./tracking/websiteHandoff");
const sprintlySync_1 = require("./integration/sprintlySync");
const secureTokenStore_1 = require("./integration/secureTokenStore");
const syncOutbox_1 = require("./integration/syncOutbox");
const syncState_1 = require("./integration/syncState");
const connectionUri_1 = require("./integration/connectionUri");
const connectionSettings_1 = require("./integration/connectionSettings");
const sprintlyPanels_1 = require("./panels/sprintlyPanels");
function activate(context) {
    const connectionLog = vscode.window.createOutputChannel('Sprintly', { log: true });
    connectionLog.info(`Activating ${context.extension.id} v${String(context.extension.packageJSON.version)} from ${context.extensionPath}`);
    const tracker = new sessionTracker_1.SessionTracker();
    // Session history and its current draft are workspace-owned. This prevents
    // opening another repository from exposing or merging private activity.
    const dailyStore = new dailyStateStore_1.DailyStateStore(context.workspaceState);
    const historyStore = new localSessionStore_1.LocalSessionStore(context.workspaceState);
    const handoff = new websiteHandoff_1.WebsiteHandoffService();
    const syncOutbox = new syncOutbox_1.SyncOutbox(context.workspaceState);
    const syncStateStore = new syncState_1.SyncStateStore(context.workspaceState);
    const syncService = new sprintlySync_1.SprintlySyncService({
        tokenStore: new secureTokenStore_1.SprintlyTokenStore(context.secrets),
        outbox: syncOutbox,
        stateStore: syncStateStore,
    });
    const sessionActivityTracker = new sessionActivityTracker_1.SessionActivityTracker(dailyStore);
    const workspacePaths = (vscode.workspace.workspaceFolders ?? [])
        .filter((folder) => folder.uri.scheme === 'file')
        .map((folder) => folder.uri.fsPath);
    const agentLogWatcher = new agentLogWatcher_1.AgentLogWatcher(dailyStore, undefined, workspacePaths);
    const buildFailureTracker = new buildFailureTracker_1.BuildFailureTracker(dailyStore);
    const statusBar = (0, statusBar_1.initStatusBar)(context, tracker, dailyStore);
    context.subscriptions.push(tracker, sessionActivityTracker, agentLogWatcher, buildFailureTracker, dailyStore, historyStore, handoff, syncOutbox, connectionLog);
    // Recover an interrupted session from the last durable observation so the
    // finalized draft and DailyState boundaries agree (audit Bug #2).
    const interruptedId = dailyStore.getInterruptedSessionId();
    if (interruptedId) {
        historyStore.recoverInterruptedSession(interruptedId, dailyStore.get().session.endedAt ?? Date.now());
    }
    const lifecycleControls = (0, commands_1.registerCommands)(context, tracker, statusBar, dailyStore, agentLogWatcher, historyStore, handoff, syncService);
    // The website's “Open VS Code” button targets publisher.name from the
    // extension manifest. VS Code routes that URI to this handler in the window
    // where Sprintly is installed, including remote extension hosts.
    // handler completes pairing automatically without putting a device token in
    // the URL; the short-lived code is exchanged directly with the website API.
    context.subscriptions.push(vscode.window.registerUriHandler({
        handleUri: (uri) => {
            connectionLog.info('Pairing URI received', {
                scheme: uri.scheme,
                authority: uri.authority,
                path: uri.path,
            });
            const intent = (0, connectionUri_1.parseSprintlyPairingIntent)(uri, context.extension.id);
            if (!intent) {
                connectionLog.warn('Pairing URI rejected before code exchange');
                return;
            }
            const configuredApi = (0, connectionSettings_1.getSprintlyConnectionSettings)().apiUrl;
            if (intent.apiUrl && !sameApiOrigin(intent.apiUrl, configuredApi)) {
                connectionLog.warn('Pairing URI API origin does not match sprintly.apiUrl');
                void vscode.window.showWarningMessage('The pairing link targets a different Sprintly API. Set sprintly.apiUrl to that website origin, then try again.');
                return;
            }
            connectionLog.info('Exchanging one-time pairing code');
            void syncService.connectWithPairingCode(intent.code)
                .then(() => {
                connectionLog.info('Automatic pairing completed');
                void vscode.window.showInformationMessage('Sprintly extension connected automatically.');
            })
                .catch((error) => {
                connectionLog.error(`Automatic pairing failed: ${error instanceof Error ? error.message : 'unknown error'}`);
                void vscode.window.showErrorMessage(`Sprintly automatic connection failed: ${error instanceof Error ? error.message : 'pairing could not be completed.'}`);
            });
        },
    }));
    connectionLog.info(`URI handler registered for ${context.extension.id}`);
    // Privacy boundary: the agent-log watcher is constructed dormant. It only
    // discovers, reads, watches, or persists cursor state after the user
    // explicitly starts a sprint (see commands.ts start()).
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('sprintly.historyRetention')) {
            historyStore.applyRetention();
        }
        if (event.affectsConfiguration('sprintly.enabled')) {
            lifecycleControls.handleMasterToggle();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sprintly.devOpenScreen', async () => {
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
    // Resume explicit/completed uploads after activation and periodically so a
    // temporary website outage does not require restarting VS Code manually.
    void syncService.resume().catch(() => undefined);
    const retryTimer = setInterval(() => {
        void syncService.resume().catch(() => undefined);
    }, 60000);
    context.subscriptions.push({ dispose: () => clearInterval(retryTimer) });
    void (0, consentFlow_1.runConsentFlow)(async () => {
        await vscode.commands.executeCommand('sprintly.startSession');
    }, context).catch(() => undefined);
}
function deactivate() { }
function sameApiOrigin(left, right) {
    try {
        return new URL(left).origin === new URL(right).origin;
    }
    catch {
        return false;
    }
}
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