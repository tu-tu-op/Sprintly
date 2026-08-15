# DevStrava local data contract

The extension is local-first. `context.workspaceState` is the canonical owner
of session history for the opened workspace. The extension does not upload
tracking data on activation, on a timer, or when a session completes.

## Version

Every website-facing session record uses:

```text
schemaVersion: devstrava.session.v1
```

The local persistence envelope is `devstrava.local-store.v1`. The full export
envelope uses `exportVersion: devstrava.export.v1` while retaining the session
schema in its `schemaVersion` field.

## Stored and exported data

Completed sessions contain timestamps, active/pause durations, estimated coding
mix, edit/save/file-count aggregates, categorized terminal counts, AI prompt and
available token totals, failure/recovery aggregates, deterministic score
components, and deterministic archetype/trait labels.

The extension does not persist or export source code, prompt text, raw terminal
commands, terminal output, secrets, environment variables, or API keys. A large
document change without provider attribution is `unknownBulkEdit`, not an AI
claim. Unknown token totals are represented as `null` in the public contract.

The internal compatibility record retains milliseconds and legacy field aliases
for deterministic local calculations. Website payloads use ISO timestamps,
seconds, percentages, and camelCase category names (`packageManager` and
`devServer`).

## Aggregates and score

Today, week, month, and all-time aggregates are recalculated from completed
records. The score is normalized to 0–100 and is versioned as
`devScoreVersion: 1`. It combines focus, save consistency, recovery, testing,
shipping activity, and a balanced-AI component. The same input record set
always produces the same score and archetype.

## Website handoff

The initial bridge is an explicit JSON-file fallback:

1. The user invokes Export, Share Session, Sync History, or Join Leaderboard.
2. The extension prepares only the selected aggregate payload.
3. The user chooses where to save the JSON file.
4. For website actions, the extension opens the configured HTTPS website URL.
5. The authenticated website asks the user to import the file and authorize it.

Payloads are never placed in a URL and there is no direct browser filesystem
access. `Sync History` additionally requires the user-facing
`sprintly.cloudSyncEnabled` consent setting. `Connect Website` only opens the
website and transfers nothing.

`Share Session` uses `payloadType: session.share.v1`. History handoff uses
`payloadType: history.sync.v1`. Leaderboard handoff uses
`payloadType: leaderboard.aggregate.v1` and sends only week, session count,
active minutes, focus, recovery, score, and streak. Region is `null` until the
user selects it on the website; the extension does not infer or fabricate it.

## Import rules

Import validates the version, required fields, dates, numeric bounds, terminal
categories, score version, and archetype shape before changing local state. A
malformed record or unsupported future schema rejects the complete import.
Duplicate session IDs are merged idempotently, retaining the newer completed
record, and retention is applied after the merge.

## Optional verification

`LocalSessionPacketSigner` provides an extension point for future signed
session packets. It uses an Ed25519 keypair kept in VS Code SecretStorage. The
signer is not part of the default export or website handoff, so cryptographic
verification is opt-in rather than an unnecessary dependency of local history.
