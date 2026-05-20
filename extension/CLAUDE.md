# Sprintly — VS Code Extension (Full Rebuild)

## Critical fixes required
- The status bar icon click must open a **QuickPick mini panel** showing session stats + actions — NOT the command palette.
- The session stats panel was not rendering. Rebuild it from scratch using `createQuickPick()`.
- All branding must be **Sprintly** — no "MyExt", "DevStrava", or placeholder names anywhere.
- Discard and overwrite all previously generated files. Start clean.

---

## Product overview

Sprintly is a consent-first, minimalist VS Code extension — "Strava for developers."
It records coding session activity **only after the user explicitly starts recording.**
Nothing is tracked silently. Everything is opt-in. The UI must feel fun, playful, and non-intrusive.

---

## Strict file structure — create every file listed

```
sprintly/
├── src/
│   ├── extension.ts          ← activate/deactivate, wires everything together
│   ├── statusBar.ts          ← StatusBarItem creation, icon state updates
│   ├── sessionPanel.ts       ← QuickPick mini panel with live stats + actions
│   ├── consentFlow.ts        ← startup consent prompt logic
│   ├── sessionTracker.ts     ← session state, timers, counters
│   └── commands.ts           ← all registered command handlers
├── package.json
├── tsconfig.json
└── .vscodeignore
```

---

## Implementation — each file in full

---

### `src/sessionTracker.ts`

The single source of truth for session state. No tracking happens until `start()` is called.

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
  pausedAt: Date | null;
  totalPausedSeconds: number;
}

export class SessionTracker implements vscode.Disposable {
  private stats: SessionStats = this.blankStats();
  private disposables: vscode.Disposable[] = [];
  private tickTimer: NodeJS.Timeout | null = null;

  private blankStats(): SessionStats {
    return {
      isRecording: false,
      startedAt: null,
      durationSeconds: 0,
      fileEdits: 0,
      fileSaves: 0,
      fileSwitches: 0,
      activeFiles: new Set(),
      linesChanged: 0,
      terminalCommands: 0,
      pausedAt: null,
      totalPausedSeconds: 0,
    };
  }

  start(): void {
    this.stats = this.blankStats();
    this.stats.isRecording = true;
    this.stats.startedAt = new Date();
    this._attachListeners();
    this._startTick();
  }

