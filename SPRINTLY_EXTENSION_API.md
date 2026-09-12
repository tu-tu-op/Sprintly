# Sprintly extension API bridge

The VS Code extension is a separate repository from the Sprintly website. It
talks to the website over HTTP only. The website owns authentication, Supabase
Postgres, RLS, retention, consent, leaderboard computation, and synchronized
history. This repository must not contain Supabase packages, keys, migrations,
database URLs, or direct PostgreSQL access.

## Configuration

The extension has one API origin. It defaults to the local website development
server at `http://localhost:3000` and is exposed as `sprintly.apiUrl`. The
`SPRINTLY_API_BASE_URL` process environment variable overrides that setting for
local development, WSL, Remote SSH, and Dev Containers. The extension does not
read the website's `.env.local` file and no website secret needs to be copied
into VS Code.

Relevant settings are:

- `sprintly.apiEnvironment`: `development` or `production`.
- `sprintly.syncEnabled`: `false` by default; the extension will not upload
  until this is explicitly enabled and the website also allows sync.
- `sprintly.syncPreference`: `never` (default), `selected`, or `completed`.
  `leaderboard` is an aggregate-only handoff mode and does not upload sessions.
- `sprintly.leaderboardOptIn`: explicit local opt-in for the leaderboard
  handoff.
- `sprintly.telemetry.trackAgentUsage` and
  `sprintly.telemetry.trackTerminalActivity`: local aggregate collection
  controls. Prompt text, command text, terminal output, paths, and source code
  are never stored in a session payload.

When pairing is required, the Quick Panel overview shows `Connect`. It opens
the configured Sprintly Settings page and starts the automatic browser
handoff. The `Website & sync` view also exposes both connection paths:

- `Connect Automatically` opens the configured Sprintly Settings page. The
  website's `Open VS Code` button returns a
  `vscode://tu-tu-op.sprintly/connect` link. Its authority is the extension ID
  from `publisher.name`; VS Code routes it to the installed extension's URI
  handler and the extension exchanges that short-lived code automatically.
- `Connect Manually` accepts the one-time code copied from Sprintly Settings.

Automatic pairing uses only the code and website API origin in the deep link.
It never puts a device token, session payload, or Supabase credential in the
URL. The default local website page is `http://localhost:3000/app/settings`;
set `sprintly.websiteUrl` and `sprintly.apiUrl` for a deployed installation.

The development-token command is a local smoke-test seam only. Its value is
entered as a password and stored only in VS Code `SecretStorage`; it is not a
configuration property and is never included in source control, packages,
exports, diagnostics, or logs. Production pairing stores the opaque device
token in the same SecretStorage boundary.

## Health contract

Before pairing, the extension sends an unauthenticated request:

```http
GET /api/extension/health
Accept: application/json
```

The response must be exactly compatible with:

```json
{
  "ok": true,
  "contract": "devstrava.session.v1",
  "schemaVersion": 1
}
```

An incompatible contract or schema version stops the operation and asks for an
extension/website update. Health checks never carry the bearer token.

## Pairing and authentication

The signed-in website creates the one-time code with its own
`POST /api/extension/pairing` flow. The extension completes the exchange:

```http
POST /api/extension/pairing/complete
Content-Type: application/json
```

```json
{
  "code": "A1B2C3D4E5F6",
  "deviceId": "stable-extension-device-id",
  "deviceName": "Work laptop",
  "deviceType": "vscode"
}
```

`deviceType` is one of `vscode`, `desktop`, or `other`; the installation device
ID is generated once and remains stable. Pairing sends no Authorization header,
never retries a consumed code, and stores only the returned `token` in
SecretStorage. The extension never creates a user, sends `user_id`, or infers
website ownership.

