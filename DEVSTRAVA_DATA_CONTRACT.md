# DevStrava local data contract

The extension is local-first. `context.workspaceState` is the canonical owner
of session history for the opened workspace. Upload is disabled by default and
requires explicit extension sync, website pairing, and a selected/completed
sync preference. Pairing never bulk-migrates existing history.

## Version

Every website-facing session record uses:

```text
schemaVersion: devstrava.session.v1
```

The HTTP root envelope is exactly:

```json
{
  "contract": "devstrava.session.v1",
  "schemaVersion": 1,
  "sessions": []
}
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
commands, terminal output, secrets, environment variables, file names, or API
keys. A large document change without provider attribution is `unknownBulkEdit`,
not an AI claim. Unknown token totals are represented as `null` in the local
public contract; the website wire contract uses bounded numeric fields.

AI usage and terminal activity are independently configurable aggregate
categories. When disabled, new collection stops and queued wire payloads are
redacted before upload.

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

## Website bridge

The authenticated API bridge uses the configured `sprintly.apiUrl` (or the
`SPRINTLY_API_BASE_URL` environment override) and these website-owned routes:

1. `GET /api/extension/health` is called without Authorization and must return
   `ok: true`, `contract: devstrava.session.v1`, and numeric `schemaVersion: 1`.
2. The signed-in website creates a short-lived code through its own pairing
   flow. The extension sends that code, a stable installation device ID, name,
   and `deviceType` to `POST /api/extension/pairing/complete`.
3. The returned opaque token is stored only in VS Code SecretStorage.
4. Sessions are sent to `POST /api/extension/sessions` in the exact contract
   envelope. Accepted and duplicate IDs are the only queue-finalizing results.

The website derives ownership from the bearer token. The extension never
creates users, sends `user_id`, queries Supabase, or treats client scores or
verification flags as authoritative. A website-disabled response blocks
future automatic uploads without deleting local sessions. `401` clears only
the in-memory uploader state and requires another pairing.

The explicit JSON-file fallback remains available:

1. The user invokes Export, Share Session, Sync History, or Join Leaderboard.
2. The extension prepares only the selected aggregate payload.
3. The user chooses where to save the JSON file.
4. For website actions, the extension opens the configured website URL.
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
signer is not part of the default export or website API upload, so cryptographic
verification is opt-in and the website remains responsible for server trust.
