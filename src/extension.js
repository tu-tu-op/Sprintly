const vscode = require('vscode');
const { SessionManager } = require('./session/sessionManager');
const { SessionStore } = require('./state/sessionStore');
const { StatusBarController } = require('./ui/statusBarController');
const { SessionPanel } = require('./ui/sessionPanel');
const { showConsentPrompt } = require('./ui/consentPrompt');
const { ActivityTracker } = require('./session/activityTracker');

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  const store = new SessionStore(context.globalState);
  const sessionManager = new SessionManager(store);
  await sessionManager.initialize();

  const sessionPanel = new SessionPanel(context.extensionUri, sessionManager);
  sessionPanel.register(context);
  const statusBarController = new StatusBarController(sessionManager);
  const activityTracker = new ActivityTracker(sessionManager);
  activityTracker.start();

  const showPromptCommand = vscode.commands.registerCommand('devStrava.showConsentPrompt', async () => {
    await showConsentPrompt(sessionManager, sessionPanel);
  });

  const toggleStatsCommand = vscode.commands.registerCommand('devStrava.toggleStats', () => {
    vscode.commands.executeCommand('devStravaStatsView.focus');
  });

  const openPanelCommand = vscode.commands.registerCommand('devStrava.openSessionPanel', () => {
    sessionPanel.show();
  });

  const pauseCommand = vscode.commands.registerCommand('devStrava.pauseRecording', () => {
    sessionManager.pauseRecording();
  });

  const resumeCommand = vscode.commands.registerCommand('devStrava.resumeRecording', () => {
    sessionManager.resumeRecording();
  });

  const stopCommand = vscode.commands.registerCommand('devStrava.stopRecording', async () => {
    await sessionManager.stopRecording();
  });

  const resetCommand = vscode.commands.registerCommand('devStrava.resetSession', () => {
    sessionManager.resetCurrentSession();
  });

  context.subscriptions.push(
    sessionManager,
    sessionPanel,
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

  await showConsentPrompt(sessionManager, sessionPanel, { source: 'startup' });
}

function deactivate() {
  return undefined;
}

module.exports = {
  activate,
  deactivate
};