The user-facing commands are `Sprintly: Connect Extension`,
`Sprintly: Enter Pairing Code`, `Sprintly: Test Connection`, and
`Sprintly: Disconnect/Revoke Local Token`. A `401` clears only the in-memory
uploader token, persists a pairing-required state across extension restarts,
retains the local queue and SecretStorage value, and stops further uploads until
the user pairs again or explicitly disconnects. The unauthenticated health
check cannot clear that state.

## Session upload contract

Uploads use:

```http
POST /api/extension/sessions
Authorization: Bearer <paired-device-token>
Content-Type: application/json
```

The root envelope is exact:

```json
{
  "contract": "devstrava.session.v1",
  "schemaVersion": 1,
  "sessions": []
}
```

Each session is validated before it enters the queue and before transmission:
stable unique `sessionId`; RFC 3339 timestamps with explicit timezones;
positive active duration within the elapsed window; coding percentages summing
to 100; bounded counts, scores, strings, and arrays; terminal categories no
larger than `totalCommands`; and consistent recovery totals/rate. Unsupported
fields are rejected rather than silently added.

The website limits each request to 1 MB and 100 sessions. The extension chunks
large queues to those limits and splits a server-side `413` response into
smaller bounded batches. `accepted` and `duplicates` are the only responses
that finalize a queue record; unnamed records remain queued/rejected rather
than being inferred as successful.

Response handling is:

- `accepted`: mark synchronized and remove from the pending work set.
- `duplicates`: mark synchronized/idempotent and remove from pending work.
- `rejected` or `400`: retain a bounded rejected record with the reason for
  explicit manual retry or queue clearing.
- `401`: stop uploads and require pairing again.
- `413`: split the batch.
- `408`, `425`, `429`, `5xx`, timeout, network, or offline failure: preserve
  the queue and use bounded exponential retry with jitter.
- Unknown contract/schema: stop and show an update message.
- A server response that says synchronization is disabled: stop automatic
  uploads until the website setting changes; local sessions are not deleted.

## Local queue and migration

The durable outbox is aggregate-only workspace state with bounded capacity. A
session is represented as `local` when it has no upload record, `pending` while
queued, `synced` after an explicit accepted/duplicate acknowledgement, and
`rejected` after a permanent response. The underlying queue also records
attempts and retry times, but never stores a token or raw activity.

Pairing does not upload existing local history. `Sprintly: Migrate Local
Sessions` is a separate confirmation-backed action for an explicit bulk
migration. `Sprintly: Sync Current Session` handles an explicit selection;
completed-session uploads are enabled only by the `completed` preference.
`Sprintly: Sync Now` retries due and manually retryable records. `Sprintly:
Clear Local Sync Queue` removes pending/rejected queue records without deleting
session history.

The Quick Panel and `Sprintly: View Sync Status` expose connection state, sync
consent state, last successful sync time, pending count, and rejected count.

## Privacy boundary

Only validated aggregate fields from `devstrava.session.v1` cross the bridge:
timestamps, active duration, coding percentages, edit/save/file-count
aggregates, categorized terminal totals, AI prompt/token totals when enabled,
reliability totals, score components, archetype labels, and the stable session
ID. Source code, source text, keystrokes, file names, raw paths, secrets,
environment variables, raw command lines, terminal output, and AI prompt
contents do not cross the bridge. Server-side verification and competitive
scores remain website responsibilities; client `verified`/score-like values are
not treated as authoritative.

## Testing and website integration

Run the extension checks with:

```bash
npm test
```

The unit suite covers canonical serialization/validation, privacy redaction,
pairing, stable IDs, duplicates, 401/413/network behavior, bounded retries,
queue persistence, migration, and the local-only path.

For an end-to-end run, the sibling website must provide the documented health,
pairing, and session routes. Then start the website at
`http://localhost:3000`, pair a development device or use the explicitly
configured local development token, upload once, repeat to verify a duplicate,
revoke the device, and disable website sync to verify future uploads stop. The
current website directory in this workspace is a static/demo surface and does
not provide those route handlers, so no Supabase or `.env.local` setup is
required for the extension unit tests.
