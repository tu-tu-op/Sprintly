# Sprintly — Docked Webview Panel Rebuild

Continue exactly from the point where the plan pivoted away from `QuickPick`:

> “Now I can see exactly what you need. That's not a QuickPick — Copilot uses a WebviewViewProvider registered in VS Code's panel area. Clicking the status bar runs a command that focuses a docked webview panel with full HTML/CSS/JS UI. Let me rebuild the entire prompt around that.”

This document **replaces** the old mini-panel plan. The new implementation must use a **docked webview view in the VS Code panel area**, not `showQuickPick()`, not the command palette, and not a modal dialog.

---

## Product goal

Sprintly is a consent-first, minimalist VS Code extension — “Strava for developers.”

The status bar click should open or focus a **persistent docked dashboard** that lives inside the VS Code panel area. The dashboard is a full HTML/CSS/JS webview with live session stats, actions, and a polished UI. It should feel like a small product, not a utility pop-up.

The extension must only track activity after explicit consent and a deliberate start action.

---

## What must change from the previous implementation

Discard the QuickPick-based panel entirely.

### Remove / replace these ideas
- `createQuickPick()`
- `showQuickPick()`
- separator-based item lists
- panel-as-menu behavior
- command-palette-like UX

### Replace with this architecture
- A **`WebviewViewProvider`**
- A **custom panel container** contributed via `viewsContainers.panel`
- A **docked view** that renders the entire UI in HTML/CSS/JS
- A **message bridge** between extension host and webview
- A **status bar click command** that reveals and focuses the docked panel

---

## Required UX behavior

### Status bar
- Clicking the status bar must reveal the Sprintly panel area and focus the dashboard view.
- The status bar must reflect recording state:
  - idle
  - active
  - paused
- The status bar should not open the command palette.
- The status bar should not open a popup QuickPick.

### Docked webview panel
- The panel must stay docked in the VS Code panel area once opened.
- The dashboard must render:
  - current session state
  - large timer
  - edit/save/switch/terminal counters
  - active file count
  - lines changed
  - session archetype
  - controls for start / pause / resume / stop / reset
  - consent callout when recording has not started
- The dashboard must update live while recording.
- The dashboard must support graceful empty-state rendering.
- The dashboard must be keyboard accessible.

### Consent
- Nothing may track silently.
- On first activation, or on first dashboard open if consent has not yet been given, prompt the user clearly.
- Accepting starts tracking only after the explicit action is taken.
- Declining never starts tracking.

---

## Strict file structure

Create these files and keep all logic in this structure.

```text
sprintly/
├── src/
│   ├── extension.ts
│   ├── statusBar.ts
│   ├── commands.ts
│   ├── consentFlow.ts
│   ├── sessionTracker.ts
│   ├── sprintlyViewProvider.ts
│   ├── webviewHtml.ts
│   └── webviewBridge.ts
├── package.json
├── tsconfig.json
└── .vscodeignore
```

---

## Implementation requirements by file

---

### `src/sessionTracker.ts`

Keep the session tracker as the single source of truth for state and event counting.

Requirements:
- No tracking before `start()`
- Support `pause()`, `resume()`, `stop()`, and `reset()`
- Maintain aggregate counters only
- Register VS Code listeners only inside this class
- Expose a read-only snapshot API for the webview and status bar
- Include an event emitter so UI can refresh when stats change

Minimum state:
- `isRecording`
- `startedAt`
- `durationSeconds`
- `fileEdits`
- `fileSaves`
- `fileSwitches`
- `activeFiles`
- `linesChanged`
- `terminalCommands`
- `pausedAt`
- `totalPausedSeconds`

Add:
- `onDidChangeState(listener)` or a `vscode.Event<SessionStats>` style event
- `getSnapshot()` returning a serializable object for the webview

Implementation notes:
- Keep the `activeFiles` set in the tracker, but convert it to an array for webview payloads.
- Use a timer tick to maintain live duration.
- Make pause accounting correct so timer excludes paused time.
- Emit a state update after every meaningful change.

---

### `src/consentFlow.ts`

Requirements:
- Store consent in workspace state
- Ask with a non-modal info message
- Never auto-start tracking
- Provide a helper that can be called both on activation and on first panel reveal
- If consent has not been given, the dashboard should show a clear consent card

