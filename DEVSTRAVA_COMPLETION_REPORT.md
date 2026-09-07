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
  Leaderboard commands. The file handoff is user-selected, no payload is
  placed in a URL, and no history migration is automatic.
- Added authenticated HTTP health, one-time device pairing, SecretStorage
  token handling, durable aggregate-only upload, duplicate idempotency,
  revocation handling, server-consent blocking, bounded batching/backoff, and
  explicit local-history migration.
- Added privacy controls for recording, startup prompt, local history,
  retention, extension sync, coding/AI/terminal/failure telemetry, AI display,
  and cloud-sync consent. The Quick Panel shows pending/rejected counts and
  connection state.
- Added the optional `LocalSessionPacketSigner` Ed25519 abstraction using
  VS Code SecretStorage. It is not part of default handoff payloads.

## Integration boundary

The companion website remains the owner of API routes, authentication,
Supabase persistence, profiles, public snapshots, social cards, retention,
verification, and server-backed leaderboards. The current website directory is
a static/demo surface without the extension route handlers, so this repository
does not add a second database or pretend that local handoff is server sync.
The extension is ready for the website's documented
`/api/extension/health`, `/api/extension/pairing/complete`, and
`/api/extension/sessions` routes.

VS Code shell integration is required for command and failure details. Where
command text or exit/output information is unavailable, the extension records
`other`/unavailable rather than inferring a category. Provider APIs that could
attribute arbitrary document edits to a specific AI source are intentionally
not used; unattributed bulk edits remain explicitly unattributed.

## Contract and verification

See [DEVSTRAVA_DATA_CONTRACT.md](DEVSTRAVA_DATA_CONTRACT.md) for the schema,
privacy boundary, handoff protocol, import rules, and score version.

The root suite covers lifecycle boundaries, persistence/reopen behavior,
retention, import/export, validation, workspace isolation, aggregation,
scoring, archetypes, terminal categories, failure/recovery, privacy, pairing,
HTTP contract behavior, queue retries, migration, handoff payloads, and
optional signing. `npm test` passes all tests after compilation.
