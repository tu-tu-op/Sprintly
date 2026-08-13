# Sprintly Extension Feature Inventory

Audited on 2026-08-13 against the current TypeScript extension entry point, manifest, tracking services, panels, and automated tests.

## Scope and status labels

This inventory describes the VS Code extension started by `out/extension.js`. It does not treat the companion website or legacy, unregistered modules as extension features.

- **Active** — connected to the extension entry point and available in normal use.
- **Preview** — reachable through the developer screen command, but powered by demo data.
- **Placeholder** — the command or control exists, but its final behavior is not implemented.
- **Dormant** — code exists in the repository but is not registered by the active extension.

## Active features

### Session lifecycle

| Feature | Description |
| --- | --- |
| Startup session prompt | Shows a compact `Start Sprint` / `Not Now` prompt after VS Code finishes starting. Tracking begins only when `Start Sprint` is selected. |
| Start a sprint | Creates a new session ID, clears the previous session's metrics, starts the live timer, and attaches activity listeners. Agent-log cursors are retained to prevent old log entries from being replayed. |
| Pause and resume | Stops and restarts live timing while recording pause intervals. Activity, agent usage, and failures occurring inside a paused interval are excluded. |
| End a sprint | Closes the session window, stops live activity listeners, and keeps the latest persistent summary available in the Quick Panel. |
| Reset session | Clears the current/latest session metrics and returns Sprintly to its ready state while retaining agent-log cursors. |
| Session-boundary scan | Agent logs are scanned immediately before start, pause, resume, stop, and reset so entries are assigned to the correct session window. |
| Interrupted-session recovery | If VS Code or the extension closes while a session is active, Sprintly closes that session when it next activates instead of merging activity from separate editor runs. |
| Persistent session summary | Session timestamps, pauses, coding split, agent prompts, token usage, build failures, detected agents, and log cursors are saved in VS Code extension global state. |

### Live activity tracking

| Feature | Description |
| --- | --- |
| Live elapsed timer | Updates once per second while a sprint is running and subtracts paused time. |
| Edit counter | Counts VS Code text-document change events during an active, unpaused sprint. |
| Save counter | Counts document saves during an active, unpaused sprint. |
| File-switch counter | Counts active editor changes during a sprint. This metric contributes to tracking but is not currently shown as its own Quick Panel row. |
| Files-touched count | Keeps an in-memory set of files involved in edits or editor switches and shows the number of unique files in the Quick Panel. |
| Lines-changed estimate | Adds the newline delta from document changes. This is an activity estimate, not a Git-style added/deleted line count. |
| Terminal activity count | Counts terminals opened during the sprint. The UI labels this as terminal activity/opens; Sprintly does not record command text. |
| Session archetype and traits | Derives a deterministic archetype from explainable session signals and exposes up to three traits such as `Terminal-heavy`, `Validation-minded`, or `High recovery`. |

### Coding attribution split

| Feature | Description |
| --- | --- |
| Manual classification | Counts ordinary typing as manual activity when no provider attribution is available. |
| AI-assisted classification | Counts accepted inline completions and explicitly attributed AI edits as AI-assisted. GitHub Copilot inline fixes are not treated as hard-coded manual work. |
| Automation classification | Provides a separate bucket for explicitly attributed automation, so scripts and formatters are not silently called AI. |
| Unattributed bulk classification | Places paste, refactor, and other large edits with no provider attribution in `Unattributed bulk` rather than making a false AI claim. |
| Duration heartbeats | Converts edit, save, and editor activity into category duration totals using two-minute heartbeats. |
| Idle-gap protection | Does not bridge activity gaps longer than 15 minutes, preventing inactive time from being counted as coding. |
| Lifecycle isolation | Clears heartbeat context across start, pause, resume, stop, and reset boundaries so time is not carried between session states. |

### AI agent usage tracking

