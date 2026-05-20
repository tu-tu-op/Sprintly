# Sprintly — VS Code Extension (Complete Rebuild)

## What was wrong with every previous version
- `createQuickPick()` and `showQuickPick()` are command-palette-style dropdowns.
  They are NOT the floating panel GitHub Copilot shows. Delete all of it.
- The correct VS Code API is `WebviewViewProvider` + a view registered under a
  `viewsContainers.panel` entry in `package.json`.
- When the status bar icon is clicked, it runs
  `vscode.commands.executeCommand('sprintly.sessionView.focus')` which slides open
  a docked webview panel above the status bar — exactly like Copilot's panel.
- Discard and overwrite every previously generated file. Start from zero.

---

## How GitHub Copilot's mini panel actually works

1. `package.json` registers a `viewsContainers.panel` entry and a `views` webview inside it.
2. The extension registers a `WebviewViewProvider` for that view ID.
3. The status bar item's `.command` calls `sprintly.sessionView.focus` (VS Code auto-generates
   a `<viewId>.focus` command for every registered webview view).
4. VS Code opens the panel area and renders the provider's HTML — a rich UI with tabs,
   live stats, progress bars, and action buttons.
5. The extension pushes stat updates into the webview via `webview.postMessage()` every second.
6. The webview sends action events back via `window.vscode.postMessage()`.

---

## Strict file structure — create every file listed, overwrite everything

```
sprintly/
├── src/
│   ├── extension.ts            ← activate/deactivate
│   ├── statusBar.ts            ← StatusBarItem, live timer text
│   ├── sessionTracker.ts       ← all tracking logic, no VS Code UI
│   ├── consentFlow.ts          ← startup consent notification
│   ├── sessionPanelProvider.ts ← WebviewViewProvider (the mini panel)
│   ├── panelHtml.ts            ← returns the full HTML string for the webview
│   └── commands.ts             ← registers all commands
├── package.json
├── tsconfig.json
└── .vscodeignore
```

---

## `src/sessionTracker.ts`

```typescript
import * as vscode from 'vscode';

export interface SessionStats {
  isRecording: boolean;
  startedAt: Date | null;
  durationSeconds: number;
  fileEdits: number;
  fileSaves: number;
  fileSwitches: number;
  activeFiles: Set<string>;
  linesChanged: number;
  terminalCommands: number;
  isPaused: boolean;
  totalPausedSeconds: number;
  pausedAt: Date | null;
}

export class SessionTracker implements vscode.Disposable {
  private stats: SessionStats = this.blank();
  private listeners: vscode.Disposable[] = [];
  private tick: NodeJS.Timeout | null = null;

  /** Fired whenever stats change so subscribers can push updates to the webview */
  readonly onDidUpdate = new vscode.EventEmitter<SessionStats>();

  private blank(): SessionStats {
    return {
      isRecording: false, startedAt: null, durationSeconds: 0,
      fileEdits: 0, fileSaves: 0, fileSwitches: 0,
      activeFiles: new Set(), linesChanged: 0, terminalCommands: 0,
      isPaused: false, totalPausedSeconds: 0, pausedAt: null,
    };
  }

  start(): void {
    this.stats = this.blank();
    this.stats.isRecording = true;
    this.stats.startedAt = new Date();
    this._attach();
    this._startTick();
    this._emit();
  }

  pause(): void {
    if (!this.stats.isRecording || this.stats.isPaused) return;
    this.stats.isPaused = true;
    this.stats.pausedAt = new Date();
    if (this.tick) clearInterval(this.tick);
    this._emit();
  }

  resume(): void {
    if (!this.stats.isPaused || !this.stats.pausedAt) return;
    this.stats.totalPausedSeconds += (Date.now() - this.stats.pausedAt.getTime()) / 1000;
    this.stats.isPaused = false;
    this.stats.pausedAt = null;
    this._startTick();
    this._emit();
  }

  stop(): void {
    this.stats.isRecording = false;
    this.stats.isPaused = false;
    if (this.tick) clearInterval(this.tick);
    this._detach();
    this._emit();
  }

  reset(): void {
    this.stop();
    this.stats = this.blank();
    this._emit();
  }

  get(): Readonly<SessionStats> {
    return { ...this.stats, activeFiles: new Set(this.stats.activeFiles) };
  }

  archetype(): string {
    const s = this.stats;
    if (s.durationSeconds < 30) return '🌱 Just warming up';
    const epm = (s.fileEdits / Math.max(s.durationSeconds, 1)) * 60;
    const tpi = s.terminalCommands / Math.max(s.durationSeconds / 60, 1);
    if (tpi > 5)           return '⚡ Terminal Warrior';
    if (epm > 20)          return '🔥 Vibe Coder';
    if (s.fileSaves > s.fileEdits * 0.8) return '🎯 Precision Coder';
    if (s.linesChanged > 200)            return '🚀 Hardcore Sprint';
    return '🧘 Steady Builder';
  }

  private _emit(): void { this.onDidUpdate.fire(this.get()); }

  private _startTick(): void {
    this.tick = setInterval(() => {
      if (this.stats.startedAt && !this.stats.isPaused) {
        const elapsed = (Date.now() - this.stats.startedAt.getTime()) / 1000;
        this.stats.durationSeconds = Math.floor(elapsed - this.stats.totalPausedSeconds);
        this._emit();
      }
    }, 1000);
  }

  private _attach(): void {
    this.listeners.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!this.stats.isRecording || this.stats.isPaused) return;
        this.stats.fileEdits++;
        this.stats.linesChanged += e.contentChanges.reduce(
          (n, c) => n + Math.abs(c.text.split('\n').length - 1), 0);
        this.stats.activeFiles.add(e.document.fileName);
      }),
      vscode.workspace.onDidSaveTextDocument(() => {
        if (!this.stats.isRecording || this.stats.isPaused) return;
        this.stats.fileSaves++;
      }),
      vscode.window.onDidChangeActiveTextEditor(e => {
        if (!this.stats.isRecording || this.stats.isPaused || !e) return;
        this.stats.fileSwitches++;
        this.stats.activeFiles.add(e.document.fileName);
      }),
      vscode.window.onDidOpenTerminal(() => {
        if (!this.stats.isRecording || this.stats.isPaused) return;
        this.stats.terminalCommands++;
      })
    );
  }

  private _detach(): void {
    this.listeners.forEach(d => d.dispose());
    this.listeners = [];
  }

  dispose(): void {
    this.reset();
    this.onDidUpdate.dispose();
  }
}
```

