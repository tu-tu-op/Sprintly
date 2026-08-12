# Sprintly v2 — Workplan & Status Tracker

> Companion doc: `sprintly-v2-codex-prompt.md` is the detailed technical spec for
> what to build in each feature. It is not currently present in the repository or
> alongside the supplied workplan, so exact-shape checks remain limited to this plan.

## Per-session accounting clarification (2026-08-12)

Prompt counts, token usage, build failures, and hardcode/vibecode duration are scoped
to one explicit Sprintly recording rather than combined across the local day. Starting
a recording creates a fresh session record; pausing excludes activity; stopping keeps
the completed session visible; starting again resets the metrics while retaining file
cursors so agent logs are never replayed.

Implementation was split into independently verified commits:

1. Session-scoped persisted state and migration (`34f12f9`).
2. Recording lifecycle, activity, and build-failure gates (`6989afd`).
3. Timestamp-windowed agent prompt and token accounting (`fb63654`).
4. Current/last-session UI wording and final acceptance pass (this phase).

## How to use this file

1. Read this file before writing feature code.
2. Resume the first phase that is not marked done.
3. Do not start a phase until its prerequisites are done.
4. Check a task only after its verification passes.
5. Record checks that require a live VS Code or agent session as `MANUAL` until run.
6. Append a session-log entry after each work session.

## Status snapshot

| Phase | Name | Status |
|---|---|---|
| 0 | Discovery & Audit | `[x] DONE` |
| 1 | Shared Infrastructure | `[~] IN PROGRESS` |
| 2 | Feature 1 — Session Tracking (Hardcode vs Vibecode) | `[ ] NOT STARTED` |
| 3 | Feature 2 — Agent Prompt Counter | `[ ] NOT STARTED` |
| 4 | Feature 4 — Token / Credit Usage | `[ ] NOT STARTED` |
| 5 | Feature 3 — Build / Run Failure Tracking | `[ ] NOT STARTED` |
| 6 | QuickPick UI Integration | `[ ] NOT STARTED` |
| 7 | Verification & Acceptance Pass | `[ ] NOT STARTED` |

Legend: `[ ] NOT STARTED` · `[~] IN PROGRESS` · `[x] DONE` · `[!] BLOCKED`

## Phase 0 — Discovery & Audit

Goal: understand the existing codebase before changing feature code.

### Tasks

- [x] Locate the existing heartbeat/session-gate logic.
- [x] Locate the state store or event-bus pattern.
- [x] Locate the QuickPick renderers for the five existing screens.
- [x] Confirm TypeScript strictness settings.
- [x] Confirm activation events and entry point.
- [x] Record concrete findings below.

### Discovery notes

- Heartbeat/session-gate logic: the v1 consent-gated tracker is
  `src/sessionTracker.ts`; it listens for edits, saves, editor switches, and terminal
  opens but has no heartbeat or session-gap gate. The newer 120-second same-file
  heartbeat and 15-minute gap implementation is in
  `src/tracking/sessionActivityTracker.ts`.
- State store / event bus: `src/sessionTracker.ts` owns the v1 in-memory
  `vscode.EventEmitter<SessionStats>`. `src/tracking/dailyStateStore.ts` is the newer
  persistent daily store, uses `context.globalState`, and exposes `onDidUpdate`. It is
  structurally extensible, but its current top-level names (`session`, `tokenStats`)
  do not match the plan's required names (`sessions`, `tokenUsage`).
- QuickPick renderers: the five existing screen renderers are in
  `src/panels/sprintlyPanels.ts`; the status/tracking QuickPick is in
  `src/commands.ts`. They use ThemeIcon-prefixed labels, separator rows,
  descriptions for primary stats, and details for secondary text. Native QuickPick
  does not support custom font families, so the stated Space Grotesk / JetBrains Mono
  convention is neither enforceable nor present in this implementation.
- TypeScript strictness: `tsconfig.json` sets `strict: true`; therefore
  `noImplicitAny` and the other strict-family checks are enabled through `strict`.
- Activation entry point: `package.json` activates on `onStartupFinished` and loads
  `./out/extension.js`. `src/extension.ts` exports `activate()` and currently creates
  `DailyStateStore`, `SessionActivityTracker`, `AgentLogWatcher`, and
  `BuildFailureTracker` during activation.
- Repository layout: root source files are byte-for-byte identical to the latest
  committed copies under `extension/` at commit `8789cce`; the current worktree
  contains a pre-existing, uncommitted relocation from `extension/` to the root.

Phase gate: passed — all discovery entries contain real paths and limitations are
recorded explicitly.

## Phase 1 — Shared Infrastructure

Prerequisite: Phase 0 done.

### Tasks

- [ ] Define or extend the shared state store with top-level `sessions`,
  `agentPrompts`, `tokenUsage`, and `buildFailures` domains using the companion spec's
  exact shapes.
- [ ] Verify the shared local-midnight reset mechanism.
- [x] Scaffold the `AgentLogSource` interface in
  `src/tracking/agentLogSources.ts`.
