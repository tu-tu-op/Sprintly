# VS Code Status Bar Mini Panel — Implementation Guide

Replicating GitHub Copilot's "click status bar → floating mini panel" UX.

---

## What Copilot's Panel Actually Is

Copilot's floating card (the one that anchors right above the status bar icon) uses
**VS Code's internal `IHoverService`** — a workbench-level API unavailable to regular extensions.
It is **not** a WebviewView tab, not a WebviewPanel, and not a standard QuickPick.

For regular extensions, the closest public-API equivalent is a **`QuickPick`** — it floats, it
dismisses on focus-out, and its anatomy maps almost exactly to Copilot's card:

| Copilot panel element | QuickPick equivalent |
|---|---|
| Extension name in header | `qp.title` |
| "Upgrade" / action buttons in header | `qp.buttons` → `QuickInputButton[]` |
| Progress bar stat block | Item with `detail` using `█░` characters |
| "Inline Suggestions ›" rows | Items with `label` + `description` right-aligned |
| "✓ Index ready" right-side text | Item `description` field |
| Section dividers | `QuickPickItemKind.Separator` |

> **Why not WebviewView?** A `WebviewView` registered under `contributes.views.panel` renders
> as a **tab** alongside Terminal / Output / Problems. That is the wrong surface — it is
> persistent, docked, and requires the user to switch to it manually. The QuickPick is transient,
> floating, and appears on-demand like Copilot's card.

---

## Claude Code Prompt

> Copy the block below and paste it directly into Claude Code (`claude` in terminal, or the
> Claude Code VS Code sidebar). Run it from the **root of your extension's repo**.

---

````
Read every file in this VS Code extension project carefully — package.json, every source file
under src/, and any existing commands, contribution points, status bar registrations, and
WebviewView/WebviewPanel usages.

## Goal
Replace any existing bottom-panel WebviewView (the one showing as a tab alongside Terminal /
Output / Problems) with a floating QuickPick mini panel, styled like GitHub Copilot's status
bar card. The panel must open when the user clicks the extension's status bar icon.
Keep the extension's current display details (all stats and info it already shows) — just
move them into this new QuickPick surface.

---

## Step 0 — Remove the existing WebviewView panel tab

Search package.json for any entry under `contributes.views.panel`. Remove it entirely.
Search all source files for:
- `registerWebviewViewProvider` calls
- `WebviewViewProvider` class or interface implementations
- Any `vscode.commands.executeCommand('*.focus')` calls that focused the old panel view
- Any `viewsContainers` contributions tied to the removed view

Remove all of the above. The WebviewView is being replaced — do not keep it as a fallback.

---

## Step 1 — Status Bar Item

If a `StatusBarItem` already exists in `activate()`, reuse and update it. Otherwise create one:

```ts
const statusBarItem = vscode.window.createStatusBarItem(
  '<extensionId>.statusbar',
  vscode.StatusBarAlignment.Left,
  100
);
statusBarItem.name = '<Extension Display Name>';
statusBarItem.command = '<extensionId>.showStatusPanel';
statusBarItem.show();
context.subscriptions.push(statusBarItem);
```

Choose a Codicon for `.text` that fits this extension's purpose (read the codebase to decide).
The text must show the same live-updating stat or label the extension currently displays —
do not drop any existing info, just move it here.

---

## Step 2 — Hover Tooltip (MarkdownString)

Implement `updateTooltip(item, ...args)` as a named function:

```ts
function updateTooltip(item: vscode.StatusBarItem, /* pass whatever stats exist */) {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  md.appendMarkdown(`### $(icon) Extension Name\n\n---\n\n`);
  // Mirror whatever the extension currently shows — find the stats in the existing code
  md.appendMarkdown(`**<Stat label>:** <value>\n\n`);
  // Only add a progress bar if a percentage/quota metric exists:
  md.appendMarkdown(`${makeProgressBar(pct)} ${pct}%\n\n`);
  md.appendMarkdown(`---\n\n`);
  md.appendMarkdown(`[$(graph) Open Panel](command:<extensionId>.showStatusPanel)  `);
  md.appendMarkdown(`[$(settings-gear) Settings](command:workbench.action.openSettings?%5B%22<extensionId>%22%5D)\n`);

  item.tooltip = md;
}

function makeProgressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}
```

Call `updateTooltip()` on activation and on every stat refresh.

---

## Step 3 — QuickPick Floating Panel (the main surface)

Implement `showStatusPanel()` as a named async function:

```ts
async function showStatusPanel() {
  const qp = vscode.window.createQuickPick();

  qp.title = '$(icon) Extension Display Name';
  qp.placeholder = '';
  qp.ignoreFocusOut = false;      // dismiss on click-away, like Copilot's card
  qp.matchOnDescription = false;  // do NOT filter rows as user types
  qp.matchOnDetail = false;

  // Header buttons (right side of the title bar — like Copilot's gear + Upgrade)
  qp.buttons = [
    {
      iconPath: new vscode.ThemeIcon('settings-gear'),
      tooltip: 'Open Settings',
    },
    // Add a primary CTA button here if the extension has one (e.g. sign-in, refresh, upgrade)
  ];

  qp.onDidTriggerButton(btn => {
    if ((btn.iconPath as vscode.ThemeIcon).id === 'settings-gear') {
      vscode.commands.executeCommand('workbench.action.openSettings', '<extensionId>');
    }
    // Route other buttons to their correct existing command IDs
    qp.hide();
  });

  // ── Build items ───────────────────────────────────────────────────────────────
  // IMPORTANT: Read the existing code and the old WebviewView HTML to find what
  // the extension currently displays. Recreate all of that content here as items.
  // Do not invent stats — use the ones the extension already tracks.

  qp.items = [

    // ── STATS SECTION ─────────────────────────────────────────────────────────
    // One item per meaningful metric the extension currently displays.
    // Use `detail` for a progress bar + reset/date info when a % metric exists.
    { label: 'Status', kind: vscode.QuickPickItemKind.Separator },

    {
      label: '$(pulse) <Stat Name>',
      description: '<current value>',
      detail: makeProgressBar(pct) + `  ${pct}% used   Resets <date>`,
      alwaysShow: true,
    },
    // Add one item per stat the extension tracks

    // ── OPTIONS SECTION ────────────────────────────────────────────────────────
    // CRITICAL: Read package.json contributes.commands and all existing command
    // palette / context menu entries. Every existing command that makes sense
    // as a quick action goes here — keep their original labels and icons.
    // Do NOT rename, remove, or re-route any existing command.
    { label: 'Options', kind: vscode.QuickPickItemKind.Separator },

    // Example placeholders — replace with actual commands found in the codebase:
    // { label: '$(symbol-boolean) Toggle Feature', description: 'Enabled', alwaysShow: true },
    // { label: '$(refresh) Refresh Now',                                    alwaysShow: true },

    // ── ACTIONS SECTION ────────────────────────────────────────────────────────
    { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },

    { label: '$(settings-gear) Open Settings', alwaysShow: true },
  ];

  // ── Routing ───────────────────────────────────────────────────────────────────
  qp.onDidAccept(() => {
    const selected = qp.selectedItems[0];
    if (!selected) { qp.hide(); return; }

    // Route each Options/Actions item to its original command ID from package.json.
    if (selected.label.includes('Open Settings')) {
      vscode.commands.executeCommand('workbench.action.openSettings', '<extensionId>');
    }
    // Add routing for every other item in the Options section

    qp.hide();
  });

  qp.show();
}
```

Register in `activate()`:
```ts
context.subscriptions.push(
  vscode.commands.registerCommand('<extensionId>.showStatusPanel', showStatusPanel)
);
```

Add to package.json `contributes.commands` (do NOT add to any `menus`):
```json
{
  "command": "<extensionId>.showStatusPanel",
  "title": "Show Status Panel",
  "category": "<Extension Category>"
}
```

---

## Step 4 — Live Updates

Implement `startLiveUpdates(context, statusBarItem)` as a named function:

- Hook into existing extension events (file save, API response, config change) if they exist,
  otherwise use `setInterval` polling at 30 s.
- On each tick:
  1. Re-fetch stats from wherever the extension currently gets them. Wrap in try/catch.
     On error: set `item.text` to `'$(icon) —'` and return — never crash the status bar.
  2. Update `statusBarItem.text` with the same info the extension currently shows.
  3. If a quota-style percentage exists, update `statusBarItem.backgroundColor`:
     - ≥ 90% → `new vscode.ThemeColor('statusBarItem.errorBackground')`
     - ≥ 70% → `new vscode.ThemeColor('statusBarItem.warningBackground')`
     - otherwise → `undefined`
  4. Call `updateTooltip(statusBarItem, ...)`.
- Register disposal: `context.subscriptions.push({ dispose: () => clearInterval(timer) })`.
- Call `startLiveUpdates` at the end of `activate()`.

---

## Step 5 — Preservation rule (non-negotiable)

Every command, toggle, keybinding, context-menu entry, configuration option, and contribution
point that currently exists in this extension must still work exactly as before.
The QuickPick panel is a new surface that surfaces them — it does not replace anything.
The only things being removed are the WebviewView registrations from Step 0.

---

## Step 6 — Code quality checklist

- [ ] All new functions are named top-level functions, not anonymous lambdas.
- [ ] If the codebase uses a class-based pattern, add them as methods on the relevant class.
- [ ] Every async call is wrapped in try/catch with a `'—'` fallback value.
- [ ] No `console.log` left in production paths — use the extension's existing logger if one exists.
- [ ] `updateTooltip`, `showStatusPanel`, `makeProgressBar`, `startLiveUpdates` are individually extractable.

---

## After implementing, report:

1. What WebviewView registration(s) you removed and from which files.
2. What existing stats/info the old view showed that you moved into the QuickPick.
3. Which existing commands/options you found and wired into the "Options" section.
4. Every file modified and a one-line summary of the change.
````

---

---

## Reference: Architecture

```
StatusBarItem  (.text = icon + live stat, same content as before)
  │
  ├── .tooltip ──► MarkdownString
  │                  heading · stats · progress bar · command:// links
  │
  └── .command ──► showStatusPanel()
                     └── createQuickPick()
                           ├── .title          → extension name + icon
                           ├── .buttons        → gear + any primary CTA
                           ├── .items[]
                           │     ├── Separator "Status"
                           │     │     └── stat rows (existing data, preserved)
                           │     ├── Separator "Options"
                           │     │     └── existing commands (labels/icons preserved)
                           │     └── Separator "Actions"
                           │           └── Open Settings
                           └── .onDidAccept → route to original command IDs