---

## `src/panelHtml.ts`

Full HTML for the webview. Styled to match VS Code's native panel look.
Uses VS Code CSS variables so it automatically follows light/dark theme.

```typescript
import * as vscode from 'vscode';

export function getPanelHtml(webview: vscode.Webview): string {
  const nonce = Math.random().toString(36).slice(2);

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 0;
    user-select: none;
  }

  /* ── Tabs ─────────────────────────────────────────────── */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    padding: 0 12px;
    gap: 2px;
  }
  .tab {
    padding: 8px 12px 7px;
    font-size: 12px;
    cursor: pointer;
    color: var(--vscode-foreground);
    opacity: 0.7;
    border-bottom: 2px solid transparent;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
    outline: none;
    font-family: inherit;
    transition: opacity 0.1s;
  }
  .tab:hover { opacity: 1; }
  .tab.active {
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder, #007fd4);
    color: var(--vscode-foreground);
  }

  /* ── Panels ───────────────────────────────────────────── */
  .panel { display: none; padding: 12px; }
  .panel.active { display: block; }

  /* ── Idle state ───────────────────────────────────────── */
  .idle-card {
    background: var(--vscode-editor-inactiveSelectionBackground,
                    var(--vscode-input-background));
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 4px;
    padding: 16px;
    text-align: center;
    margin-bottom: 12px;
  }
  .idle-card .idle-icon { font-size: 28px; display: block; margin-bottom: 6px; }
  .idle-card .idle-title {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
    color: var(--vscode-foreground);
  }
  .idle-card .idle-sub {
    font-size: 11px;
    opacity: 0.6;
  }

  /* ── Stat card ────────────────────────────────────────── */
  .stat-card {
    background: var(--vscode-editor-inactiveSelectionBackground,
                    var(--vscode-input-background));
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .stat-card-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 2px;
  }
  .stat-label {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.55;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat-value {
    font-size: 22px;
    font-weight: 300;
    line-height: 1.1;
    color: var(--vscode-foreground);
  }
  .stat-detail {
    font-size: 11px;
    opacity: 0.6;
    margin-top: 2px;
  }

  /* ── Progress bar ─────────────────────────────────────── */
  .bar-track {
    height: 3px;
    border-radius: 2px;
    background: var(--vscode-progressBar-background, #007fd4);
    opacity: 0.25;
    margin-top: 6px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--vscode-progressBar-background, #007fd4);
    opacity: 4;
    transition: width 0.8s ease;
  }

  /* ── Archetype badge ──────────────────────────────────── */
  .archetype {
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 10px;
    padding: 5px 8px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    display: inline-block;
  }

  /* ── Stat rows ────────────────────────────────────────── */
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    font-size: 12px;
  }
  .stat-row:last-child { border-bottom: none; }
  .stat-row-label { opacity: 0.65; }
  .stat-row-value { font-weight: 500; }

  /* ── Status indicator ─────────────────────────────────── */
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 5px;
    vertical-align: middle;
  }
  .dot-recording { background: #3fb950; animation: pulse 1.6s ease-in-out infinite; }
  .dot-paused    { background: #e3b341; }
  .dot-idle      { background: var(--vscode-foreground); opacity: 0.3; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  /* ── Buttons ──────────────────────────────────────────── */
  .btn-row {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .btn {
    flex: 1;
    min-width: 0;
    padding: 5px 10px;
    font-size: 12px;
    font-family: inherit;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    transition: background 0.1s;
  }
  .btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-danger  { border-color: var(--vscode-inputValidation-errorBorder, #f44747); }

  /* ── Settings panel ───────────────────────────────────── */
  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    font-size: 12px;
  }
  .setting-row:last-child { border-bottom: none; }
  .setting-label { opacity: 0.8; }

  /* Toggle switch */
  .toggle { position: relative; display: inline-block; width: 28px; height: 16px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider {
    position: absolute; inset: 0; cursor: pointer;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 8px;
    transition: background 0.2s;
  }
  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 10px; height: 10px;
    left: 2px; top: 2px;
    border-radius: 50%;
    background: var(--vscode-foreground);
    opacity: 0.5;
    transition: transform 0.2s, opacity 0.2s;
  }
  .toggle input:checked + .toggle-slider {
    background: var(--vscode-button-background);
    border-color: transparent;
  }
  .toggle input:checked + .toggle-slider::before {
    transform: translateX(12px);
    opacity: 1;
    background: var(--vscode-button-foreground);
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.5;
    margin: 12px 0 6px;
  }
  .section-title:first-child { margin-top: 0; }
</style>
</head>
<body>

<!-- Tabs -->
<nav class="tabs">
  <button class="tab active" data-tab="session">Session</button>
  <button class="tab" data-tab="settings">Settings</button>
</nav>

<!-- ── Session panel ──────────────────────────────────────────── -->
<div id="panel-session" class="panel active">

  <!-- Idle view -->
  <div id="view-idle">
    <div class="idle-card">
      <span class="idle-icon">🏃</span>
      <div class="idle-title">No active session</div>
      <div class="idle-sub">Start recording to track your coding activity</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="btn-start">▶ Start Session</button>
    </div>
  </div>

  <!-- Recording view -->
  <div id="view-recording" style="display:none">

    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
      <span class="status-dot dot-recording" id="status-dot"></span>
      <span id="status-text" style="font-size:12px; opacity:0.7">Recording</span>
      <span class="archetype" id="archetype-badge">🌱 Just warming up</span>
    </div>

    <!-- Duration card with animated progress bar -->
    <div class="stat-card">
      <div class="stat-label">Duration</div>
      <div class="stat-value" id="stat-duration">00:00</div>
      <div class="stat-detail" id="stat-started">Started just now</div>
      <div class="bar-track"><div class="bar-fill" id="bar-duration" style="width:5%"></div></div>
    </div>

    <!-- Stat rows -->
    <div class="stat-card">
      <div class="stat-row">
        <span class="stat-row-label">✏️ File edits</span>
        <span class="stat-row-value" id="stat-edits">0</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">📄 Lines changed</span>
        <span class="stat-row-value" id="stat-lines">0</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">💾 Saves</span>
        <span class="stat-row-value" id="stat-saves">0</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">📁 Files touched</span>
        <span class="stat-row-value" id="stat-files">0</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">🔀 File switches</span>
        <span class="stat-row-value" id="stat-switches">0</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">⬛ Terminal events</span>
        <span class="stat-row-value" id="stat-terminal">0</span>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="btn-row">
      <button class="btn btn-primary" id="btn-pause">⏸ Pause</button>
      <button class="btn" id="btn-stop">⏹ Stop</button>
      <button class="btn btn-danger" id="btn-reset">↺ Reset</button>
    </div>
  </div>

</div>

<!-- ── Settings panel ─────────────────────────────────────────── -->
<div id="panel-settings" class="panel">
  <div class="section-title">Tracking</div>
  <div class="setting-row">
    <span class="setting-label">Track file edits</span>
    <label class="toggle"><input type="checkbox" checked id="tog-edits"><span class="toggle-slider"></span></label>
  </div>
  <div class="setting-row">
    <span class="setting-label">Track terminal activity</span>
    <label class="toggle"><input type="checkbox" checked id="tog-terminal"><span class="toggle-slider"></span></label>
  </div>
  <div class="setting-row">
    <span class="setting-label">Show archetype badge</span>
    <label class="toggle"><input type="checkbox" checked id="tog-archetype"><span class="toggle-slider"></span></label>
  </div>
  <div class="section-title" style="margin-top:16px">Session</div>
  <div class="setting-row">
    <span class="setting-label">Auto-prompt on startup</span>
    <label class="toggle"><input type="checkbox" checked id="tog-autoprompt"><span class="toggle-slider"></span></label>
  </div>
  <div class="btn-row" style="margin-top:14px">
    <button class="btn" id="btn-open-settings">Open full settings ↗</button>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  // ── Tab switching ──────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ── Button wiring ──────────────────────────────────────────────
  document.getElementById('btn-start').addEventListener('click', () =>
    vscode.postMessage({ command: 'start' }));
  document.getElementById('btn-pause').addEventListener('click', () =>
    vscode.postMessage({ command: isPaused ? 'resume' : 'pause' }));
  document.getElementById('btn-stop').addEventListener('click', () =>
    vscode.postMessage({ command: 'stop' }));
  document.getElementById('btn-reset').addEventListener('click', () =>
    vscode.postMessage({ command: 'reset' }));
  document.getElementById('btn-open-settings').addEventListener('click', () =>
    vscode.postMessage({ command: 'openSettings' }));

  // ── Stat update handler ────────────────────────────────────────
  let isPaused = false;
  let sessionMinutes = 0;

  function formatDur(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2,'0');
    const ss = String(s).padStart(2,'0');
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  window.addEventListener('message', ({ data }) => {
    if (data.type === 'update') {
      const s = data.stats;
      isPaused = s.isPaused;

      if (!s.isRecording) {
        document.getElementById('view-idle').style.display = '';
        document.getElementById('view-recording').style.display = 'none';
        return;
      }

      document.getElementById('view-idle').style.display = 'none';
      document.getElementById('view-recording').style.display = '';

      // Status dot + text
      const dot  = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (s.isPaused) {
        dot.className  = 'status-dot dot-paused';
        text.textContent = 'Paused';
        document.getElementById('btn-pause').textContent = '▶ Resume';
      } else {
        dot.className  = 'status-dot dot-recording';
        text.textContent = 'Recording';
        document.getElementById('btn-pause').textContent = '⏸ Pause';
      }

      // Duration
      document.getElementById('stat-duration').textContent = formatDur(s.durationSeconds);
      sessionMinutes = Math.floor(s.durationSeconds / 60);
      const barPct = Math.min(sessionMinutes * 2, 100);
      document.getElementById('bar-duration').style.width = Math.max(barPct, 3) + '%';

      if (s.startedAt) {
        const started = new Date(s.startedAt);
        document.getElementById('stat-started').textContent =
          'Started at ' + started.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      }

      // Counters
      document.getElementById('stat-edits').textContent    = s.fileEdits;
      document.getElementById('stat-lines').textContent    = s.linesChanged;
      document.getElementById('stat-saves').textContent    = s.fileSaves;
      document.getElementById('stat-files').textContent    = s.activeFilesCount;
      document.getElementById('stat-switches').textContent = s.fileSwitches;
      document.getElementById('stat-terminal').textContent = s.terminalCommands;

      // Archetype
      document.getElementById('archetype-badge').textContent = s.archetype;
    }
  });
</script>
</body>
</html>`;
}
```

---

## `src/sessionPanelProvider.ts`

Registers the webview view. Pushes stat updates every second.
Handles messages from the webview (button clicks).

```typescript
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
```

---

## `src/statusBar.ts`

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { SESSION_VIEW_ID } from './sessionPanelProvider';

export class SprintlyStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private ticker: NodeJS.Timeout | null = null;

  constructor(private tracker: SessionTracker, context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    // This command is auto-generated by VS Code for every registered WebviewView
    this.item.command = `${SESSION_VIEW_ID}.focus`;
    this.item.show();
    this.update();
    context.subscriptions.push(this.item);
  }

  update(): void {
    const s = this.tracker.get();
    if (!s.isRecording) {
      this._stopTicker();
      this.item.text    = '$(circle-outline) Sprintly';
      this.item.tooltip = 'Sprintly — Click to open session panel';
      this.item.color   = undefined;
    } else if (s.isPaused) {
      this._stopTicker();
      this.item.text    = '$(debug-pause) Sprintly (paused)';
      this.item.tooltip = 'Sprintly — Session paused';
      this.item.color   = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      this._startTicker();
    }
  }

  private _startTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      const s    = this.tracker.get();
      const m    = String(Math.floor(s.durationSeconds / 60)).padStart(2, '0');
      const sec  = String(s.durationSeconds % 60).padStart(2, '0');
      this.item.text    = `$(pulse) Sprintly ${m}:${sec}`;
      this.item.tooltip = 'Sprintly — Recording. Click to view session panel.';
      this.item.color   = new vscode.ThemeColor('statusBarItem.prominentForeground');
    }, 1000);
  }

  private _stopTicker(): void {
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
  }

  dispose(): void { this._stopTicker(); this.item.dispose(); }
}
```