| Feature | Description |
| --- | --- |
| Claude Code prompt counting | Reads Claude Code JSONL session logs and counts user-authored prompts that occur inside the active Sprintly session. |
| Codex prompt counting | Reads Codex rollout JSONL logs and counts user-message entries inside the active Sprintly session. |
| GitHub Copilot Chat prompt counting | Reads VS Code's workspace chat-session patch logs and counts Copilot Chat requests inside the active Sprintly session. |
| Claude Code tokens | Tracks input, output, cache-read, and cache-creation tokens when those fields are available in Claude logs. |
| Codex tokens | Tracks the per-turn total token count when the Codex log provides it; otherwise the UI reports Codex token usage as unavailable. |
| GitHub Copilot tokens and credits | Tracks Copilot Chat prompt tokens, completion tokens, and Copilot credits from request patches. |
| Detected-agent list | Marks Claude Code, Codex, or GitHub Copilot as detected only after a valid in-session entry is found. Installation alone does not count as usage. |
| Session-time filtering | Ignores agent entries outside the session's start/end timestamps and entries created during pause intervals. Entries without a trustworthy timestamp are ignored. |
| Workspace-scoped Claude and Codex usage | Uses the `cwd`/workspace metadata in each agent log and accepts only the opened root folder or its descendants. Logs from unrelated projects are ignored. |
| Exact-root Copilot isolation | Resolves VS Code workspace-storage metadata and watches only Copilot Chat logs belonging to the exact opened workspace root. A parent or sibling workspace is not included. |
| Open-folder matching | Evaluates every open file-based VS Code workspace folder when discovering and matching agent usage. Claude/Codex accept activity in a root or descendant; Copilot folder storage must match a root exactly. |
| Incremental log cursors | Stores a byte offset per agent log so rescans and extension restarts process only new data instead of recounting history. |
| Live log discovery | Combines filesystem watching with a five-second fallback poll and rediscovers Copilot chat storage that is created after Sprintly starts. |
| Patch-context recovery | Rebuilds Copilot request-index context from the already-consumed file prefix after an extension reload, allowing later token patches to remain attributable. |
| Malformed-log tolerance | Skips malformed or unreadable log entries and continues tracking without interrupting the extension. |

### Token cost estimation

| Feature | Description |
| --- | --- |
| Claude Code cost estimate | Estimates Claude Code cost from input, output, cache-read, and cache-creation token totals. |
| Configurable Claude rates | Lets users override each Claude price-per-million rate in VS Code settings. The estimate is local and informational. |

### Build-failure tracking

| Feature | Description |
| --- | --- |
| Failed terminal execution detection | Uses VS Code terminal shell integration and counts completed executions with a non-zero exit code during an active, unpaused sprint. |
| Failure categorization | Classifies failures as missing module, missing package/command, syntax error, type error, file not found, permission error, port in use, or `other`. |
| Failure details | Shows total failures and a per-category breakdown in the Quick Panel. |
| Bounded output inspection | Reads at most 200 output lines or 20,000 characters to categorize a failed execution, then stores only the aggregate category/count. |

### Status bar

| Feature | Description |
| --- | --- |
| Persistent Sprintly entry | Shows `Ready`, a live in-progress timer, `Paused`, or `Last sprint` in the left side of the VS Code status bar. |
| Click-to-open | Clicking the status bar opens the same canonical Quick Panel used by the command palette. |
| Hover summary | Shows session state, coding split, agent prompts, token usage, build failures, and links to the Quick Panel and Sprintly settings. |
| Stable hover behavior | Excludes the one-second live timer from the tooltip fingerprint so an open hover card is not destroyed and recreated every second. |
| Safe fallback | Falls back to a ready label and simple tooltip if presentation rendering fails. |

### Quick Panel

| Feature | Description |
| --- | --- |
| Current/latest session summary | Distinguishes `Current session`, `Last session`, and `No session`, with `In progress`, `Paused`, `Completed`, or `Ready` states. |
| Activity overview | Shows elapsed time, manual/AI-assisted/automation/unattributed split, archetype, edits, estimated lines changed, unique files, saves, and terminal activity while live tracker data exists. |
| Agent prompt overview | Shows the combined prompt total with separate Claude Code, Codex, and GitHub Copilot counts. |
| Token overview | Shows available Claude, Codex, and Copilot token totals. The detail view exposes Claude cache tokens/cost and Copilot credits. |
| Reliability overview | Shows total build/test/lint failures, the most frequent category, recovery percentage, failure streak, and a detail view for every captured category. |
| Privacy-aware AI display | Hides prompt and token details when `sprintly.telemetry.showAiTracking` is disabled while preserving the local setting boundary. |
| Session controls | Provides context-aware `Start Sprint`, `Pause Sprint`, `Resume Sprint`, `End Sprint`, and `Clear Session Data` actions. |
| Refresh and settings | Includes explicit refresh and Sprintly settings buttons. |
| Live updates | Subscribes to tracker and persistent-state changes while open, then disposes those subscriptions when closed. |

