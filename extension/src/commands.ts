import * as vscode from 'vscode';
import { requestSessionStart } from './consentFlow';
import { showStatusPanel } from './panels/sessionQuickPick';
import { SessionTracker } from './sessionTracker';
import { AgentLogWatcher } from './tracking/agentLogWatcher';
import { DailyStateStore } from './tracking/dailyStateStore';

interface StatusBarUpdater {
  update(): void;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  statusBar: StatusBarUpdater,
  sessionStore: DailyStateStore,
  agentLogWatcher: AgentLogWatcher,
): void {
  const refresh = (): void => statusBar.update();

  const start = async (): Promise<void> => {
    if (!(await requestSessionStart())) {
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

  context.subscriptions.push(
    vscode.commands.registerCommand('sprintly.startSession', start),
    vscode.commands.registerCommand('sprintly.stopSession', stop),
    vscode.commands.registerCommand('sprintly.pauseSession', pause),
    vscode.commands.registerCommand('sprintly.resumeSession', resume),
    vscode.commands.registerCommand('sprintly.resetSession', reset),
    vscode.commands.registerCommand(
      'sprintly.showStatusPanel',
      () => showStatusPanel(tracker, sessionStore),
    ),
  );
}

export { showStatusPanel } from './panels/sessionQuickPick';
