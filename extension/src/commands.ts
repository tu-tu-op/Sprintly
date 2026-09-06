import * as vscode from 'vscode';
import { SESSION_PANEL_COMMAND, showStatusPanel } from './panels/sessionQuickPick';
import { SessionTracker } from './sessionTracker';
import { AgentLogWatcher } from './tracking/agentLogWatcher';
import { DailyStateStore } from './tracking/dailyStateStore';
import { isSprintlyEnabled } from './consentFlow';
import {
  buildSessionHistoryRecord,
  SessionHistoryStore,
} from './tracking/sessionHistory';
import { calculateDeveloperMetrics, deriveDeveloperProfile } from './tracking/developerMetrics';

interface StatusBarUpdater {
  update(): void;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  statusBar: StatusBarUpdater,
  sessionStore: DailyStateStore,
  agentLogWatcher: AgentLogWatcher,
  historyStore: SessionHistoryStore,
): void {
  const refresh = (): void => statusBar.update();

  const start = async (): Promise<void> => {
    if (!isSprintlyEnabled()) {
      void vscode.window.showInformationMessage('Sprintly is disabled in Settings.');
      return;
    }
    await agentLogWatcher.scanNow();
    sessionStore.startSession();
    tracker.start();
    refresh();
    void vscode.window.showInformationMessage('Sprintly session started.');
  };

  const pause = async (): Promise<void> => {
    await agentLogWatcher.scanNow();
    sessionStore.pauseSession();
    tracker.pause();
    refresh();
  };

  const resume = async (): Promise<void> => {
    await agentLogWatcher.scanNow();
    sessionStore.resumeSession();
    tracker.resume();
    refresh();
  };

  const stop = async (): Promise<void> => {
    const stats = tracker.get();
    await agentLogWatcher.scanNow();
    sessionStore.stopSession();
    const finalState = sessionStore.get();
    const metricsInput = {
      sessionDurationMs: stats.durationSeconds * 1000,
      coding: {
        manualMs: finalState.session.manualMs,
        aiAssistedMs: finalState.session.aiAssistedMs,
        automationMs: finalState.session.automationMs,
        unknownBulkMs: finalState.session.unknownBulkMs,
      },
      fileEdits: stats.fileEdits,
      fileSaves: stats.fileSaves,
      fileSwitches: stats.fileSwitches,
      terminalCommands: stats.terminalCommands,
      terminalCommandsByCategory: stats.terminalCommandsByCategory,
      failures: finalState.buildFailures.total,
      recoveredFailures: finalState.buildFailures.recoveredFailures,
      successfulRuns: finalState.buildFailures.successfulRuns,
    };
    const profile = deriveDeveloperProfile(metricsInput);
    const historyRecord = buildSessionHistoryRecord(
      finalState,
      stats,
      profile.primary,
      profile.traits,
      calculateDeveloperMetrics(metricsInput),
      finalState.session.endedAt ?? Date.now(),
    );
    if (historyRecord) {
      historyStore.append(historyRecord);
    }
    tracker.stop();
    refresh();
    void vscode.window.showInformationMessage(
      `Sprintly session ended: ${stats.fileEdits} edits · ${Math.floor(stats.durationSeconds / 60)}m`,
    );
  };

  const reset = async (): Promise<void> => {
    await agentLogWatcher.scanNow();
    sessionStore.resetSession();
    tracker.reset();
    refresh();
  };

  const connectWebsite = async (): Promise<void> => {
    const configuredUrl = vscode.workspace
      .getConfiguration('sprintly')
      .get<string>('websiteUrl', 'https://sprintly.app/connect');
    try {
      const url = new URL(configuredUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Unsupported website URL protocol');
      }
      const opened = await vscode.env.openExternal(vscode.Uri.parse(url.toString()));
      if (!opened) {
        throw new Error('The website could not be opened');
      }
    } catch {
      void vscode.window.showErrorMessage('Sprintly website URL is invalid or could not be opened.');
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('sprintly.startSession', start),
    vscode.commands.registerCommand('sprintly.stopSession', stop),
    vscode.commands.registerCommand('sprintly.pauseSession', pause),
    vscode.commands.registerCommand('sprintly.resumeSession', resume),
    vscode.commands.registerCommand('sprintly.resetSession', reset),
    vscode.commands.registerCommand('sprintly.connectWebsite', connectWebsite),
    vscode.commands.registerCommand('sprintly.clearHistory', () => {
      historyStore.clear();
      void vscode.window.showInformationMessage('Sprintly session history cleared.');
    }),
    vscode.commands.registerCommand(SESSION_PANEL_COMMAND, () => showStatusPanel(tracker, sessionStore)),
    vscode.commands.registerCommand('sprintly.openPanel', () => showStatusPanel(tracker, sessionStore)),
  );
}

export { showStatusPanel } from './panels/sessionQuickPick';