## Commands

| Command ID | Command-palette title | Status and behavior |
| --- | --- | --- |
| `sprintly.startSession` | `Sprintly: Start Session` | **Active.** Starts a fresh tracked sprint. |
| `sprintly.pauseSession` | `Sprintly: Pause Session` | **Active.** Pauses timing and capture. |
| `sprintly.resumeSession` | `Sprintly: Resume Session` | **Active.** Resumes a paused sprint. |
| `sprintly.stopSession` | `Sprintly: Stop Session` | **Active.** Ends the sprint and retains its persistent summary. |
| `sprintly.resetSession` | `Sprintly: Reset Session` | **Active.** Clears the current/latest session data. |
| `sprintly.showStatusPanel` | `Open Quick Panel` | **Active.** Opens the canonical Sprintly Quick Panel. |
| `sprintly.clearHistory` | `Sprintly: Clear Session History` | **Active.** Deletes locally retained aggregate history after the user confirms. |
| `sprintly.openPanel` | `Open Quick Panel` | **Active alias.** Opens the same Quick Panel. |
| `sprintly.shareSession` | `Share Session` | **Placeholder.** Currently displays a “coming soon” message. |
| `sprintly.saveSession` | `Save Session` | **Placeholder.** Currently displays a saved message but does not persist a history record. |
| `sprintly.devOpenScreen` | `Dev: Jump to Screen` | **Preview.** Opens the demo-screen selector described below. |

## Settings

| Setting | Default | Runtime status |
| --- | ---: | --- |
| `sprintly.enabled` | `true` | **Active.** Disables session start, automatic prompts, and telemetry collection when false. |
| `sprintly.autoPromptOnStartup` | `true` | **Active.** Controls the one-time startup prompt per extension-host process and workspace. |
| `sprintly.historyRetention` | `100` | **Active.** Retains a bounded number of aggregate session records in global state. |
| `sprintly.cloudSyncEnabled` | `false` | **Local boundary only.** Marks an aggregate export as eligible for a future sync transport; the extension does not transmit data. |
| `sprintly.telemetry.trackCodingActivity` | `true` | **Active.** Controls document, save, editor, and terminal activity counters. |
| `sprintly.telemetry.trackAgentUsage` | `true` | **Active.** Controls local prompt/token aggregate collection. |
| `sprintly.telemetry.trackBuildFailures` | `true` | **Active.** Controls terminal failure and recovery aggregates. |
| `sprintly.telemetry.showAiTracking` | `true` | **Active.** Controls whether AI usage is shown in the Quick Panel and detail views. |
| `sprintly.pricing.claudeCode.input` | `3.0` | **Active.** USD per million Claude input tokens. |
| `sprintly.pricing.claudeCode.output` | `15.0` | **Active.** USD per million Claude output tokens. |
| `sprintly.pricing.claudeCode.cacheRead` | `0.3` | **Active.** USD per million Claude cache-read tokens. |
| `sprintly.pricing.claudeCode.cacheCreate` | `3.75` | **Active.** USD per million Claude cache-creation tokens. |

## Developer previews

The `Dev: Jump to Screen` command exposes a richer Quick Pick UI concept. These screens use hard-coded demo data and are not connected to the live session store.

