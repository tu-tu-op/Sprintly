import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { SprintlyStatusBar } from './statusBar';
import { registerCommands } from './commands';
import { runConsentFlow } from './consentFlow';

export function activate(context: vscode.ExtensionContext): void {
  const tracker   = new SessionTracker();
  const statusBar = new SprintlyStatusBar(tracker, context);

  context.subscriptions.push(tracker, statusBar);

  registerCommands(context, tracker, statusBar);

  // Startup consent — never auto-starts
  runConsentFlow(context, () => {
    tracker.start();
    statusBar.update();
    vscode.window.showInformationMessage('🏃 Sprintly — Recording started!');
  });
}

export function deactivate(): void {}