---

## `src/consentFlow.ts`

```typescript
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
```

---

## `src/commands.ts`

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { SprintlyStatusBar } from './statusBar';
import { SessionPanelProvider } from './sessionPanelProvider';
import { runConsentFlow } from './consentFlow';

export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  statusBar: SprintlyStatusBar,
  provider: SessionPanelProvider,
): void {
  const refresh = () => { statusBar.update(); provider.refresh(); };

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
  const reset  = () => { tracker.reset(); refresh(); };

  context.subscriptions.push(
    vscode.commands.registerCommand('sprintly.startSession',
      () => runConsentFlow(context, start)),
    vscode.commands.registerCommand('sprintly.stopSession',   stop),
    vscode.commands.registerCommand('sprintly.pauseSession',  pause),
    vscode.commands.registerCommand('sprintly.resumeSession', resume),
    vscode.commands.registerCommand('sprintly.resetSession',  reset),
  );
}
```

---

## `src/extension.ts`

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { SprintlyStatusBar } from './statusBar';
import { SessionPanelProvider, SESSION_VIEW_ID } from './sessionPanelProvider';
import { registerCommands } from './commands';
import { runConsentFlow } from './consentFlow';

export function activate(context: vscode.ExtensionContext): void {
  const tracker = new SessionTracker();

  // Wire callbacks shared between provider and commands
  const start  = () => { tracker.start();  statusBar.update(); provider.refresh(); };
  const pause  = () => { tracker.pause();  statusBar.update(); provider.refresh(); };
  const resume = () => { tracker.resume(); statusBar.update(); provider.refresh(); };
  const stop   = () => { tracker.stop();   statusBar.update(); provider.refresh(); };
  const reset  = () => { tracker.reset();  statusBar.update(); provider.refresh(); };

  const provider  = new SessionPanelProvider(tracker, context, start, pause, resume, stop, reset);
  const statusBar = new SprintlyStatusBar(tracker, context);

  // Register the WebviewViewProvider — this is what makes the panel appear
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SESSION_VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    tracker,
    statusBar,
  );

  registerCommands(context, tracker, statusBar, provider);

  // Startup consent — never auto-starts
  runConsentFlow(context, () => {
    start();
    vscode.window.showInformationMessage('🏃 Sprintly — Recording started!');
  });
}

export function deactivate(): void {}
```

