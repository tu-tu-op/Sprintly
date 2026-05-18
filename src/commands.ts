import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { SprintlyStatusBar, makeProgressBar } from './statusBar';
import { runConsentFlow } from './consentFlow';

export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  statusBar: SprintlyStatusBar,
): void {
  const refresh = () => statusBar.update();

  const start = () => {
    tracker.start(); refresh();
    vscode.window.showInformationMessage('🏃 Sprintly — Session started!');
  };
  const pause  = () => { tracker.pause();  refresh(); };
  const resume = () => { tracker.resume(); refresh(); };
  const stop   = () => {
    const s = tracker.get();
    tracker.stop(); refresh();
    vscode.window.showInformationMessage(
      `✅ Sprintly — Session ended. ${s.fileEdits} edits · ${Math.floor(s.durationSeconds / 60)}m`);
  };
  const reset = () => { tracker.reset(); refresh(); };

  context.subscriptions.push(
    vscode.commands.registerCommand('sprintly.startSession',
      () => runConsentFlow(context, start)),
    vscode.commands.registerCommand('sprintly.stopSession',      stop),
    vscode.commands.registerCommand('sprintly.pauseSession',     pause),
    vscode.commands.registerCommand('sprintly.resumeSession',    resume),
    vscode.commands.registerCommand('sprintly.resetSession',     reset),
    vscode.commands.registerCommand('sprintly.showStatusPanel',
      () => showStatusPanel(tracker)),
  );
}

// ─── QuickPick Floating Mini Panel ────────────────────────────────────────────

export async function showStatusPanel(tracker: SessionTracker): Promise<void> {
  const s = tracker.get();

  const mm  = String(Math.floor(s.durationSeconds / 60)).padStart(2, '0');
  const ss  = String(s.durationSeconds % 60).padStart(2, '0');
  const dur = `${mm}:${ss}`;

  // Activity progress bar
  const editPct = Math.min(100, Math.round((s.fileEdits / 100) * 100));
  const editBar = makeProgressBar(editPct);

  // ── Create QuickPick ────────────────────────────────────────────────────────
  const qp = vscode.window.createQuickPick();
  qp.title              = '$(pulse) Sprintly';
  qp.placeholder        = '';
  qp.ignoreFocusOut     = false;   // dismiss on click-away, like Copilot's card
  qp.matchOnDescription = false;   // never filter rows as user types
  qp.matchOnDetail      = false;

  // ── Header buttons (Copilot-style gear + refresh) ──────────────────────────
  qp.buttons = [
    { iconPath: new vscode.ThemeIcon('refresh'),       tooltip: 'Refresh Stats' },
    { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Open Settings' },
  ];

  qp.onDidTriggerButton(btn => {
    const id = (btn.iconPath as vscode.ThemeIcon).id;
    if (id === 'refresh') {
      // Re-open with fresh data
      qp.hide();
      vscode.commands.executeCommand('sprintly.showStatusPanel');
    } else if (id === 'settings-gear') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
    }
    qp.hide();
  });

  // ── Items ──────────────────────────────────────────────────────────────────
  qp.items = [

    // ── Status section ───────────────────────────────────────────────────────
    { label: 'Status', kind: vscode.QuickPickItemKind.Separator },
    {
      label:       '$(record) Session',
      description: !s.isRecording ? 'Idle'
                 : s.isPaused     ? `Paused — ${dur}`
                 :                  `Active — ${dur}`,
      alwaysShow:  true,
    },
    {
      label:       '$(edit) Edits',
      description: `${s.fileEdits}`,
      detail:      s.isRecording
                     ? `${editBar}  ${editPct}% activity`
                     : undefined,
      alwaysShow:  true,
    },
    {
      label:       '$(save) Saves',
      description: `${s.fileSaves}`,
      alwaysShow:  true,
    },
    {
      label:       '$(files) Files touched',
      description: `${s.activeFiles.size}`,
      alwaysShow:  true,
    },
    {
      label:       '$(list-ordered) Lines changed',
      description: `${s.linesChanged}`,
      alwaysShow:  true,
    },
    {
      label:       '$(terminal) Terminal opens',
      description: `${s.terminalCommands}`,
      alwaysShow:  true,
    },
    {
      label:       '$(sparkle) Archetype',
      description: tracker.archetype(),
      alwaysShow:  true,
    },

    // ── Options section — all existing commands ───────────────────────────────
    { label: 'Options', kind: vscode.QuickPickItemKind.Separator },
    {
      label:      '$(play) Start Session',
      alwaysShow: true,
    },
    {
      label:      '$(debug-pause) Pause Session',
      alwaysShow: true,
    },
    {
      label:      '$(debug-continue) Resume Session',
      alwaysShow: true,
    },
    {
      label:      '$(stop-circle) Stop Session',
      alwaysShow: true,
    },
    {
      label:      '$(refresh) Reset Session',
      alwaysShow: true,
    },

    // ── Actions section ───────────────────────────────────────────────────────
    { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
    {
      label:      '$(settings-gear) Open Settings',
      alwaysShow: true,
    },
  ];

  // ── Routing ─────────────────────────────────────────────────────────────────
  qp.onDidAccept(() => {
    const selected = qp.selectedItems[0];
    if (!selected) { qp.hide(); return; }

    const label = selected.label;

    if      (label.includes('Start Session'))   { vscode.commands.executeCommand('sprintly.startSession'); }
    else if (label.includes('Pause Session'))   { vscode.commands.executeCommand('sprintly.pauseSession'); }
    else if (label.includes('Resume Session'))  { vscode.commands.executeCommand('sprintly.resumeSession'); }
    else if (label.includes('Stop Session'))    { vscode.commands.executeCommand('sprintly.stopSession'); }
    else if (label.includes('Reset Session'))   { vscode.commands.executeCommand('sprintly.resetSession'); }
    else if (label.includes('Open Settings'))   {
      vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
    }

    qp.hide();
  });

  qp.show();
}
