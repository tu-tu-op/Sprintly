import * as vscode from 'vscode';

export const START_SPRINT_LABEL = '$(play) Start Sprint';

interface SessionStartChoice extends vscode.QuickPickItem {
  action: 'start' | 'dismiss';
}

export async function requestSessionStart(): Promise<boolean> {
  const choice = await vscode.window.showQuickPick<SessionStartChoice>(
    [
      {
        label: 'Session tracking',
        kind: vscode.QuickPickItemKind.Separator,
        action: 'dismiss',
      },
      {
        label: START_SPRINT_LABEL,
        description: 'Track this coding session',
        detail: 'Counts activity, agent usage, tokens, and build failures. Source code and command text stay private.',
        action: 'start',
        alwaysShow: true,
      },
      {
        label: '$(close) Not Now',
        description: 'Keep Sprintly idle',
        action: 'dismiss',
        alwaysShow: true,
      },
    ],
    {
      title: 'Sprintly',
      placeHolder: 'Choose how to begin',
      matchOnDescription: false,
      matchOnDetail: false,
      ignoreFocusOut: false,
    },
  );

  return choice?.action === 'start';
}

export async function runConsentFlow(onAccept: () => void | Promise<void>): Promise<void> {
  if (await requestSessionStart()) {
    await onAccept();
  }
}