| Preview screen | What it demonstrates |
| --- | --- |
| Opening screen | Rank tier, streak, average session, regional rank, last session, and navigation to session, leaderboard, and history previews. |
| Live session screen | Animated timer, vibe/hard percentages, build failures, AI prompt count, regional rank pulse, pause/resume, a session goal input, and end-session navigation. |
| Leaderboard | Region/global/friends scope controls, week/month/all-time filters, ranked entries, and the user's position. Filters change the labels but not the demo dataset. |
| History | Streak, ten-week activity heatmap, personal bests, clean days, and a six-session demo log. Export is a placeholder. |
| Session complete | Session trophy, vibe/hard split, failure and prompt totals, rank result, mood tagging, and share/save/home actions. Share and save remain placeholders. |

## Privacy and local-data behavior

- Sprintly does not begin a session until the user selects `Start Sprint` or runs the start command.
- The extension stores aggregate session metrics and agent-log byte cursors in VS Code extension global state.
- It does not persist raw source code, prompt text, terminal command text, terminal output, or the live set of project source-file paths. Agent-log paths are retained only as keys for incremental byte cursors.
- Prompt content is parsed locally only far enough to distinguish user-authored agent requests; only counts and usage totals are retained.
- Failed terminal output is inspected locally and within fixed bounds; only a failure category and count are retained.
- The active extension code does not send tracked data over the network.
- Agent usage is filtered to open workspace folders before it is added to a Sprintly session.

## Current limitations and non-features

- Session history is retained locally as bounded aggregate records. A hosted history database and transport are not included.
- General live activity counters are persisted when a sprint ends; in-progress counters are still session-local until stop/recovery.
- Share, hosted export, friends, remote rank, and social/profile behavior remain placeholders because no authenticated website API is connected to the active extension.
- Sprintly does not currently capture agent/API errors. “Build failures” specifically means failed integrated-terminal executions.
- Coding attribution remains deliberately conservative because VS Code document-change events do not always expose the provider. Unattributed bulk changes are not labeled AI.
- Terminal commands are classified into privacy-safe categories; raw command text and output are never retained.
- Build-failure tracking requires VS Code terminal shell integration and an available exit code.
- Codex tokens can be unavailable when its local log does not provide a supported usage record.
- Copilot discovery is reliable for folder workspaces; a `.code-workspace` storage URI is not currently resolved back to its constituent folders.
- The website/social layer is not wired to the active extension; the local sync payload is the integration boundary for a future authenticated service.
- `SessionPanelProvider`, its webview HTML, the older status-bar implementation, and legacy JavaScript session/UI modules exist in the source tree but are not registered by the active TypeScript entry point.

## Implementation map

| Area | Primary implementation |
| --- | --- |
| Activation and preview commands | `src/extension.ts` |
| Session commands | `src/commands.ts` |
| Startup prompt | `src/consentFlow.ts` |
| Live activity counters and archetypes | `src/sessionTracker.ts` |
| Persistent session state and boundaries | `src/tracking/dailyStateStore.ts` |
| Hardcode/vibecode duration tracking | `src/tracking/sessionActivityTracker.ts` |
| Agent source schemas and workspace discovery | `src/tracking/agentLogSources.ts` |
| Incremental agent-log processing | `src/tracking/agentLogWatcher.ts` |
| Terminal failure tracking | `src/tracking/buildFailureTracker.ts` |
| Privacy controls | `src/tracking/privacySettings.ts` |
| Session history and aggregate sync payload | `src/tracking/sessionHistory.ts` and `src/tracking/sessionAggregation.ts` |
| Developer identity and gamification foundation | `src/tracking/developerIdentity.ts` and `src/tracking/gamification.ts` |
| Claude price configuration and estimate | `src/tracking/pricing.ts` |
| Status bar and hover card | `src/panels/statusBar.ts` |
| Production Quick Panel | `src/panels/sessionQuickPick.ts` |
| Demo screens | `src/panels/sprintlyPanels.ts` |
| Commands and settings manifest | `package.json` |

## Verification coverage

The automated suite currently verifies startup prompt language/behavior, session reset and boundaries, pause handling, workspace isolation, persisted log cursors, Copilot Chat patch parsing and lazy discovery, prompt/token summaries, conservative coding attribution, terminal category and failure/recovery boundaries, privacy settings, session history retention/aggregation, versioned aggregate sync payloads, deterministic identity, explainable score/badge calculations, shared status/Quick Panel presentation, click/hover behavior, and stable hover rendering.