  pause(): void {
    if (!this.stats.isRecording || this.stats.pausedAt) return;
    this.stats.pausedAt = new Date();
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  resume(): void {
    if (!this.stats.pausedAt) return;
    const pausedSeconds = (Date.now() - this.stats.pausedAt.getTime()) / 1000;
    this.stats.totalPausedSeconds += pausedSeconds;
    this.stats.pausedAt = null;
    this._startTick();
  }

  stop(): void {
    this.stats.isRecording = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this._detachListeners();
  }

  reset(): void {
    this.stop();
    this.stats = this.blankStats();
  }

  getStats(): Readonly<SessionStats> {
    return { ...this.stats, activeFiles: new Set(this.stats.activeFiles) };
  }

  isPaused(): boolean {
    return this.stats.pausedAt !== null;
  }

  /** Returns a developer archetype label based on session signals */
  getArchetype(): string {
    const { fileEdits, fileSaves, linesChanged, terminalCommands, durationSeconds } = this.stats;
    if (durationSeconds < 30) return '🌱 Just warming up';
    const editsPerMin = (fileEdits / durationSeconds) * 60;
    const terminalIntensity = terminalCommands / Math.max(durationSeconds / 60, 1);
    if (terminalIntensity > 5) return '⚡ Terminal Warrior';
    if (editsPerMin > 20) return '🔥 Vibe Coder';
    if (fileSaves > fileEdits * 0.8) return '🎯 Precision Coder';
    if (linesChanged > 200) return '🚀 Hardcore Sprint';
    return '🧘 Steady Builder';
  }

  private _startTick(): void {
    this.tickTimer = setInterval(() => {
      if (this.stats.startedAt && !this.stats.pausedAt) {
        const elapsed = (Date.now() - this.stats.startedAt.getTime()) / 1000;
        this.stats.durationSeconds = Math.floor(elapsed - this.stats.totalPausedSeconds);
      }
    }, 1000);
  }

  private _attachListeners(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!this.stats.isRecording || this.stats.pausedAt) return;
        this.stats.fileEdits++;
        this.stats.linesChanged += e.contentChanges.reduce(
          (sum, c) => sum + Math.abs(c.text.split('\n').length - 1), 0
        );
        this.stats.activeFiles.add(e.document.fileName);
      }),
      vscode.workspace.onDidSaveTextDocument(() => {
        if (!this.stats.isRecording || this.stats.pausedAt) return;
        this.stats.fileSaves++;
      }),
      vscode.window.onDidChangeActiveTextEditor(e => {
        if (!this.stats.isRecording || this.stats.pausedAt || !e) return;
        this.stats.fileSwitches++;
        this.stats.activeFiles.add(e.document.fileName);
      }),
      vscode.window.onDidOpenTerminal(() => {
        if (!this.stats.isRecording || this.stats.pausedAt) return;
        this.stats.terminalCommands++;
      })
    );
  }

  private _detachListeners(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  dispose(): void {
    this.reset();
  }
}
```

---

### `src/statusBar.ts`

Updates the icon and text to reflect live recording state.

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';

export class SprintlyStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private tracker: SessionTracker;
  private ticker: NodeJS.Timeout | null = null;

  constructor(tracker: SessionTracker, context: vscode.ExtensionContext) {
    this.tracker = tracker;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'sprintly.openPanel';
    this.item.show();
    this.update();
    context.subscriptions.push(this.item);
  }

  update(): void {
    const stats = this.tracker.getStats();
    if (!stats.isRecording) {
      this.item.text = '$(circle-outline) Sprintly';
      this.item.tooltip = 'Sprintly — Click to start a session';
      this.item.color = undefined;
      this._stopTicker();
    } else if (this.tracker.isPaused()) {
      this.item.text = '$(debug-pause) Sprintly (paused)';
      this.item.tooltip = 'Sprintly — Session paused. Click to manage.';
      this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      this._stopTicker();
    } else {
      this._startTicker();
    }
  }

  private _startTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      const stats = this.tracker.getStats();
      const m = Math.floor(stats.durationSeconds / 60).toString().padStart(2, '0');
      const s = (stats.durationSeconds % 60).toString().padStart(2, '0');
      this.item.text = `$(pulse) Sprintly ${m}:${s}`;
      this.item.tooltip = 'Sprintly — Recording. Click to view session.';
      this.item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
    }, 1000);
  }

  private _stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  dispose(): void {
    this._stopTicker();
    this.item.dispose();
  }
}
```

---

### `src/consentFlow.ts`

Shown on startup. Stores consent in workspace state. Never records silently.

```typescript
import * as vscode from 'vscode';

const CONSENT_KEY = 'sprintly.consentGiven';

export async function runConsentFlow(
  context: vscode.ExtensionContext,
  onAccept: () => void
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    '🏃 Sprintly — Want to record this coding session?',
    { modal: false },
    'Start Recording',
    'Not now'
  );

  if (choice === 'Start Recording') {
    await context.workspaceState.update(CONSENT_KEY, true);
    onAccept();
  }
}

export function clearConsent(context: vscode.ExtensionContext): Thenable<void> {
  return context.workspaceState.update(CONSENT_KEY, undefined);
}
```

---

### `src/sessionPanel.ts`

