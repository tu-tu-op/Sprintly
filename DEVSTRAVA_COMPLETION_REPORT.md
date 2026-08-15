# DevStrava / Sprintly local-first completion report

This report describes the active root TypeScript extension. The Quick Panel
remains a Quick Pick opened by `sprintly.showStatusPanel`; no Activity Bar,
Explorer, bottom-panel, or editor-tab replacement was introduced.

## Completed

- Added `LocalSessionStore` with versioned workspace-local drafts and completed
  records: create, update, complete, get, list, delete, clear, export, import,
  aggregates, retention, restart recovery, and duplicate-safe completion.
- Every website-facing session uses `schemaVersion: devstrava.session.v1`.
- Added deterministic today/week/month/all aggregation, current/longest streaks,
  personal records, version-1 developer scoring, and archetype traits.
- Preserved conservative coding attribution: manual, AI-assisted when known,
  automation, and unknown bulk edit.
- Kept terminal command text and output ephemeral while storing categorized
  build/test/git/package-manager/dev-server/lint/formatter/deployment/other
  counts. Failure categories include build, test, type, lint, package/module,
  syntax, permission, and other when observable.
- Persisted in-progress drafts on tracking updates and completed them after an
  interrupted extension host without merging separate sessions.
- Added explicit export/import commands with strict schema validation and
  malformed/future-version rejection.
- Added explicit Connect Website, Share Session, Sync History, and Join
  Leaderboard commands. The handoff is a user-selected JSON file plus opening
  the configured website URL; no payload is placed in a URL and no upload is
  automatic.
- Added privacy controls for recording, startup prompt, local history,
  retention, telemetry categories, AI display, and cloud-sync consent.
- Added the optional `LocalSessionPacketSigner` Ed25519 abstraction using
  VS Code SecretStorage. It is not part of default handoff payloads.

## Partially implemented

- The website handoff is a secure export/import fallback. It does not yet have
  a production authenticated browser bridge or server API because the current
  repository has no connected DevStrava backend.
- The companion website remains a static/demo surface; it is not treated as an
  automatic cloud database or as authority for local history.
- VS Code shell integration is required for command and failure details. Where
  command text or exit/output information is unavailable, the extension records
  `other`/unavailable rather than inferring a category.

## Deferred

- Authenticated short-lived pairing/session exchange.
- Website-side persistence, profiles, public snapshots, social cards, and
  server-backed leaderboards.
- Provider APIs that could attribute arbitrary document edits to a specific AI
  source. Unattributed bulk edits remain explicitly unattributed.

## Contract and verification

See [DEVSTRAVA_DATA_CONTRACT.md](DEVSTRAVA_DATA_CONTRACT.md) for the schema,
privacy boundary, handoff protocol, import rules, and score version.

The root suite covers lifecycle boundaries, persistence/reopen behavior,
retention, import/export, validation, workspace isolation, aggregation,
scoring, archetypes, terminal categories, failure/recovery, privacy, handoff
payloads, and optional signing. `npm test` currently passes all tests after
compilation.
