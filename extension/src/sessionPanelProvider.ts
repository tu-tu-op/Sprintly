import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { getPanelHtml } from './panelHtml';

export const SESSION_VIEW_ID = 'sprintly.sessionView';

export class SessionPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private pushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly tracker: SessionTracker,
    private readonly context: vscode.ExtensionContext,
    private readonly onStart:  () => void,
    private readonly onPause:  () => void,
    private readonly onResume: () => void,
    private readonly onStop:   () => void,
    private readonly onReset:  () => void,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = getPanelHtml(webviewView.webview);

    // Push stats immediately when panel opens
    this._push();

    // Push every second while visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._push();
        this._startPushTimer();
      } else {
        this._stopPushTimer();
      }
    });
    this._startPushTimer();

    // Handle button clicks from the webview
    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'start':        this.onStart();  break;
        case 'pause':        this.onPause();  break;
        case 'resume':       this.onResume(); break;
        case 'stop':         this.onStop();   break;
        case 'reset':        this.onReset();  break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
          break;
      }
    });
  }

  /** Called externally to force a stat refresh (e.g. after start/stop). */
  refresh(): void { this._push(); }

  private _push(): void {
    if (!this.view?.visible) return;
    const stats = this.tracker.get();
    this.view.webview.postMessage({
      type: 'update',
      stats: {
        isRecording:      stats.isRecording,
        isPaused:         stats.isPaused,
        durationSeconds:  stats.durationSeconds,
        fileEdits:        stats.fileEdits,
        fileSaves:        stats.fileSaves,
        fileSwitches:     stats.fileSwitches,
        activeFilesCount: stats.activeFiles.size,
        linesChanged:     stats.linesChanged,
        terminalCommands: stats.terminalCommands,
        startedAt:        stats.startedAt?.toISOString() ?? null,
        archetype:        this.tracker.archetype(),
      },
    });
  }

  private _startPushTimer(): void {
    if (this.pushTimer) return;
    this.pushTimer = setInterval(() => this._push(), 1000);
  }

  private _stopPushTimer(): void {
    if (this.pushTimer) { clearInterval(this.pushTimer); this.pushTimer = null; }
  }

  dispose(): void { this._stopPushTimer(); }
}
