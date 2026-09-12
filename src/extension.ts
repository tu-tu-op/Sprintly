import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { runConsentFlow } from './consentFlow';
import { SessionTracker } from './sessionTracker';
import { initStatusBar } from './panels/statusBar';
import { AgentLogWatcher } from './tracking/agentLogWatcher';
import { BuildFailureTracker } from './tracking/buildFailureTracker';
import { DailyStateStore } from './tracking/dailyStateStore';
import { SessionActivityTracker } from './tracking/sessionActivityTracker';
import { LocalSessionStore } from './tracking/localSessionStore';
import { WebsiteHandoffService } from './tracking/websiteHandoff';
import { SprintlySyncService } from './integration/sprintlySync';
import { SprintlyTokenStore } from './integration/secureTokenStore';
import { SyncOutbox } from './integration/syncOutbox';
import { SyncStateStore } from './integration/syncState';
import { parseSprintlyPairingIntent } from './integration/connectionUri';
import { getSprintlyConnectionSettings } from './integration/connectionSettings';
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
  const connectionLog = vscode.window.createOutputChannel('Sprintly', { log: true });
  connectionLog.info(
    `Activating ${context.extension.id} v${String(context.extension.packageJSON.version)} from ${context.extensionPath}`,
  );
  const tracker = new SessionTracker();
  // Session history and its current draft are workspace-owned. This prevents
  // opening another repository from exposing or merging private activity.
  const dailyStore = new DailyStateStore(context.workspaceState);
  const historyStore = new LocalSessionStore(context.workspaceState);
  const handoff = new WebsiteHandoffService();
  const syncOutbox = new SyncOutbox(context.workspaceState);
  const syncStateStore = new SyncStateStore(context.workspaceState);
  const syncService = new SprintlySyncService({
    tokenStore: new SprintlyTokenStore(context.secrets),
    outbox: syncOutbox,
    stateStore: syncStateStore,
  });
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
    syncOutbox,
    connectionLog,
  );
  // Recover an interrupted session from the last durable observation so the
  // finalized draft and DailyState boundaries agree (audit Bug #2).
  const interruptedId = dailyStore.getInterruptedSessionId();
  if (interruptedId) {
    historyStore.recoverInterruptedSession(interruptedId, dailyStore.get().session.endedAt ?? Date.now());
  }
  const lifecycleControls = registerCommands(
    context,
    tracker,
    statusBar,
    dailyStore,
    agentLogWatcher,
    historyStore,
    handoff,
    syncService,
  );

  // The website's “Open VS Code” button targets publisher.name from the
  // extension manifest. VS Code routes that URI to this handler in the window
  // where Sprintly is installed, including remote extension hosts.
  // handler completes pairing automatically without putting a device token in
  // the URL; the short-lived code is exchanged directly with the website API.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: (uri) => {
        connectionLog.info('Pairing URI received', {
          scheme: uri.scheme,
          authority: uri.authority,
          path: uri.path,
        });
        const intent = parseSprintlyPairingIntent(uri, context.extension.id);
        if (!intent) {
          connectionLog.warn('Pairing URI rejected before code exchange');
          return;
        }

        const configuredApi = getSprintlyConnectionSettings().apiUrl;
        if (intent.apiUrl && !sameApiOrigin(intent.apiUrl, configuredApi)) {
          connectionLog.warn('Pairing URI API origin does not match sprintly.apiUrl');
          void vscode.window.showWarningMessage(
            'The pairing link targets a different Sprintly API. Set sprintly.apiUrl to that website origin, then try again.',
          );
          return;
        }

        connectionLog.info('Exchanging one-time pairing code');
        void syncService.connectWithPairingCode(intent.code)
          .then(() => {
            connectionLog.info('Automatic pairing completed');
            void vscode.window.showInformationMessage('Sprintly extension connected automatically.');
          })
          .catch((error: unknown) => {
            connectionLog.error(
              `Automatic pairing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            void vscode.window.showErrorMessage(
              `Sprintly automatic connection failed: ${error instanceof Error ? error.message : 'pairing could not be completed.'}`,
            );
          });
      },
    }),
  );
  connectionLog.info(`URI handler registered for ${context.extension.id}`);

  // Privacy boundary: the agent-log watcher is constructed dormant. It only
  // discovers, reads, watches, or persists cursor state after the user
  // explicitly starts a sprint (see commands.ts start()).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('sprintly.historyRetention')) {
        historyStore.applyRetention();
      }
      if (event.affectsConfiguration('sprintly.enabled')) {
        lifecycleControls.handleMasterToggle();
      }
    }),
  );

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

  // Resume explicit/completed uploads after activation and periodically so a
  // temporary website outage does not require restarting VS Code manually.
  void syncService.resume().catch(() => undefined);
  const retryTimer = setInterval(() => {
    void syncService.resume().catch(() => undefined);
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(retryTimer) });

  void runConsentFlow(async () => {
    await vscode.commands.executeCommand('sprintly.startSession');
  }, context).catch(() => undefined);
}

export function deactivate(): void {}

function sameApiOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

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
