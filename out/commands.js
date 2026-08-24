"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showStatusPanel = void 0;
exports.registerCommands = registerCommands;
const vscode = require("vscode");
const sessionQuickPick_1 = require("./panels/sessionQuickPick");
const consentFlow_1 = require("./consentFlow");
const localSessionStore_1 = require("./tracking/localSessionStore");
const developerMetrics_1 = require("./tracking/developerMetrics");
const websiteHandoff_1 = require("./tracking/websiteHandoff");
const privacySettings_1 = require("./tracking/privacySettings");
/** Every workspace-state key Sprintly owns, current and legacy. */
const ALL_STORAGE_KEYS = [
    'sprintly.sessionTracking.v3',
    'sprintly.dailyTracking.v2',
    'devstrava.localSessionStore.v1',
    'sprintly.sessionHistory.v1',
    consentFlow_1.STARTUP_PROMPT_MARKER,
];
/**
 * Lifecycle commands must never interleave: a Start awaiting its baseline scan
 * must not race another Start past the active-session guard (audit Bug #4).
 * Every transition runs serialized through this queue.
 */
class LifecycleQueue {
    constructor() {
        this.tail = Promise.resolve();
    }
    run(task) {
        const result = this.tail.then(task, task);
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }
}
function registerCommands(context, tracker, statusBar, sessionStore, agentLogWatcher, historyStore, handoff = new websiteHandoff_1.WebsiteHandoffService()) {
    const refresh = () => statusBar.update();
    const lifecycle = new LifecycleQueue();
    /**
     * Critical lifecycle and data commands only report success after their
     * workspace-state writes are durably persisted; storage failures surface to
     * the user instead of being swallowed (audit Bug #13).
     */
    const persistOrWarn = async () => {
        try {
            await Promise.all([sessionStore.flush(), historyStore.flush()]);
        }
        catch {
            void vscode.window.showErrorMessage('Sprintly could not save session data. Your changes may be lost.');
        }
    };
    /**
     * The session id this process is actively recording, or null. Draft
     * synchronization is gated on it so late cursor-only or delayed agent events
     * after End can never recreate a hidden draft behind a frozen completed
     * record (audit Bug #3).
     */
    let recordingId = null;
    const syncDraft = (completed = false, endedAt = Date.now()) => {
        const state = sessionStore.get();
        if (!recordingId || !state.session.id || state.session.startedAt === null)
            return null;
        if (state.session.id !== recordingId)
            return null;
        const record = buildCurrentRecord(state, tracker.get(), endedAt, completed);
        if (!record)
            return null;
        if (completed) {
            historyStore.append(record);
        }
        else {
            historyStore.upsertDraft(record);
        }
        return record;
    };
    const start = async () => {
        await lifecycle.run(async () => {
            if (!(0, consentFlow_1.isSprintlyEnabled)()) {
                void vscode.window.showInformationMessage('Sprintly is disabled in Settings.');
                return;
            }
            if (sessionStore.get().session.isActive) {
                void vscode.window.showInformationMessage('A Sprintly session is already in progress.');
                return;
            }
            const id = sessionStore.startSession();
            tracker.start();
            // Consent boundary: log discovery and the pre-attribution baseline scan
            // happen only now, after the user explicitly chose to record.
            await agentLogWatcher.start();
            await agentLogWatcher.scanNow();
            // Recheck after awaits so a queued concurrent Start cannot double-start.
            if (sessionStore.get().session.id !== id || !sessionStore.get().session.isActive) {
                return;
            }
            const state = sessionStore.get();
            historyStore.create({ id, startedAt: state.session.startedAt ?? Date.now() });
            recordingId = id;
            syncDraft();
            refresh();
            await persistOrWarn();
            void vscode.window.showInformationMessage('Sprintly session started.');
        });
    };
    const pause = () => lifecycle.run(async () => {
        if (!sessionStore.get().session.isActive || sessionStore.get().session.isPaused)
            return;
        await agentLogWatcher.scanNow();
        sessionStore.pauseSession();
        tracker.pause();
        syncDraft();
        refresh();
    });
    const resume = () => lifecycle.run(async () => {
        const state = sessionStore.get();
        if (!state.session.isActive || !state.session.isPaused)
            return;
        await agentLogWatcher.scanNow();
        sessionStore.resumeSession();
        tracker.resume();
        syncDraft();
        refresh();
    });
    const stop = () => lifecycle.run(async () => {
        const currentState = sessionStore.get();
        const activeId = currentState.session.isActive ? currentState.session.id : null;
        if (!activeId)
            return;
        await agentLogWatcher.scanNow();
        // Recheck after the final scan: a queued Stop or Reset may have ended the
        // session while this transition waited for the mutex.
        if (!sessionStore.get().session.isActive)
            return;
        const endedAt = Date.now();
        // Finalize the timer before closing the DailyStateStore boundary so the
        // persisted record contains the last partial second of observed time.
        tracker.stop(endedAt);
        sessionStore.stopSession(endedAt);
        const record = syncDraft(true, endedAt);
        // The completed record is canonical and frozen from this point on.
        recordingId = null;
        // Consent boundary: stop all log discovery, watching, and cursor writes
        // once the sprint ends.
        agentLogWatcher.stop();
        refresh();
        await persistOrWarn();
        void vscode.window.showInformationMessage(`Sprintly session ended: ${record?.edits ?? 0} edits · ${Math.floor((record?.activeDurationMs ?? 0) / 60000)}m`);
    });
    const reset = () => lifecycle.run(async () => {
        await agentLogWatcher.scanNow();
        const id = sessionStore.get().session.id;
        if (id)
            historyStore.delete(id);
        sessionStore.resetSession();
        tracker.reset();
        recordingId = null;
        agentLogWatcher.stop();
        refresh();
        await persistOrWarn();
    });
    const clearHistory = async () => {
        const confirmation = await vscode.window.showWarningMessage('Clear all locally stored DevStrava session history?', { modal: true }, 'Clear History');
        if (confirmation !== 'Clear History')
            return;
        historyStore.clear();
        await persistOrWarn();
        void vscode.window.showInformationMessage('Sprintly session history cleared.');
    };
    const eraseAllData = async () => {
        const confirmation = await vscode.window.showWarningMessage('Erase all Sprintly data in this workspace? This removes sessions, drafts, '
            + 'agent-log cursors, and startup markers. It cannot be undone.', { modal: true }, 'Erase All Data');
        if (confirmation !== 'Erase All Data')
            return;
        // Halt observation first so nothing repersists after deletion.
        await lifecycle.run(async () => {
            recordingId = null;
            tracker.reset();
            sessionStore.eraseAllData();
            historyStore.clear();
            agentLogWatcher.stop();
            refresh();
        });
        for (const key of ALL_STORAGE_KEYS) {
            await context.workspaceState.update(key, undefined);
        }
        await persistOrWarn();
        void vscode.window.showInformationMessage('All Sprintly local data erased.');
    };
    const exportData = async () => {
        const result = await handoff.savePayload(historyStore.export(), (0, websiteHandoff_1.defaultExportFileName)(), false);
        if (result) {
            void vscode.window.showInformationMessage(`DevStrava data exported to ${result.uri.fsPath}.`);
        }
    };
    const importData = async () => {
        try {
            const payload = await handoff.readPayload();
            if (payload === null)
                return;
            const count = historyStore.import(payload, 'merge');
            await persistOrWarn();
            void vscode.window.showInformationMessage(`Imported ${count} DevStrava session${count === 1 ? '' : 's'}.`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'The selected DevStrava file is invalid.';
            void vscode.window.showErrorMessage(`DevStrava import rejected: ${message}`);
        }
    };
    const connectWebsite = async () => {
        const opened = await handoff.connectWebsite();
        if (opened) {
            void vscode.window.showInformationMessage('DevStrava opened. The website must ask you to authorize any local data import.');
        }
        else {
            void vscode.window.showErrorMessage('DevStrava website URL is invalid or could not be opened.');
        }
    };
    const shareSession = async () => {
        const record = await chooseSession(historyStore, 'Choose a completed session to share');
        if (!record)
            return;
        const result = await handoff.savePayload((0, websiteHandoff_1.createSessionSharePayload)(record), `devstrava-session-${datePart(record.endedAt)}.json`, true);
        if (result) {
            void vscode.window.showInformationMessage(result.openedWebsite
                ? 'Session handoff prepared. Import the selected file on the authenticated DevStrava website.'
                : 'Session export prepared. Open DevStrava and import the selected file.');
        }
    };
    const syncHistory = async () => {
        if (!(0, privacySettings_1.getPrivacySettings)().cloudSyncEnabled) {
            void vscode.window.showInformationMessage('History sync is off. Enable sprintly.cloudSyncEnabled, then invoke Sync History explicitly.');
            return;
        }
        const result = await handoff.savePayload((0, websiteHandoff_1.createHistorySyncPayload)(historyStore), (0, websiteHandoff_1.defaultExportFileName)(), true);
        if (result) {
            void vscode.window.showInformationMessage('Selected local history is ready for website import.');
        }
    };
    const joinLeaderboard = async () => {
        const result = await handoff.savePayload((0, websiteHandoff_1.createLeaderboardPayload)(historyStore.list()), `devstrava-leaderboard-${datePart(Date.now())}.json`, true);
        if (result) {
            void vscode.window.showInformationMessage('Aggregate-only leaderboard data is ready. Region and enrollment remain a website choice.');
        }
    };
    const handleMasterToggle = () => {
        if ((0, consentFlow_1.isSprintlyEnabled)()) {
            // Re-enabling never silently restarts capture; the user starts a sprint.
            return;
        }
        // Authoritative disable: no timer, draft writes, or log observation may
        // outlive the master switch (audit Bug #5).
        void lifecycle.run(async () => {
            recordingId = null;
            tracker.stop();
            agentLogWatcher.stop();
            if (sessionStore.get().session.isActive) {
                const endedAt = Date.now();
                sessionStore.stopSession(endedAt);
                syncDraft(true, endedAt);
                void vscode.window.showInformationMessage('Sprintly was disabled. The active session was ended and saved.');
            }
            refresh();
        });
    };
    context.subscriptions.push(tracker.onDidUpdate.event(() => {
        syncDraft();
    }), sessionStore.onDidUpdate(() => {
        syncDraft();
    }), vscode.commands.registerCommand('sprintly.startSession', start), vscode.commands.registerCommand('sprintly.stopSession', stop), vscode.commands.registerCommand('sprintly.pauseSession', pause), vscode.commands.registerCommand('sprintly.resumeSession', resume), vscode.commands.registerCommand('sprintly.resetSession', reset), vscode.commands.registerCommand('sprintly.clearHistory', clearHistory), vscode.commands.registerCommand('sprintly.eraseAllData', eraseAllData), vscode.commands.registerCommand('sprintly.exportData', exportData), vscode.commands.registerCommand('sprintly.importData', importData), vscode.commands.registerCommand('sprintly.connectWebsite', connectWebsite), vscode.commands.registerCommand('sprintly.shareSession', shareSession), vscode.commands.registerCommand('sprintly.syncHistory', syncHistory), vscode.commands.registerCommand('sprintly.joinLeaderboard', joinLeaderboard), vscode.commands.registerCommand('sprintly.saveSession', exportData), vscode.commands.registerCommand(sessionQuickPick_1.SESSION_PANEL_COMMAND, () => (0, sessionQuickPick_1.showStatusPanel)(tracker, sessionStore, historyStore)), vscode.commands.registerCommand('sprintly.openPanel', () => (0, sessionQuickPick_1.showStatusPanel)(tracker, sessionStore, historyStore)));
    return { handleMasterToggle };
}
var sessionQuickPick_2 = require("./panels/sessionQuickPick");
Object.defineProperty(exports, "showStatusPanel", { enumerable: true, get: function () { return sessionQuickPick_2.showStatusPanel; } });
function buildCurrentRecord(state, stats, endedAt, completed) {
    const durationMs = stats.durationSeconds > 0
        ? stats.durationSeconds * 1000
        : state.session.startedAt === null
            ? 0
            : Math.max(0, endedAt - state.session.startedAt - state.session.pauses.reduce((total, pause) => (total + Math.max(0, (pause.endedAt ?? endedAt) - pause.startedAt)), 0));
    const metricsInput = {
        sessionDurationMs: durationMs,
        coding: {
            manualMs: state.session.manualMs,
            aiAssistedMs: state.session.aiAssistedMs,
            automationMs: state.session.automationMs,
            unknownBulkMs: state.session.unknownBulkMs,
        },
        fileEdits: stats.fileEdits,
        fileSaves: stats.fileSaves,
        fileSwitches: stats.fileSwitches,
        terminalCommands: stats.terminalCommands,
        terminalCommandsByCategory: stats.terminalCommandsByCategory,
        failures: state.buildFailures.total,
        recoveredFailures: state.buildFailures.recoveredFailures,
        successfulRuns: state.buildFailures.successfulRuns,
    };
    const profile = (0, developerMetrics_1.deriveDeveloperProfile)(metricsInput);
    return (0, localSessionStore_1.buildSessionHistoryRecord)(state, stats, profile.primary, profile.traits, (0, developerMetrics_1.calculateDeveloperMetrics)(metricsInput), endedAt, completed);
}
async function chooseSession(historyStore, title) {
    const records = historyStore.list();
    if (!records.length) {
        void vscode.window.showInformationMessage('No completed local sessions are available yet.');
        return null;
    }
    const selected = await vscode.window.showQuickPick(records.map((record) => ({
        label: `${new Date(record.endedAt).toLocaleString()} · ${record.archetype}`,
        description: `${Math.round(record.activeDurationMs / 60000)}m · ${record.edits} edits · ${record.id}`,
        record,
    })), { title, matchOnDescription: true, matchOnDetail: false });
    return selected?.record ?? null;
}
function datePart(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
}
//# sourceMappingURL=commands.js.map