Recommended shape:
- `runConsentFlow(context, onAccept)`
- `hasConsent(context)`
- `clearConsent(context)` if needed

The consent prompt should offer:
- `Start Recording`
- `Not now`

---

### `src/statusBar.ts`

The status bar item is the entry point.

Requirements:
- Clicking the item must run a command that reveals the docked Sprintly view
- Idle text, active text, paused text must be distinct
- The item should show concise state and timer
- The command must not open a QuickPick

Suggested patterns:
- idle: `$(circle-outline) Sprintly`
- active: `$(pulse) Sprintly 12:34`
- paused: `$(debug-pause) Sprintly (paused)`

The status bar should subscribe to tracker state changes and refresh immediately.

---

### `src/sprintlyViewProvider.ts`

This is the core of the new feature.

Implement a class similar to:

```ts
export class SprintlyViewProvider implements vscode.WebviewViewProvider
```

Requirements:
- Use a proper view id, such as `sprintly.dashboard`
- Store the active `WebviewView` instance
- Set webview options:
  - `enableScripts: true`
  - `localResourceRoots`
- Set HTML via a helper from `webviewHtml.ts`
- Listen for messages from the webview:
  - `ready`
  - `start`
  - `pause`
  - `resume`
  - `stop`
  - `reset`
  - `openSettings`
  - `requestState`
- Send state updates to the webview whenever the tracker changes
- Reveal/focus the panel when the status bar command is invoked

Important:
- Use `vscode.window.registerWebviewViewProvider`
- The panel should be contributed in the panel area, not as a separate QuickPick
- Keep the webview alive when appropriate, but do not leak listeners
- The provider should gracefully handle being resolved before or after activation state changes

Suggested public methods:
- `reveal()`
- `postState()`
- `refresh()`

---

### `src/webviewBridge.ts`

This file should contain the message contract between the extension and the webview.

Define:
- `HostToWebviewMessage`
- `WebviewToHostMessage`
- `SprintlyWebviewState`

The message payload should include only serializable data.

Recommended state object:
- `isRecording`
- `isPaused`
- `durationSeconds`
- `fileEdits`
- `fileSaves`
- `fileSwitches`
- `terminalCommands`
- `activeFilesCount`
- `linesChanged`
- `archetype`
- `formattedDuration`
- `recentEventSummary`
- `consentGiven`
- `primaryActionLabel`
- `secondaryActionLabel`

Keep this contract small and explicit.

---

### `src/webviewHtml.ts`

This file should generate the full webview HTML string.

Requirements:
- Use a strict CSP with a nonce
- No external network calls
- No external JS frameworks
- No CSS frameworks
- Entire UI must be self-contained
- Use semantic HTML
- Use accessible buttons
- Include a polished layout with:
  - header
  - main stat grid
  - large timer
  - session activity cards
  - action bar
  - consent state card
  - empty state
  - footer hint text
- Include embedded script that:
  - listens for messages from the extension
  - renders all state
  - posts actions back to the host
  - updates the DOM without full reload

UI tone:
- playful but restrained
- minimalist
- sharp spacing
- subtle gradients or soft glow are fine
- avoid clutter
- avoid giant copy blocks

Do not use images from the internet.

Recommended screen sections:
1. Top bar with Sprintly branding and live status pill
2. Large timer and archetype badge
3. Stat tiles
4. Compact “today” summary
5. Action buttons
6. Consent card or welcome card
7. Microcopy footer

The HTML should be robust enough to work even when the tracker has no active session.

---

### `src/commands.ts`

Register the command handlers that connect the extension host to the tracker and panel.

Required commands:
- `sprintly.focusPanel`
- `sprintly.startSession`
- `sprintly.pauseSession`
- `sprintly.resumeSession`
- `sprintly.stopSession`
- `sprintly.resetSession`

Behavior:
- `focusPanel` reveals the docked webview panel
- Start should respect consent
- Pause/resume/stop/reset should update both tracker and webview
- Keep all side effects centralized
- Show brief, tasteful notifications only when useful

The status bar should invoke `sprintly.focusPanel`.

---

### `src/extension.ts`

Wire everything together.

