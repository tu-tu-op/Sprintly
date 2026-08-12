import * as vscode from 'vscode';

export const START_SPRINT_LABEL = '$(play) Start Sprint';
const STARTUP_PROMPT_MARKER = 'sprintly.startupPromptProcess';

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

export async function shouldPromptOnStartup(context: vscode.ExtensionContext): Promise<boolean> {
  if (!isSprintlyEnabled() || !isAutoPromptEnabled()) {
    return false;
  }

  const workspaceKey = getWorkspaceKey();
  const marker = `${process.pid}:${workspaceKey}`;
  if (context.workspaceState.get<string>(STARTUP_PROMPT_MARKER) === marker) {
    return false;
  }
  await context.workspaceState.update(STARTUP_PROMPT_MARKER, marker);
  return true;
}

export function isSprintlyEnabled(): boolean {
  return getSprintlyConfiguration().get<boolean>('enabled', true) !== false;
}

export function isAutoPromptEnabled(): boolean {
  return getSprintlyConfiguration().get<boolean>('autoPromptOnStartup', true) !== false;
}

export async function runConsentFlow(
  onAccept: () => void | Promise<void>,
  context?: vscode.ExtensionContext,
): Promise<void> {
  if (context && !(await shouldPromptOnStartup(context))) {
    return;
  }
  if (await requestSessionStart()) {
    await onAccept();
  }
}

function getSprintlyConfiguration(): vscode.WorkspaceConfiguration {
  if (vscode.workspace?.getConfiguration) {
    return vscode.workspace.getConfiguration('sprintly');
  }
  return { get: <T>(_key: string, defaultValue?: T) => defaultValue } as vscode.WorkspaceConfiguration;
}

function getWorkspaceKey(): string {
  const workspaceFile = vscode.workspace?.workspaceFile?.toString();
  if (workspaceFile) {
    return workspaceFile;
  }
  const folders = (vscode.workspace?.workspaceFolders ?? [])
    .map((folder) => folder.uri.toString())
    .sort();
  return folders.join('|') || 'untitled';
}
