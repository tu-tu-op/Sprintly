# Sprintly extension API bridge

The VS Code extension is a separate repository from the Sprintly website. It
uses only the website HTTP API and never imports Supabase clients, credentials,
service keys, database URLs, or database code.

## Configuration

The shipped extension reads:

- `sprintly.apiUrl` — defaults to `http://localhost:3000`; configure the
  reachable host when the extension host is in WSL, Remote SSH, or a Dev
  Container.
- `sprintly.apiEnvironment` — `development` or `production`.
- `sprintly.syncPreference` — `never` (default), `selected`, `completed`, or
  `leaderboard`.
- `sprintly.leaderboardOptIn` — false by default.

Use **Sprintly: Set Development Token** for local development. The token is
entered as a password and stored in VS Code SecretStorage. A value in
`sprintly.developmentToken` is supported as a read-only local fallback, but
the extension never writes a token to settings, exports, queue records, or
logs.

## Health

The extension sends:

```http
GET /api/extension/health
Accept: application/json
```

The response must be:

```json
{
  "ok": true,
  "contract": "devstrava.session.v1",
  "schemaVersion": 1
}
```

Any other contract or schema version is rejected as incompatible.

## Session upload

The extension sends one or more completed, aggregate-only sessions:

```http
POST /api/extension/sessions
Accept: application/json
Content-Type: application/json
Authorization: Bearer <device-token>
```

```json
{
  "contract": "devstrava.session.v1",
  "schemaVersion": 1,
  "sessions": []
}
```

Each session uses the website compatibility contract. `sessionId` is the
idempotency key. A successful response should identify records in any of these
forms:

```json
{
  "accepted": [{ "sessionId": "sess_123" }],
  "duplicates": ["sess_already_present"],
  "rejected": [{ "sessionId": "sess_bad", "reason": "validation detail" }]
}
```

The extension treats accepted and duplicate records as success. Rejected
records are retained as permanent queue failures with their reasons. `400`
validation errors are not retried forever; `401` responses require reconnect;
responses identifying a revoked device clear the stored device token. Network,
timeout, `408`, `425`, `429`, and `5xx` errors use bounded exponential retry.

## Pairing adapter contract

The current website repository does not yet expose a pairing route. The
extension therefore ships an explicit unavailable adapter and makes no
undocumented pairing request by default. A future website adapter should
implement this typed exchange:

```http
POST /api/extension/pairing/exchange
Content-Type: application/json
```

```json
{ "code": "short-lived-pairing-code" }
```

```json
{
  "ok": true,
  "deviceToken": "opaque-device-token",
  "expiresAt": "2026-08-15T12:00:00.000Z"
}
```

The extension opens the configured website URL, accepts the short-lived code,
stores only the returned opaque token in SecretStorage, and then validates the
health contract. The website must define its final pairing and revocation
routes before replacing `UnavailablePairingAdapter`; the extension does not
silently guess a different protocol.

## Privacy and local queue

Only aggregate counters, percentages, timestamps, active duration, scores,
archetype, reliability totals, and session ID cross the bridge. Source code,
file contents, keystrokes, secrets, passwords, full terminal output, prompt
contents, raw command text, and arbitrary paths never cross it.

The durable outbox is stored in VS Code workspace state. It keeps `pending`,
`syncing`, `synced`, and `failed` records with attempt metadata and preserves
failed records for manual retry. Local recording and manual JSON export do not
depend on network availability. `never` prevents all upload calls; `selected`
requires an explicit session selection; `completed` queues completed sessions;
`leaderboard` does not upload raw sessions and requires explicit leaderboard
opt-in.

## Website-side status

The sibling website repository currently provides the contract/import UI but no
`/api/extension/health`, `/api/extension/sessions`, or pairing route handlers.
This extension implementation is ready for those routes and uses injectable
transport/adapter boundaries for tests. The manual end-to-end upload test is
therefore gated until the website publishes the documented routes.
