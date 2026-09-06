import * as vscode from 'vscode';
import { SESSION_PANEL_COMMAND, showStatusPanel } from './panels/sessionQuickPick';
import { SessionStats, SessionTracker } from './sessionTracker';
import { AgentLogWatcher } from './tracking/agentLogWatcher';
import { DailyStateStore, DailySprintlyState } from './tracking/dailyStateStore';
import { isSprintlyEnabled, STARTUP_PROMPT_MARKER } from './consentFlow';
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
import { SprintlySyncService, SyncOperationResult } from './integration/sprintlySync';
import { environmentLabel, getSprintlyConnectionSettings } from './integration/connectionSettings';

interface StatusBarUpdater {
  update(): void;
}

export interface LifecycleControls {
  /** Authoritatively apply the sprintly.enabled master setting. */
  handleMasterToggle(): void;
}

/** Every workspace-state key Sprintly owns, current and legacy. */
const ALL_STORAGE_KEYS = [
  'sprintly.sessionTracking.v3',
  'sprintly.dailyTracking.v2',
  'devstrava.localSessionStore.v1',
  'sprintly.sessionHistory.v1',
  'sprintly.syncOutbox.v1',
  'sprintly.syncState.v1',
  STARTUP_PROMPT_MARKER,
] as const;

/**
 * Lifecycle commands must never interleave: a Start awaiting its baseline scan
 * must not race another Start past the active-session guard (audit Bug #4).
 * Every transition runs serialized through this queue.
 */
class LifecycleQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  statusBar: StatusBarUpdater,
  sessionStore: DailyStateStore,
  agentLogWatcher: AgentLogWatcher,
  historyStore: LocalSessionStore,
  handoff = new WebsiteHandoffService(),
  syncService?: SprintlySyncService,
): LifecycleControls {
  const refresh = (): void => statusBar.update();

  const lifecycle = new LifecycleQueue();

  /**
   * Critical lifecycle and data commands only report success after their
   * workspace-state writes are durably persisted; storage failures surface to
   * the user instead of being swallowed (audit Bug #13).
   */
  const persistOrWarn = async (): Promise<void> => {
    try {
      await Promise.all([sessionStore.flush(), historyStore.flush()]);
    } catch {
      void vscode.window.showErrorMessage(
        'Sprintly could not save session data. Your changes may be lost.',
      );
    }
  };

  /**
   * The session id this process is actively recording, or null. Draft
   * synchronization is gated on it so late cursor-only or delayed agent events
   * after End can never recreate a hidden draft behind a frozen completed
   * record (audit Bug #3).
   */
  let recordingId: string | null = null;

  const syncDraft = (completed = false, endedAt = Date.now()): SessionHistoryRecord | null => {
    const state = sessionStore.get();
    if (!recordingId || !state.session.id || state.session.startedAt === null) return null;
    if (state.session.id !== recordingId) return null;
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
    await lifecycle.run(async () => {
      if (!isSprintlyEnabled()) {
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

  const pause = (): Promise<void> => lifecycle.run(async () => {
    if (!sessionStore.get().session.isActive || sessionStore.get().session.isPaused) return;
    await agentLogWatcher.scanNow();
    sessionStore.pauseSession();
    tracker.pause();
    syncDraft();
    refresh();
  });

  const resume = (): Promise<void> => lifecycle.run(async () => {
    const state = sessionStore.get();
    if (!state.session.isActive || !state.session.isPaused) return;
    await agentLogWatcher.scanNow();
    sessionStore.resumeSession();
    tracker.resume();
    syncDraft();
    refresh();
  });

  const stop = (): Promise<void> => lifecycle.run(async () => {
    const currentState = sessionStore.get();
    const activeId = currentState.session.isActive ? currentState.session.id : null;
    if (!activeId) return;
    await agentLogWatcher.scanNow();
    // Recheck after the final scan: a queued Stop or Reset may have ended the
    // session while this transition waited for the mutex.
    if (!sessionStore.get().session.isActive) return;
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
    triggerCompletedSync(syncService, record);
    void vscode.window.showInformationMessage(
      `Sprintly session ended: ${record?.edits ?? 0} edits · ${Math.floor((record?.activeDurationMs ?? 0) / 60_000)}m`,
    );
  });

  const reset = (): Promise<void> => lifecycle.run(async () => {
    await agentLogWatcher.scanNow();
    const id = sessionStore.get().session.id;
    if (id) historyStore.delete(id);
    sessionStore.resetSession();
    tracker.reset();
    recordingId = null;
    agentLogWatcher.stop();
    refresh();
    await persistOrWarn();
  });

  const clearHistory = async (): Promise<void> => {
    const confirmation = await vscode.window.showWarningMessage(
      'Clear all locally stored DevStrava session history?',
      { modal: true },
      'Clear History',
    );
    if (confirmation !== 'Clear History') return;
    historyStore.clear();
    await syncService?.clearQueuedSessions();
    await persistOrWarn();
    void vscode.window.showInformationMessage('Sprintly session history cleared.');
  };

  const eraseAllData = async (): Promise<void> => {
    const confirmation = await vscode.window.showWarningMessage(
      'Erase all Sprintly data in this workspace? This removes sessions, drafts, '
      + 'agent-log cursors, and startup markers. It cannot be undone.',
      { modal: true },
      'Erase All Data',
    );
    if (confirmation !== 'Erase All Data') return;
    // Halt observation first so nothing repersists after deletion.
    await lifecycle.run(async () => {
      recordingId = null;
      tracker.reset();
      sessionStore.eraseAllData();
      historyStore.clear();
      await syncService?.eraseLocalData();
      agentLogWatcher.stop();
      refresh();
    });
    for (const key of ALL_STORAGE_KEYS) {
      await context.workspaceState.update(key, undefined);
    }
    await persistOrWarn();
    void vscode.window.showInformationMessage('All Sprintly local data erased.');
  };

  const exportData = async (): Promise<void> => {
    try {
      const exported = historyStore.exportSprintly();
      const result = await handoff.savePayload(exported.payload, defaultExportFileName(), false);
      if (result) {
        if (exported.warnings.length) {
          void vscode.window.showWarningMessage(
            `Exported ${exported.payload.sessions.length} session${exported.payload.sessions.length === 1 ? '' : 's'} with ${exported.warnings.length} compatibility note${exported.warnings.length === 1 ? '' : 's'}. Website-supported fields were written; local-only details remain local.`,
          );
        } else {
          void vscode.window.showInformationMessage(`DevStrava data exported to ${result.uri.fsPath}.`);
        }
      }
    } catch (error) {
      void vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Sprintly could not create the export.',
      );
    }
  };

  const importData = async (): Promise<void> => {
    try {
      const payload = await handoff.readPayload();
      if (payload === null) return;
      const count = historyStore.import(payload, 'merge');
      await persistOrWarn();
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

  const setDevelopmentToken = async (): Promise<void> => {
    if (!syncService) {
      void vscode.window.showErrorMessage('Sprintly API sync is not available in this extension build.');
      return;
    }
    const token = await vscode.window.showInputBox({
      title: 'Sprintly Development Token',
      prompt: 'Paste the local development bearer token. It will be stored in VS Code SecretStorage.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? undefined : 'A development token is required.',
    });
    if (token === undefined) return;
    try {
      await syncService.setDevelopmentToken(token);
      void vscode.window.showInformationMessage('Sprintly development token stored securely.');
    } catch (error) {
      void vscode.window.showErrorMessage(errorMessage(error));
    }
  };

  const connect = async (): Promise<void> => {
    if (!syncService) {
      void vscode.window.showErrorMessage('Sprintly API sync is not available in this extension build.');
      return;
    }
    const settings = getSprintlyConnectionSettings();
    try {
      if (settings.environment === 'development') {
        await syncService.connectDevelopment();
      } else {
        const opened = await handoff.connectWebsite();
        if (!opened) {
          void vscode.window.showErrorMessage('Sprintly pairing page could not be opened.');
          return;
        }
        const code = await vscode.window.showInputBox({
          title: 'Sprintly Pairing Code',
          prompt: 'Sign in on the Sprintly website, then paste the short-lived pairing code here.',
          ignoreFocusOut: true,
          validateInput: (value) => value.trim() ? undefined : 'A pairing code is required.',
        });
        if (code === undefined) return;
        await syncService.connectWithPairingCode(code);
      }
      void vscode.window.showInformationMessage(
        `Sprintly connected to ${environmentLabel(settings.environment)} at ${settings.apiUrl}.`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`Sprintly connection failed: ${errorMessage(error)}`);
    }
  };

  const testConnection = async (): Promise<void> => {
    if (!syncService) {
      void vscode.window.showErrorMessage('Sprintly API sync is not available in this extension build.');
      return;
    }
    const settings = getSprintlyConnectionSettings();
    try {
      await syncService.testConnection();
      void vscode.window.showInformationMessage(
        `Sprintly API is healthy (${environmentLabel(settings.environment)} · ${settings.apiUrl}).`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`Sprintly connection test failed: ${errorMessage(error)}`);
    }
  };

  const syncCurrentSession = async (): Promise<void> => {
    if (!syncService) {
      void vscode.window.showErrorMessage('Sprintly API sync is not available in this extension build.');
      return;
    }
    const record = await chooseSession(historyStore, 'Choose a completed session to sync');
    if (!record) return;
    const result = await syncService.syncCurrentSession(record);
    showSyncResult(result, 'Session sync');
  };

  const syncPendingSessions = async (): Promise<void> => {
    if (!syncService) {
      void vscode.window.showErrorMessage('Sprintly API sync is not available in this extension build.');
      return;
    }
    const result = await syncService.syncPendingSessions(true);
    showSyncResult(result, 'Pending session sync');
  };

  const viewSyncStatus = async (): Promise<void> => {
    if (!syncService) {
      void vscode.window.showErrorMessage('Sprintly API sync is not available in this extension build.');
      return;
    }
    const status = syncService.getStatus();
    await vscode.window.showInformationMessage(formatSyncStatus(status));
  };

  const disconnect = async (): Promise<void> => {
    if (!syncService) return;
    await syncService.disconnect();
    void vscode.window.showInformationMessage('Sprintly disconnected. Local session recording remains enabled.');
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
    if (syncService) {
      const result = await syncService.syncPendingSessions(true);
      showSyncResult(result, 'Pending session sync');
      return;
    }
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
    if (!getPrivacySettings().leaderboardOptIn) {
      void vscode.window.showInformationMessage(
        'Leaderboard sharing is off. Enable sprintly.leaderboardOptIn and choose leaderboard sync explicitly.',
      );
      return;
    }
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

  const handleMasterToggle = (): void => {
    if (isSprintlyEnabled()) {
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
        const record = syncDraft(true, endedAt);
        triggerCompletedSync(syncService, record);
        void vscode.window.showInformationMessage(
          'Sprintly was disabled. The active session was ended and saved.',
        );
      }
      refresh();
    });
  };

  context.subscriptions.push(
    tracker.onDidUpdate.event(() => {
      syncDraft();
    }),
    sessionStore.onDidUpdate(() => {
      syncDraft();
    }),
    vscode.commands.registerCommand('sprintly.startSession', start),
    vscode.commands.registerCommand('sprintly.stopSession', stop),
    vscode.commands.registerCommand('sprintly.pauseSession', pause),
    vscode.commands.registerCommand('sprintly.resumeSession', resume),
    vscode.commands.registerCommand('sprintly.resetSession', reset),
    vscode.commands.registerCommand('sprintly.clearHistory', clearHistory),
    vscode.commands.registerCommand('sprintly.eraseAllData', eraseAllData),
    vscode.commands.registerCommand('sprintly.exportData', exportData),
    vscode.commands.registerCommand('sprintly.importData', importData),
    vscode.commands.registerCommand('sprintly.setDevelopmentToken', setDevelopmentToken),
    vscode.commands.registerCommand('sprintly.connect', connect),
    vscode.commands.registerCommand('sprintly.testConnection', testConnection),
    vscode.commands.registerCommand('sprintly.syncCurrentSession', syncCurrentSession),
    vscode.commands.registerCommand('sprintly.syncPendingSessions', syncPendingSessions),
    vscode.commands.registerCommand('sprintly.viewSyncStatus', viewSyncStatus),
    vscode.commands.registerCommand('sprintly.disconnect', disconnect),
    vscode.commands.registerCommand('sprintly.connectWebsite', connectWebsite),
    vscode.commands.registerCommand('sprintly.shareSession', shareSession),
    vscode.commands.registerCommand('sprintly.syncHistory', syncHistory),
    vscode.commands.registerCommand('sprintly.joinLeaderboard', joinLeaderboard),
    vscode.commands.registerCommand('sprintly.saveSession', exportData),
    vscode.commands.registerCommand(SESSION_PANEL_COMMAND, () => showStatusPanel(tracker, sessionStore, historyStore, syncService)),
    vscode.commands.registerCommand('sprintly.openPanel', () => showStatusPanel(tracker, sessionStore, historyStore, syncService)),
  );

  return { handleMasterToggle };
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

function triggerCompletedSync(
  syncService: SprintlySyncService | undefined,
  record: SessionHistoryRecord | null,
): void {
  if (!syncService || !record) return;
  void syncService.syncCompletedSession(record).then((result) => {
    // Automatic sync is deliberately quiet; the durable status and Quick
    // Panel expose errors without interrupting the end-of-session flow.
    if (result.state === 'partial') {
      void vscode.window.showWarningMessage(
        `Sprintly uploaded the session with ${result.rejected.length} rejected record${result.rejected.length === 1 ? '' : 's'}. View Sync Status for details.`,
      );
    }
  }).catch(() => undefined);
}

function showSyncResult(result: SyncOperationResult, label: string): void {
  if (result.state === 'skipped') {
    void vscode.window.showInformationMessage(`${label} skipped: ${result.error ?? 'sync policy does not allow this upload.'}`);
    return;
  }
  if (result.state === 'synced') {
    const duplicateText = result.duplicateCount
      ? ` ${result.duplicateCount} duplicate${result.duplicateCount === 1 ? '' : 's'} treated as already synced.`
      : '';
    void vscode.window.showInformationMessage(
      `${label} complete: ${result.syncedCount} accepted.${duplicateText}`,
    );
    return;
  }
  if (result.state === 'partial') {
    void vscode.window.showWarningMessage(
      `${label} partially complete: ${result.syncedCount + result.duplicateCount} synced, ${result.rejected.length} rejected. ${result.rejected.map((entry) => `${entry.sessionId}: ${entry.reason}`).join('; ')}`,
    );
    return;
  }
  const details = result.error
    || result.rejected.map((entry) => `${entry.sessionId}: ${entry.reason}`).join('; ')
    || 'See Sprintly: View Sync Status.';
  void vscode.window.showErrorMessage(`${label} failed: ${details}`);
}

function formatSyncStatus(status: ReturnType<SprintlySyncService['getStatus']>): string {
  const lastSuccess = status.lastSuccessfulSync
    ? new Date(status.lastSuccessfulSync).toLocaleString()
    : 'Never';
  const error = status.lastSyncError ? `\nLast error: ${status.lastSyncError}` : '';
  return [
    `Sprintly sync: ${status.connectionStatus}`,
    `Environment: ${environmentLabel(status.environment)}`,
    `API: ${status.apiUrl}`,
    `Preference: ${status.syncPreference}${status.localOnly ? ' (local-only)' : ''}`,
    `Pending: ${status.pendingCount} · Failed: ${status.failedCount}`,
    `Last successful sync: ${lastSuccess}${error}`,
  ].join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The requested Sprintly operation failed.';
}