**This is the mini panel.** Opens as a QuickPick on status bar click.
It shows live session stats at the top, then action buttons below.
Uses `vscode.QuickPickItemKind.Separator` to visually separate stat rows from actions.

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function showSessionPanel(
  tracker: SessionTracker,
  onStart: () => void,
  onPause: () => void,
  onResume: () => void,
  onStop: () => void,
  onReset: () => void
): void {
  const qp = vscode.window.createQuickPick();
  qp.placeholder = 'Sprintly — current session';
  qp.matchOnDescription = false;
  qp.matchOnDetail = false;

  const buildItems = (): vscode.QuickPickItem[] => {
    const stats = tracker.getStats();
    const paused = tracker.isPaused();

    if (!stats.isRecording) {
      return [
        {
          label: '$(circle-outline)  No active session',
          description: 'Start one to begin tracking',
          alwaysShow: true,
        },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(play)  Start Session',
          description: 'Begin recording your coding activity',
          alwaysShow: true,
        },
      ];
    }

    const archetype = tracker.getArchetype();
    const items: vscode.QuickPickItem[] = [
      {
        label: `$(pulse)  ${archetype}`,
        description: paused ? 'Paused' : 'Recording...',
        alwaysShow: true,
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      {
        label: `$(clock)  Duration`,
        description: formatDuration(stats.durationSeconds),
        alwaysShow: true,
      },
      {
        label: `$(edit)  Edits`,
        description: `${stats.fileEdits} edits · ${stats.linesChanged} lines changed`,
        alwaysShow: true,
      },
      {
        label: `$(save)  Saves`,
        description: `${stats.fileSaves} saves`,
        alwaysShow: true,
      },
      {
        label: `$(files)  Files touched`,
        description: `${stats.activeFiles.size} files · ${stats.fileSwitches} switches`,
        alwaysShow: true,
      },
      {
        label: `$(terminal)  Terminal activity`,
        description: `${stats.terminalCommands} terminal events`,
        alwaysShow: true,
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      paused
        ? { label: '$(debug-start)  Resume Session', alwaysShow: true }
        : { label: '$(debug-pause)  Pause Session', alwaysShow: true },
      { label: '$(debug-stop)  Stop Session', alwaysShow: true },
      { label: '$(trash)  Reset Session', alwaysShow: true },
    ];

    return items;
  };

  qp.items = buildItems();

  // Refresh stats every second while panel is open
  const refreshTimer = setInterval(() => {
    qp.items = buildItems();
  }, 1000);

  qp.onDidAccept(() => {
    const sel = qp.selectedItems[0];
    if (!sel) return;
    qp.hide();

    const label = sel.label;
    if (label.includes('Start Session'))    { onStart(); }
    else if (label.includes('Pause'))       { onPause(); }
    else if (label.includes('Resume'))      { onResume(); }
    else if (label.includes('Stop'))        { onStop(); }
    else if (label.includes('Reset')) {
      vscode.window.showWarningMessage(
        'Reset this session? All stats will be cleared.',
        'Reset', 'Cancel'
      ).then(c => { if (c === 'Reset') onReset(); });
    }
  });

  qp.onDidHide(() => {
    clearInterval(refreshTimer);
    qp.dispose();
  });

  qp.show();
}
```

---

### `src/commands.ts`

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { SprintlyStatusBar } from './statusBar';
import { showSessionPanel } from './sessionPanel';
import { runConsentFlow } from './consentFlow';

export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  statusBar: SprintlyStatusBar
): void {
  const refresh = () => statusBar.update();

  const start = () => {
    tracker.start();
    refresh();
    vscode.window.showInformationMessage('🏃 Sprintly — Session started. Go crush it!');
  };

  const pause  = () => { tracker.pause();  refresh(); };
  const resume = () => { tracker.resume(); refresh(); };

  const stop = () => {
    const stats = tracker.getStats();
    tracker.stop();
    refresh();
    vscode.window.showInformationMessage(
      `✅ Sprintly — Session ended. ${stats.fileEdits} edits in ${Math.floor(stats.durationSeconds / 60)}m.`
    );
  };

  const reset = () => { tracker.reset(); refresh(); };

  // Main panel command — triggered by status bar click
  const openPanel = vscode.commands.registerCommand('sprintly.openPanel', () => {
    showSessionPanel(tracker,
      () => runConsentFlow(context, start),
      pause, resume, stop, reset
    );
  });

  const startCmd  = vscode.commands.registerCommand('sprintly.startSession',  () => runConsentFlow(context, start));
  const stopCmd   = vscode.commands.registerCommand('sprintly.stopSession',   stop);
  const pauseCmd  = vscode.commands.registerCommand('sprintly.pauseSession',  pause);
  const resumeCmd = vscode.commands.registerCommand('sprintly.resumeSession', resume);
  const resetCmd  = vscode.commands.registerCommand('sprintly.resetSession',  reset);

  context.subscriptions.push(openPanel, startCmd, stopCmd, pauseCmd, resumeCmd, resetCmd);
}
```

---

### `src/extension.ts`

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';
import { SprintlyStatusBar } from './statusBar';
import { registerCommands } from './commands';
import { runConsentFlow } from './consentFlow';

export function activate(context: vscode.ExtensionContext): void {
  const tracker = new SessionTracker();
  const statusBar = new SprintlyStatusBar(tracker, context);

  registerCommands(context, tracker, statusBar);

  context.subscriptions.push(tracker, statusBar);

  // Show consent prompt on activation — never auto-starts
  runConsentFlow(context, () => {
    tracker.start();
    statusBar.update();
    vscode.window.showInformationMessage('🏃 Sprintly — Recording started!');
  });
}

export function deactivate(): void {}
```

---

### `package.json`

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
    "commands": [
      { "command": "sprintly.openPanel",     "title": "Sprintly: Open Session Panel" },
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

### `tsconfig.json`

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

### `.vscodeignore`

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
# Press F5 in VS Code to launch Extension Development Host
```

---

## Acceptance criteria — verify every item before marking done

### Branding
- [ ] All text, commands, keys, and config use `sprintly` — zero occurrences of "MyExt", "DevStrava", or "myext"

### Status bar
- [ ] Icon shows `$(circle-outline) Sprintly` when not recording
- [ ] Icon shows `$(pulse) Sprintly MM:SS` with a live timer when recording
- [ ] Icon shows `$(debug-pause) Sprintly (paused)` when paused
- [ ] Clicking the icon opens the QuickPick mini panel — NOT the command palette

### Session panel (critical fix)
- [ ] Panel opens immediately on status bar click via `createQuickPick()`
- [ ] When not recording: shows idle state + "Start Session" action item
- [ ] When recording: shows all 5 live stat rows (duration, edits, saves, files, terminal) plus archetype
- [ ] Stats refresh every 1 second while panel is open (`setInterval` inside the panel)
- [ ] Pause / Resume / Stop / Reset actions all work correctly from inside the panel
- [ ] `clearInterval` and `qp.dispose()` are both called inside `onDidHide` — no leaks

### Consent flow
- [ ] On activation, a non-modal notification asks the user to start recording
- [ ] Declining does NOT start tracking — `tracker.start()` is never called without user confirmation
- [ ] Accepting calls `tracker.start()` and updates the status bar

### Session tracking
- [ ] `fileEdits` increments on every `onDidChangeTextDocument` event while recording
- [ ] `fileSaves` increments on `onDidSaveTextDocument`
- [ ] `fileSwitches` increments on `onDidChangeActiveTextEditor`
- [ ] `terminalCommands` increments on `onDidOpenTerminal`
- [ ] `durationSeconds` counts correctly and pauses during paused state
- [ ] `getArchetype()` returns a non-empty labelled string at all times

### Architecture
- [ ] `SessionTracker` is the only class that registers VS Code event listeners
- [ ] `sessionPanel.ts` reads state only through `tracker.getStats()` and `tracker.isPaused()`
- [ ] `statusBar.ts` reads state only through `tracker.getStats()` and `tracker.isPaused()`
- [ ] TypeScript compiles with zero errors (`npm run compile`)

---

## Do not

- Do not use `showQuickPick()` — use `createQuickPick()` only
- Do not auto-start tracking on activation without consent
- Do not track raw code content — counters and aggregates only
- Do not add webpack, esbuild, or any bundler
- Do not merge or preserve any previously generated files — full overwrite
- Do not create test files unless explicitly asked
- Do not add any dependencies beyond `@types/vscode`, `@types/node`, `typescript`