```

---

## Reference Code

### QuickPick with Copilot-style header buttons

```ts
async function showStatusPanel() {
  const qp = vscode.window.createQuickPick();
  qp.title = '$(sparkle) My Extension';
  qp.placeholder = '';
  qp.ignoreFocusOut = false;
  qp.matchOnDescription = false;
  qp.matchOnDetail = false;

  qp.buttons = [
    { iconPath: new vscode.ThemeIcon('refresh'),       tooltip: 'Refresh' },
    { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Open Settings' },
  ];

  qp.onDidTriggerButton(btn => {
    const id = (btn.iconPath as vscode.ThemeIcon).id;
    if (id === 'refresh')       vscode.commands.executeCommand('myext.refresh');
    if (id === 'settings-gear') vscode.commands.executeCommand('workbench.action.openSettings', 'myext');
    qp.hide();
  });

  qp.items = [
    { label: 'Status', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(zap) Requests this month',
      description: '42 / 300',
      detail: '█████░░░░░  42% used   Resets Jun 1',
      alwaysShow: true,
    },

    { label: 'Options', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(symbol-boolean) Inline Suggestions', description: 'Enabled', alwaysShow: true },
    { label: '$(database) Codebase Index',           description: '✓ Ready',  alwaysShow: true },

    { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(settings-gear) Open Settings', alwaysShow: true },
  ];

  qp.onDidAccept(() => {
    const s = qp.selectedItems[0];
    if (s?.label.includes('Inline Suggestions')) vscode.commands.executeCommand('myext.toggleInline');
    if (s?.label.includes('Codebase Index'))     vscode.commands.executeCommand('myext.reindex');
    if (s?.label.includes('Open Settings'))      vscode.commands.executeCommand('workbench.action.openSettings', 'myext');
    qp.hide();
  });

  qp.show();
}
```

### Live updates with try/catch fallback

```ts
function startLiveUpdates(context: vscode.ExtensionContext, item: vscode.StatusBarItem) {
  const tick = async () => {
    try {
      const stats = await fetchStats();
      item.text = `$(sparkle) ${stats.used} req`;
      item.backgroundColor =
        stats.pct >= 90 ? new vscode.ThemeColor('statusBarItem.errorBackground') :
        stats.pct >= 70 ? new vscode.ThemeColor('statusBarItem.warningBackground') :
        undefined;
      updateTooltip(item, stats.used, stats.total);
    } catch {
      item.text = '$(sparkle) —';
    }
  };
  tick();
  const timer = setInterval(tick, 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}
```

---

## Surface Comparison

| Surface | Where it renders | Dismisses on focus-out | Right tool for on-demand popup |
|---|---|---|---|
| `WebviewView` (panel) | Tab in Terminal/Output/Problems | ❌ persistent tab | ❌ |
| `WebviewPanel` | Tab in editor area | ❌ persistent tab | ❌ |
| **`QuickPick`** | **Floating overlay** | **✅ yes** | **✅** |
| Copilot internal panel | Floating, anchored to status bar | ✅ yes | internal API only |