- [x] Wire `context.globalState` for persisted file offsets in
  `src/extension.ts` and `src/tracking/dailyStateStore.ts`.

Phase gate: pending — the store compiles, but domain naming is not compliant and the
daily reset has not been covered by an automated test or recorded manual check.

## Phase 2 — Feature 1: Session Tracking (Hardcode vs Vibecode)

Prerequisite: Phase 1 done.

### Tasks

- [ ] Verify `onDidChangeTextDocument` hardcode/vibecode classification.
- [ ] Verify the 120-second same-file heartbeat gate.
- [ ] Verify 15-minute session-gap duration reconstruction.
- [ ] Wire totals to the finalized Phase 1 `sessions` domain.
- [ ] Run and record all four acceptance criteria from the companion spec.

## Phase 3 — Feature 2: Agent Prompt Counter

Prerequisite: Phase 1 done.

### Tasks

- [ ] Verify the `fs.watch` plus five-second polling fallback.
- [ ] Verify Claude Code parsing and `tool_result` exclusion.
- [ ] Verify Codex multi-schema parsing.
- [ ] Verify one-time backfill and persisted offsets.
- [ ] Wire counts to the finalized `agentPrompts` domain.
- [ ] Run and record all five acceptance criteria from the companion spec.

## Phase 4 — Feature 4: Token / Credit Usage

Prerequisite: Phase 3 done.

### Tasks

- [ ] Verify Claude Code usage extraction.
- [ ] Verify Codex graceful unavailable-state behavior.
- [ ] Verify the `sprintly.pricing.*` settings and stale-rate warning.
- [ ] Verify arithmetic and estimate labeling on every rendered surface.
- [ ] Wire totals to the finalized `tokenUsage` domain.
- [ ] Run and record all three acceptance criteria from the companion spec.

## Phase 5 — Feature 3: Build / Run Failure Tracking

Prerequisite: Phase 1 done.

### Tasks

- [ ] Verify shell-integration listeners.
- [ ] Verify the nonzero, defined exit-code gate.
- [ ] Verify bounded failure-output capture.
- [ ] Verify ordered failure categorization.
- [ ] Verify terminals without shell integration are skipped.
- [ ] Wire totals to the finalized `buildFailures` domain.
- [ ] Run and record all four acceptance criteria from the companion spec.

## Phase 6 — QuickPick UI Integration

Prerequisites: Phases 2–5 done.

### Tasks

- [ ] Verify one status item per feature area in the existing QuickPick.
- [ ] Verify each detail sub-QuickPick.
- [ ] Confirm no `WebviewPanel` or `createWebviewPanel` was introduced.

## Phase 7 — Verification & Acceptance Pass

Prerequisite: Phase 6 done.

### Final acceptance table

| Feature | Criterion | Result |
|---|---|---|
| 1 | Paste 10-line block → vibecodeMs increments | `TBD` |
| 1 | Char-by-char typing → hardcodeMs increments | `TBD` |
| 1 | Fast file-switch does not double-count | `TBD` |
| 1 | 20-minute idle starts a new session | `TBD` |
| 2 | Extension-panel prompt = +1, not per tool call | `TBD` |
| 2 | Claude Code CLI prompts counted | `TBD` |
| 2 | Codex CLI prompts counted separately | `TBD` |
| 2 | Restart does not double-count | `TBD` |
| 2 | Malformed JSONL does not crash watcher | `TBD` |
| 3 | Missing-package failure categorized correctly | `TBD` |
| 3 | Exit-0 command does not increment | `TBD` |
| 3 | No-shell-integration terminal does not throw | `TBD` |
| 3 | Repeated failures increment each time | `TBD` |
| 4 | Claude Code cost estimate is correct | `TBD` |
| 4 | Missing Codex schema shows “—”, not zero | `TBD` |
| 4 | Live pricing change updates the estimate | `TBD` |

## Session log

### 2026-08-12 — Per-session accounting follow-up

- Worked on: recording lifecycle boundaries for coding activity, Claude Code and Codex
  prompts/tokens, terminal failures, persisted log cursors, and QuickPick/status-bar
  summaries.
- Verified: TypeScript strict compilation and seven automated tests covering session
  resets, pause/stop boundaries, interrupted reopen behavior, cursor advancement,
  activity gaps, terminal failures, malformed JSONL, and prompt/token windowing.
- Git: each implementation phase was committed separately as listed above.

### 2026-08-12 — Phase 0

- Worked on: repository layout, v1/v2 tracking paths, state/event patterns,
  QuickPick renderers, compiler settings, activation wiring, and current git state.
- Completed: all Phase 0 discovery tasks; verified paths with source inspection,
  verified the root/`extension/` content equivalence with Git object hashes, and ran
  `npm run compile` successfully.
- Blocked on: the referenced `sprintly-v2-codex-prompt.md` companion specification is
  missing, so exact data shapes and acceptance details beyond this workplan cannot be
  validated yet.
- Next: finish Phase 1 by aligning top-level store domain names and adding an automated
  daily-reset test, then compile and commit Phase 1 separately.