Requirements:
- Create `SessionTracker`
- Create `SprintlyStatusBar`
- Register `SprintlyViewProvider`
- Register commands
- Register tracker event refresh hooks
- Show consent flow on activation if desired, but never auto-start
- Push all disposables to `context.subscriptions`

Suggested flow:
1. Activate extension
2. Initialize tracker
3. Initialize status bar
4. Register view provider
5. Register commands
6. Optionally show consent prompt
7. Sync current state into the webview when ready

---

## `package.json` requirements

Contribute a real panel view container and a webview view.

Use something like:

```json
{
  "activationEvents": [
    "onStartupFinished",
    "onView:sprintly.dashboard",
    "onCommand:sprintly.focusPanel"
  ],
  "contributes": {
    "commands": [
      { "command": "sprintly.focusPanel", "title": "Sprintly: Open Dashboard" },
      { "command": "sprintly.startSession", "title": "Sprintly: Start Session" },
      { "command": "sprintly.pauseSession", "title": "Sprintly: Pause Session" },
      { "command": "sprintly.resumeSession", "title": "Sprintly: Resume Session" },
      { "command": "sprintly.stopSession", "title": "Sprintly: Stop Session" },
      { "command": "sprintly.resetSession", "title": "Sprintly: Reset Session" }
    ],
    "viewsContainers": {
      "panel": [
        {
          "id": "sprintlyPanel",
          "title": "Sprintly",
          "icon": "media/sprintly.svg"
        }
      ]
    },
    "views": {
      "sprintlyPanel": [
        {
          "id": "sprintly.dashboard",
          "name": "Dashboard",
          "type": "webview"
        }
      ]
    }
  }
}
```

Adjust icon paths only if the repository already uses a different asset strategy.

Important:
- Do not introduce extra runtime dependencies
- Keep the build simple
- Keep TypeScript strict
- Keep the extension compatible with standard VS Code webviews

---

## Visual and interaction requirements for the webview

The dashboard must feel like a polished product, not a debug screen.

### Must-have UI behavior
- A big session timer with live updates
- A distinct active/paused/idle pill
- A primary action that changes based on state
- A secondary action for pause/resume or stop
- A reset action with confirmation
- A status summary that updates live
- No page reloads for normal updates
- No scroll-jank from constant rerendering

### Must-have accessibility behavior
- Buttons must have visible focus states
- Text contrast must be readable
- Action labels must be clear
- Layout must remain usable at smaller panel widths

### Must-have engineering behavior
- No HTML injection from untrusted text
- Escape all dynamic content
- Use a nonce and CSP
- Keep webview state serializable
- Do not depend on the extension host being synchronous

---

## Do not

- Do not use `QuickPick`
- Do not use `showQuickPick`
- Do not open the command palette
- Do not auto-start tracking
- Do not track raw code content
- Do not add bundlers
- Do not add external libraries
- Do not preserve any previous QuickPick implementation
- Do not create tests unless explicitly asked
- Do not make the panel a modal dialog

---

## Acceptance criteria

### Panel behavior
- [ ] Status bar click opens/focuses the docked panel
- [ ] The dashboard is implemented as a `WebviewViewProvider`
- [ ] The panel renders inside the VS Code panel area
- [ ] The UI remains visible across state transitions

### State and tracking
- [ ] Session stats update live
- [ ] Edits, saves, switches, and terminal events are counted
- [ ] Duration excludes paused time
- [ ] Consent is required before recording begins

### UI and messaging
- [ ] The webview receives state via message bridge
- [ ] The webview can request state refresh
- [ ] Start / pause / resume / stop / reset actions work from the panel
- [ ] The panel shows an idle consent view when tracking is off
- [ ] The panel shows a rich active session dashboard when tracking is on

### Build quality
- [ ] TypeScript compiles cleanly
- [ ] No extra dependencies are introduced
- [ ] Brand name is consistently Sprintly
- [ ] The implementation is production-clean and easy to extend

---

## Final instruction to Claude

Implement the full docked webview dashboard version of Sprintly now.

Overwrite the old QuickPick-based plan completely.

Build the panel, status bar integration, message bridge, and HTML/CSS/JS UI as a coherent feature. Keep the code clean, strict, and production-ready.
