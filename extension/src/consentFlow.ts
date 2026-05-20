import * as vscode from 'vscode';

export async function runConsentFlow(
  context: vscode.ExtensionContext,
  onAccept: () => void
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    '🏃 Sprintly — Want to record this coding session?',
    { modal: false },
    'Start Recording',
    'Not now',
  );
  if (choice === 'Start Recording') onAccept();
}
