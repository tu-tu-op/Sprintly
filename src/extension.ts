import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { isSprintlyEnabled, runConsentFlow } from './consentFlow';
import { SessionTracker } from './sessionTracker';
import { initStatusBar } from './panels/statusBar';
import { AgentLogWatcher } from './tracking/agentLogWatcher';
import { BuildFailureTracker } from './tracking/buildFailureTracker';
import { DailyStateStore } from './tracking/dailyStateStore';
import { SessionActivityTracker } from './tracking/sessionActivityTracker';
import { LocalSessionStore } from './tracking/localSessionStore';
import { WebsiteHandoffService } from './tracking/websiteHandoff';
import {
  demoLeaderboardData,
  demoHistoryData,
  demoSessionData,
  demoSessionResult,
  demoStats,
  showHistoryPanel,
  showLeaderboardPanel,
  showOpeningPanel,
  showSessionActivePanel,
  showSessionEndPanel,
} from './panels/sprintlyPanels';

export function activate(context: vscode.ExtensionContext): void {
  const tracker = new SessionTracker();
  // Session history and its current draft are workspace-owned. This prevents
  // opening another repository from exposing or merging private activity.
  const dailyStore = new DailyStateStore(context.workspaceState);
  const historyStore = new LocalSessionStore(context.workspaceState);
  const handoff = new WebsiteHandoffService();
  const sessionActivityTracker = new SessionActivityTracker(dailyStore);
  const workspacePaths = (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => folder.uri.fsPath);
  const agentLogWatcher = new AgentLogWatcher(dailyStore, undefined, workspacePaths);
  const buildFailureTracker = new BuildFailureTracker(dailyStore);
  const statusBar = initStatusBar(context, tracker, dailyStore);

  context.subscriptions.push(
    tracker,
    sessionActivityTracker,
    agentLogWatcher,
    buildFailureTracker,
    dailyStore,
    historyStore,
    handoff,
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('sprintly.historyRetention')) {
        historyStore.applyRetention();
      }
    }),
  );
  const interruptedId = dailyStore.getInterruptedSessionId();
  if (interruptedId) {
    historyStore.recoverInterruptedSession(interruptedId, dailyStore.get().session.endedAt ?? Date.now());
  }
  registerCommands(context, tracker, statusBar, dailyStore, agentLogWatcher, historyStore, handoff);
  if (isSprintlyEnabled()) {
    void agentLogWatcher.start().catch(() => undefined);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('sprintly.devOpenScreen', async () => {
      const pick = await pickDevScreen();

      if (!pick) {
        return;
      }

      if (pick.id === 'open') {
        runPanel(() => showOpeningPanel(context, demoStats()));
      } else if (pick.id === 'session') {
        runPanel(() => showSessionActivePanel(context, demoSessionData()));
      } else if (pick.id === 'leaderboard') {
        runPanel(() => showLeaderboardPanel(context, demoLeaderboardData()));
      } else if (pick.id === 'history') {
        runPanel(() => showHistoryPanel(context, demoHistoryData()));
      } else if (pick.id === 'end') {
        runPanel(() => showSessionEndPanel(context, demoSessionResult()));
      }
    }),
  );

  void runConsentFlow(async () => {
    await vscode.commands.executeCommand('sprintly.startSession');
  }, context).catch(() => undefined);
}

export function deactivate(): void {}

interface DevScreenPick extends vscode.QuickPickItem {
  id: 'open' | 'session' | 'leaderboard' | 'history' | 'end';
}

async function pickDevScreen(): Promise<DevScreenPick | undefined> {
  try {
    return await vscode.window.showQuickPick(
      [
        { label: '$(zap) Opening Screen', id: 'open', alwaysShow: true },
        { label: '$(debug-start) Session Live', id: 'session', alwaysShow: true },
        { label: '$(trophy) Leaderboard', id: 'leaderboard', alwaysShow: true },
        { label: '$(history) History', id: 'history', alwaysShow: true },
        { label: '$(star-full) Session End', id: 'end', alwaysShow: true },
      ],
      {
        title: 'Sprintly - Jump to Screen',
        placeHolder: '',
        matchOnDescription: false,
        matchOnDetail: false,
      },
    );
  } catch {
    showInfo('—');
    return undefined;
  }
}

function runPanel(task: () => Promise<void>): void {
  void task().catch(() => {
    showInfo('—');
  });
}

function showInfo(message: string): void {
  void Promise.resolve(vscode.window.showInformationMessage(message)).catch(() => undefined);
}
