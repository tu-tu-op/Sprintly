const vscode = require('vscode');
const { SessionManager } = require('./session/sessionManager');
const { SessionStore } = require('./state/sessionStore');
const { StatusBarController } = require('./ui/statusBarController');
const { SessionStatsViewProvider } = require('./ui/sessionPanel');
const { showConsentPrompt } = require('./ui/consentPrompt');
const { ActivityTracker } = require('./session/activityTracker');

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  const store = new SessionStore(context.globalState);
  const sessionManager = new SessionManager(store);
  await sessionManager.initialize();

  // Bottom-panel WebviewView — registered via WebviewViewProvider, not createWebviewPanel.
  // VS Code renders this in the Terminal/Output/Problems strip, not as an editor tab.
  const statsProvider = new SessionStatsViewProvider(context.extensionUri, sessionManager);

  const statusBarController = new StatusBarController(sessionManager);
  const activityTracker = new ActivityTracker(sessionManager);
  activityTracker.start();

  // ── WebviewViewProvider registration ──────────────────────────────────────
  // retainContextWhenHidden keeps the webview alive when the panel is collapsed,
  // so re-opening it is instant and avoids a full HTML re-render.
  const viewProviderDisposable = vscode.window.registerWebviewViewProvider(
    'sprintly.sessionStatsView',
    statsProvider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  const showPromptCommand = vscode.commands.registerCommand(
    'sprintly.showConsentPrompt',
    async () => {
      await showConsentPrompt(sessionManager, statsProvider);
    }
  );

  // Primary entry point: status bar icon fires this command.
  // Focuses the bottom-panel view — no editor tab is opened.
  const toggleStatsCommand = vscode.commands.registerCommand(
    'sprintly.toggleStats',
    () => {
      statsProvider.show();
    }
  );

  const openPanelCommand = vscode.commands.registerCommand(
    'sprintly.openSessionPanel',
    () => {
      statsProvider.show();
    }
  );

  const pauseCommand = vscode.commands.registerCommand(
    'sprintly.pauseRecording',
    () => {
      sessionManager.pauseRecording();
    }
  );

  const resumeCommand = vscode.commands.registerCommand(
    'sprintly.resumeRecording',
    () => {
      sessionManager.resumeRecording();
    }
  );

  const stopCommand = vscode.commands.registerCommand(
    'sprintly.stopRecording',
    async () => {
      await sessionManager.stopRecording();
    }
  );

  const resetCommand = vscode.commands.registerCommand(
    'sprintly.resetSession',
    () => {
      sessionManager.resetCurrentSession();
    }
  );

  context.subscriptions.push(
    viewProviderDisposable,
    sessionManager,
    statsProvider,
    statusBarController,
    activityTracker,
    showPromptCommand,
    toggleStatsCommand,
    openPanelCommand,
    pauseCommand,
    resumeCommand,
    stopCommand,
    resetCommand
  );

  // Consent prompt on startup — separate from the popup UI
  await showConsentPrompt(sessionManager, statsProvider, { source: 'startup' });
}

function deactivate() {
  return undefined;
}

module.exports = {
  activate,
  deactivate
};