---

## `package.json`

The `viewsContainers` + `views` entries are what create the docked panel.
VS Code auto-generates a `sprintly.sessionView.focus` command from the view ID.

```json
{
  "name": "sprintly",
  "displayName": "Sprintly",
  "description": "Strava for developers — track your coding sessions.",
  "version": "0.1.0",
  "engines": { "vscode": "^1.74.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "panel": [
        {
          "id": "sprintly-container",
          "title": "Sprintly",
          "icon": "$(pulse)"
        }
      ]
    },
    "views": {
      "sprintly-container": [
        {
          "type": "webview",
          "id": "sprintly.sessionView",
          "name": "Session",
          "when": "true"
        }
      ]
    },
    "commands": [
      { "command": "sprintly.startSession",  "title": "Sprintly: Start Session" },
      { "command": "sprintly.stopSession",   "title": "Sprintly: Stop Session" },
      { "command": "sprintly.pauseSession",  "title": "Sprintly: Pause Session" },
      { "command": "sprintly.resumeSession", "title": "Sprintly: Resume Session" },
      { "command": "sprintly.resetSession",  "title": "Sprintly: Reset Session" }
    ],
    "configuration": {
      "title": "Sprintly",
      "properties": {
        "sprintly.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable or disable Sprintly."
        },
        "sprintly.autoPromptOnStartup": {
          "type": "boolean",
          "default": true,
          "description": "Show recording prompt when VS Code opens."
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  "devDependencies": {
    "@types/node": "^18.x",
    "@types/vscode": "^1.74.0",
    "typescript": "^5.x"
  }
}
```

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
```

---

## `.vscodeignore`

```
.vscode/**
src/**
.gitignore
tsconfig.json
```

---

## Execution steps

```bash
npm install
npm run compile
# Press F5 → Extension Development Host opens
# Click the Sprintly icon in the bottom status bar
# The panel slides up above the status bar with the full HTML UI
```

---

## Acceptance criteria — verify every item

### Architecture (the key fix)
- [ ] `package.json` has a `viewsContainers.panel` entry with id `sprintly-container`
- [ ] `package.json` has a `views["sprintly-container"]` entry with `"type": "webview"` and id `sprintly.sessionView`
- [ ] `SessionPanelProvider` implements `vscode.WebviewViewProvider`
- [ ] `vscode.window.registerWebviewViewProvider('sprintly.sessionView', provider)` is called in `activate`
- [ ] `statusBar.item.command` is set to `'sprintly.sessionView.focus'` (NOT `sprintly.openPanel`)
- [ ] Clicking status bar opens the floating **webview panel** — NOT the command palette

### Panel UI
- [ ] Panel has two tabs: "Session" and "Settings" — tab switching works
- [ ] Session tab: shows idle card with "Start Session" button when not recording
- [ ] Session tab: shows live stats card with duration, edits, lines, saves, files, switches, terminal
- [ ] Duration counter updates every second in the panel
- [ ] Archetype badge appears and updates as session signals change
- [ ] Animated green dot pulses during recording; yellow dot shown when paused
- [ ] Progress bar under duration grows with session length
- [ ] Pause button text toggles between "⏸ Pause" and "▶ Resume" correctly
- [ ] Stop and Reset buttons work; Reset shows confirmation before clearing
- [ ] Settings tab renders toggles and "Open full settings" button

### Status bar
- [ ] Shows `$(circle-outline) Sprintly` when idle
- [ ] Shows `$(pulse) Sprintly MM:SS` with live timer when recording
- [ ] Shows `$(debug-pause) Sprintly (paused)` when paused
- [ ] Color changes correctly between states

### Consent + tracking
- [ ] On activation: non-modal notification asks user to start recording
- [ ] Declining: nothing is tracked
- [ ] `sessionTracker.ts` increments all 5 counters correctly from VS Code events
- [ ] Pause correctly suspends `durationSeconds` accumulation
- [ ] `archetype()` returns a non-empty labelled string

### Build
- [ ] Zero occurrences of "MyExt", "DevStrava", "myext" anywhere in any file
- [ ] `npm run compile` completes with zero TypeScript errors
- [ ] `retainContextWhenHidden: true` is set so panel state survives tab switches

---

## Do not
- Do not use `createQuickPick()` or `showQuickPick()` for the main panel
- Do not set `statusBar.command` to anything other than `sprintly.sessionView.focus`
- Do not skip the `viewsContainers` entry in `package.json` — the panel will not appear without it
- Do not add webpack, esbuild, or any bundler
- Do not merge or preserve any previously generated files — full overwrite
- Do not add dependencies beyond `@types/vscode`, `@types/node`, `typescript`
