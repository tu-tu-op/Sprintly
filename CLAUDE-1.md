# Sprintly — VS Code Extension (Full Rebuild)

## Critical fixes required
- The status bar item must sit **far right** alongside Spaces/CRLF/language mode — use `StatusBarAlignment.Right` with priority `0`. High priority numbers push it left toward the terminal. Priority `0` keeps it at the far right like the Copilot icon.
- Clicking the status bar item opens a **`createQuickPick()` dropdown** showing live session stats and action buttons. Nothing else — no panel tab, no sidebar view, no webview.
- `sessionPanel.ts` exports a **standalone function** `showSessionPanel()`, not a class.
- `package.json` must have **no** `viewsContainers`, **no** `views`, **no** webview contributions of any kind. These are what cause the unwanted SPRINTLY tab to appear in the terminal panel area.
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
│   ├── sessionPanel.ts       ← createQuickPick() dropdown with live stats + actions
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

**Critical: priority must be `0`** — this places the item at the far right of the status bar, next to Spaces/CRLF/language mode, exactly like the Copilot icon. A high priority (e.g. 100) pushes it left toward the terminal area.

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';

export class SprintlyStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private tracker: SessionTracker;
  private ticker: NodeJS.Timeout | null = null;

  constructor(tracker: SessionTracker, context: vscode.ExtensionContext) {
    this.tracker = tracker;
    // Priority 0 = far right, beside Spaces/CRLF/language. Do NOT use 100.
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
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

Shown on startup. Never records silently.

```typescript
import * as vscode from 'vscode';

const CONSENT_KEY = 'sprintly.consentGiven';

export async function runConsentFlow(
  context: vscode.ExtensionContext,
  onAccept: () => void
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    '🏃 Sprintly: Start tracking your coding session?',
    { modal: false },
    'Start Recording',
    'Not Now'
  );
  if (choice === 'Start Recording') {
    await context.workspaceState.update(CONSENT_KEY, true);
    onAccept();
  }
}
```

---

### `src/sessionPanel.ts`

A **standalone function** that opens a `createQuickPick()` dropdown — not a class, not a webview, not a panel tab. Stats refresh every second while the picker is open via `setInterval`. `clearInterval` and `qp.dispose()` are both called in `onDidHide` to prevent leaks.

```typescript
import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';

export function showSessionPanel(
  tracker: SessionTracker,
  onStart: () => void,
  onPause: () => void,
  onResume: () => void,
  onStop: () => void,
  onReset: () => void
): void {
  const qp = vscode.window.createQuickPick();
  qp.title = '⚡ Sprintly';
  qp.placeholder = 'Select an action';
  qp.ignoreFocusOut = false;

  const fmt = (n: number) => n.toString();
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  const buildItems = (): vscode.QuickPickItem[] => {
    const stats = tracker.getStats();
    const paused = tracker.isPaused();

    if (!stats.isRecording) {
      return [
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '○  No active session', alwaysShow: true },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(play)  Start Session', alwaysShow: true },
      ];
    }

    const archetype = tracker.getArchetype();
    return [
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      { label: `$(clock)  Duration`,     description: fmtTime(stats.durationSeconds), alwaysShow: true },
      { label: `$(edit)  Edits`,         description: fmt(stats.fileEdits),            alwaysShow: true },
      { label: `$(save)  Saves`,         description: fmt(stats.fileSaves),            alwaysShow: true },
      { label: `$(files)  Active Files`, description: fmt(stats.activeFiles.size),     alwaysShow: true },
      { label: `$(arrow-swap)  Switches`,description: fmt(stats.fileSwitches),         alwaysShow: true },
      { label: `$(terminal)  Terminal`,  description: fmt(stats.terminalCommands),     alwaysShow: true },
      { label: `$(star)  Archetype`,     description: archetype,                       alwaysShow: true },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      ...(paused
        ? [{ label: '$(debug-continue)  Resume', alwaysShow: true }]
        : [{ label: '$(debug-pause)  Pause',     alwaysShow: true }]
      ),
      { label: '$(debug-stop)  Stop Session',  alwaysShow: true },
      { label: '$(trash)  Reset Session',      alwaysShow: true },
    ];
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
    if (label.includes('Start Session'))  { onStart(); }
    else if (label.includes('Pause'))     { onPause(); }
    else if (label.includes('Resume'))    { onResume(); }
    else if (label.includes('Stop'))      { onStop(); }
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

  // Status bar click → createQuickPick() dropdown
  const openPanel = vscode.commands.registerCommand('sprintly.openPanel', () => {
    showSessionPanel(
      tracker,
      () => runConsentFlow(context, start),
      pause, resume, stop, reset
    );
  });

  context.subscriptions.push(
    openPanel,
    vscode.commands.registerCommand('sprintly.startSession',  () => runConsentFlow(context, start)),
    vscode.commands.registerCommand('sprintly.stopSession',   stop),
    vscode.commands.registerCommand('sprintly.pauseSession',  pause),
    vscode.commands.registerCommand('sprintly.resumeSession', resume),
    vscode.commands.registerCommand('sprintly.resetSession',  reset),
  );
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

**No `viewsContainers`, no `views`, no webview contributions** — these are what cause a SPRINTLY tab to appear in the terminal panel area. The only UI surface is the status bar item, which is created programmatically in `statusBar.ts`.

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

### Status bar position (critical fix)
- [ ] `StatusBarAlignment.Right` with priority `0` — NOT 100 or any high number
- [ ] Item appears at the far right of the status bar, beside Spaces/CRLF/language mode
- [ ] Item does NOT appear near the terminal or left side of the status bar

### Status bar state
- [ ] Icon shows `$(circle-outline) Sprintly` when not recording
- [ ] Icon shows `$(pulse) Sprintly MM:SS` with a live timer when recording
- [ ] Icon shows `$(debug-pause) Sprintly (paused)` when paused
- [ ] Clicking the icon opens a `createQuickPick()` dropdown — NOT a panel tab, NOT a sidebar view

### Session panel (QuickPick dropdown)
- [ ] `sessionPanel.ts` exports a standalone function `showSessionPanel()` — not a class
- [ ] Panel opens immediately on status bar click via `createQuickPick()`
- [ ] When not recording: shows idle state row + "Start Session" action
- [ ] When recording: shows all stat rows (duration, edits, saves, files, switches, terminal, archetype)
- [ ] Stats refresh every 1 second while picker is open (`setInterval` inside `showSessionPanel`)
- [ ] Pause / Resume / Stop / Reset actions all work correctly from inside the picker
- [ ] `clearInterval` AND `qp.dispose()` are both called inside `onDidHide` — no leaks

### No unwanted UI surfaces
- [ ] `package.json` has NO `viewsContainers` key
- [ ] `package.json` has NO `views` key
- [ ] No `WebviewViewProvider` is registered anywhere
- [ ] No SPRINTLY tab appears in the terminal/panel area

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
- [ ] `commands.ts` takes only 3 arguments: `context`, `tracker`, `statusBar` — no panel argument
- [ ] TypeScript compiles with zero errors (`npm run compile`)

---

## Do not

- Do not use `showQuickPick()` — use `createQuickPick()` only (needed for live refresh via `setInterval`)
- Do not add `viewsContainers` or `views` to `package.json` — this creates unwanted panel tabs
- Do not register a `WebviewViewProvider` — the only UI is the status bar item + QuickPick dropdown
- Do not use priority `100` or any high number for the status bar item — use `0`
- Do not auto-start tracking on activation without consent
- Do not track raw code content — counters and aggregates only
- Do not add webpack, esbuild, or any bundler
- Do not merge or preserve any previously generated files — full overwrite
- Do not create test files unless explicitly asked
- Do not add any dependencies beyond `@types/vscode`, `@types/node`, `typescript`
