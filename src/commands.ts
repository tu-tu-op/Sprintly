import * as vscode from 'vscode';
import { SESSION_PANEL_COMMAND, showStatusPanel } from './panels/sessionQuickPick';
import { SessionStats, SessionTracker } from './sessionTracker';
import { AgentLogWatcher } from './tracking/agentLogWatcher';
import { DailyStateStore, DailySprintlyState } from './tracking/dailyStateStore';
import { isSprintlyEnabled } from './consentFlow';
import {
  buildSessionHistoryRecord,
  LocalSessionStore,
  SessionHistoryRecord,
} from './tracking/localSessionStore';
import { calculateDeveloperMetrics, deriveDeveloperProfile } from './tracking/developerMetrics';
import {
  createHistorySyncPayload,
  createLeaderboardPayload,
  createSessionSharePayload,
  defaultExportFileName,
  WebsiteHandoffService,
} from './tracking/websiteHandoff';
import { getPrivacySettings } from './tracking/privacySettings';

interface StatusBarUpdater {
  update(): void;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  statusBar: StatusBarUpdater,
  sessionStore: DailyStateStore,
  agentLogWatcher: AgentLogWatcher,
  historyStore: LocalSessionStore,
  handoff = new WebsiteHandoffService(),
): void {
  const refresh = (): void => statusBar.update();

  const syncDraft = (completed = false, endedAt = Date.now()): SessionHistoryRecord | null => {
    const state = sessionStore.get();
    if (!state.session.id || state.session.startedAt === null) return null;
    const record = buildCurrentRecord(state, tracker.get(), endedAt, completed);
    if (!record) return null;
    if (completed) {
      historyStore.append(record);
    } else {
      historyStore.upsertDraft(record);
    }
    return record;
  };

  const start = async (): Promise<void> => {
    if (!isSprintlyEnabled()) {
      void vscode.window.showInformationMessage('Sprintly is disabled in Settings.');
      return;
    }
    if (sessionStore.get().session.isActive) {
      void vscode.window.showInformationMessage('A Sprintly session is already in progress.');
      return;
    }
    await agentLogWatcher.scanNow();
    const id = sessionStore.startSession();
    tracker.start();
    const state = sessionStore.get();
    historyStore.create({ id, startedAt: state.session.startedAt ?? Date.now() });
    syncDraft();
    refresh();
    void vscode.window.showInformationMessage('Sprintly session started.');
  };

  const pause = async (): Promise<void> => {
    await agentLogWatcher.scanNow();
    sessionStore.pauseSession();
    tracker.pause();
    syncDraft();
    refresh();
  };

  const resume = async (): Promise<void> => {
    await agentLogWatcher.scanNow();
    sessionStore.resumeSession();
    tracker.resume();
    syncDraft();
    refresh();
  };

  const stop = async (): Promise<void> => {
    const currentState = sessionStore.get();
    const activeId = currentState.session.isActive ? currentState.session.id : null;
    if (!activeId) return;
    await agentLogWatcher.scanNow();
    const endedAt = Date.now();
    // Finalize the timer before closing the DailyStateStore boundary so the
    // persisted record contains the last partial second of observed time.
    tracker.stop(endedAt);
    sessionStore.stopSession(endedAt);
    const record = syncDraft(true, endedAt);
    refresh();
    void vscode.window.showInformationMessage(
      `Sprintly session ended: ${record?.edits ?? 0} edits · ${Math.floor((record?.activeDurationMs ?? 0) / 60_000)}m`,
    );
  };

  const reset = async (): Promise<void> => {
    await agentLogWatcher.scanNow();
    const id = sessionStore.get().session.id;
    if (id) historyStore.delete(id);
    sessionStore.resetSession();
    tracker.reset();
    refresh();
  };

  const clearHistory = async (): Promise<void> => {
    const confirmation = await vscode.window.showWarningMessage(
      'Clear all locally stored DevStrava session history?',
      { modal: true },
      'Clear History',
    );
    if (confirmation !== 'Clear History') return;
    historyStore.clear();
    void vscode.window.showInformationMessage('Sprintly session history cleared.');
  };

  const exportData = async (): Promise<void> => {
    const result = await handoff.savePayload(historyStore.export(), defaultExportFileName(), false);
    if (result) {
      void vscode.window.showInformationMessage(`DevStrava data exported to ${result.uri.fsPath}.`);
    }
  };

  const importData = async (): Promise<void> => {
    try {
      const payload = await handoff.readPayload();
      if (payload === null) return;
      const count = historyStore.import(payload, 'merge');
      void vscode.window.showInformationMessage(`Imported ${count} DevStrava session${count === 1 ? '' : 's'}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected DevStrava file is invalid.';
      void vscode.window.showErrorMessage(`DevStrava import rejected: ${message}`);
    }
  };

  const connectWebsite = async (): Promise<void> => {
    const opened = await handoff.connectWebsite();
    if (opened) {
      void vscode.window.showInformationMessage(
        'DevStrava opened. The website must ask you to authorize any local data import.',
      );
    } else {
      void vscode.window.showErrorMessage('DevStrava website URL is invalid or could not be opened.');
    }
  };

  const shareSession = async (): Promise<void> => {
    const record = await chooseSession(historyStore, 'Choose a completed session to share');
    if (!record) return;
    const result = await handoff.savePayload(
      createSessionSharePayload(record),
      `devstrava-session-${datePart(record.endedAt)}.json`,
      true,
    );
    if (result) {
      void vscode.window.showInformationMessage(
        result.openedWebsite
          ? 'Session handoff prepared. Import the selected file on the authenticated DevStrava website.'
          : 'Session export prepared. Open DevStrava and import the selected file.',
      );
    }
  };

  const syncHistory = async (): Promise<void> => {
    if (!getPrivacySettings().cloudSyncEnabled) {
      void vscode.window.showInformationMessage(
        'History sync is off. Enable sprintly.cloudSyncEnabled, then invoke Sync History explicitly.',
      );
      return;
    }
    const result = await handoff.savePayload(
      createHistorySyncPayload(historyStore),
      defaultExportFileName(),
      true,
    );
    if (result) {
      void vscode.window.showInformationMessage('Selected local history is ready for website import.');
    }
  };

  const joinLeaderboard = async (): Promise<void> => {
    const result = await handoff.savePayload(
      createLeaderboardPayload(historyStore.list()),
      `devstrava-leaderboard-${datePart(Date.now())}.json`,
      true,
    );
    if (result) {
      void vscode.window.showInformationMessage(
        'Aggregate-only leaderboard data is ready. Region and enrollment remain a website choice.',
      );
    }
  };

  context.subscriptions.push(
    tracker.onDidUpdate.event(() => {
      syncDraft();
      refresh();
    }),
    sessionStore.onDidUpdate(() => {
      syncDraft();
      refresh();
    }),
    vscode.commands.registerCommand('sprintly.startSession', start),
    vscode.commands.registerCommand('sprintly.stopSession', stop),
    vscode.commands.registerCommand('sprintly.pauseSession', pause),
    vscode.commands.registerCommand('sprintly.resumeSession', resume),
    vscode.commands.registerCommand('sprintly.resetSession', reset),
    vscode.commands.registerCommand('sprintly.clearHistory', clearHistory),
    vscode.commands.registerCommand('sprintly.exportData', exportData),
    vscode.commands.registerCommand('sprintly.importData', importData),
    vscode.commands.registerCommand('sprintly.connectWebsite', connectWebsite),
    vscode.commands.registerCommand('sprintly.shareSession', shareSession),
    vscode.commands.registerCommand('sprintly.syncHistory', syncHistory),
    vscode.commands.registerCommand('sprintly.joinLeaderboard', joinLeaderboard),
    vscode.commands.registerCommand('sprintly.saveSession', exportData),
    vscode.commands.registerCommand(SESSION_PANEL_COMMAND, () => showStatusPanel(tracker, sessionStore, historyStore)),
    vscode.commands.registerCommand('sprintly.openPanel', () => showStatusPanel(tracker, sessionStore, historyStore)),
  );
}

export { showStatusPanel } from './panels/sessionQuickPick';

function buildCurrentRecord(
  state: Readonly<DailySprintlyState>,
  stats: Readonly<SessionStats>,
  endedAt: number,
  completed: boolean,
): SessionHistoryRecord | null {
  const durationMs = stats.durationSeconds > 0
    ? stats.durationSeconds * 1_000
    : state.session.startedAt === null
      ? 0
      : Math.max(0, endedAt - state.session.startedAt - state.session.pauses.reduce((total, pause) => (
        total + Math.max(0, (pause.endedAt ?? endedAt) - pause.startedAt)
      ), 0));
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
  const profile = deriveDeveloperProfile(metricsInput);
  return buildSessionHistoryRecord(
    state,
    stats,
    profile.primary,
    profile.traits,
    calculateDeveloperMetrics(metricsInput),
    endedAt,
    completed,
  );
}

async function chooseSession(
  historyStore: LocalSessionStore,
  title: string,
): Promise<SessionHistoryRecord | null> {
  const records = historyStore.list();
  if (!records.length) {
    void vscode.window.showInformationMessage('No completed local sessions are available yet.');
    return null;
  }
  const selected = await vscode.window.showQuickPick(
    records.map((record) => ({
      label: `${new Date(record.endedAt).toLocaleString()} · ${record.archetype}`,
      description: `${Math.round(record.activeDurationMs / 60_000)}m · ${record.edits} edits · ${record.id}`,
      record,
    })),
    { title, matchOnDescription: true, matchOnDetail: false },
  );
  return selected?.record ?? null;
}

function datePart(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
