# DevStrava / Sprintly

DevStrava / Sprintly is a consent-first, local-first VS Code extension for
aggregate developer activity history. Workspace-local history is canonical;
the companion website is an explicit handoff destination.

## Included

- Startup consent prompt and the existing Quick Panel/status-bar architecture
- Workspace-local versioned session history with restart/interruption recovery
- Pause/resume/stop/reset lifecycle boundaries and retention controls
- Privacy-safe coding, categorized terminal, AI aggregate, and failure/recovery metrics
- Deterministic today/week/month/all-time aggregation, score, streaks, records, and archetypes
- Versioned export/import with strict validation
- Configurable Sprintly API health checks, SecretStorage-backed pairing, and
  durable aggregate-only session sync with bounded retry status
- Explicit local-history migration, queue clearing, server-consent blocking,
  and AI/terminal aggregate privacy controls
- Explicit Connect Website, Share Session, Sync History, and Join Leaderboard handoffs

The extension never stores raw source code, prompt text, terminal command text,
terminal output, secrets, or environment variables. Unattributed bulk edits are
reported as unknown bulk edits rather than being called AI-generated.

## Commands

- `Open Quick Panel`
- `Sprintly: Start Session`, `Pause Session`, `Resume Session`, `Stop Session`
- `Sprintly: Export DevStrava Data`, `Import DevStrava Data`
- `Sprintly: Connect Extension`, `Enter Pairing Code`, `Test Connection`, `Disconnect/Revoke Local Token`
- `Sprintly: Set Development Token` (local development smoke test only)
- `Sprintly: Sync Current Session`, `Sync Pending Sessions`, `Sync Now`, `Migrate Local Sessions`, `Clear Local Sync Queue`, `View Sync Status`
- `Sprintly: View Session Report`, `Share Session`, `Sync History`, `Join DevStrava Leaderboard`

## Local development

Install dependencies, compile the extension, and run the test suite with:

```bash
npm install
npm test
```

Press `F5` in VS Code to launch the extension in an Extension Development Host.

## Website API bridge

The extension defaults to `http://localhost:3000` for the website API. Use
`sprintly.apiUrl` or the `SPRINTLY_API_BASE_URL` environment variable for
Remote SSH, WSL, or Dev Container hosts. Uploading is disabled by default:
enable `sprintly.syncEnabled`, pair the extension in the signed-in website,
and choose `sprintly.syncPreference` (`selected` or `completed`). Keep the
preference at `never` for local-only operation. Manual JSON export remains a
separate fallback and uses `contract: devstrava.session.v1` with numeric
`schemaVersion: 1`.

The extension connects to website API routes, never directly to Supabase. Do
not copy the website `.env.local` file or any Supabase credentials into this
repository or VS Code; the unit tests need no website secrets.

The current sibling website repository still exposes the import UI rather than
the `/api/extension/health`, `/api/extension/pairing/complete`, and
`/api/extension/sessions` route handlers. The extension’s HTTP, pairing, queue,
and privacy boundaries are documented in
[SPRINTLY_EXTENSION_API.md](SPRINTLY_EXTENSION_API.md); no Supabase code or
credentials are used here.

See [DEVSTRAVA_DATA_CONTRACT.md](DEVSTRAVA_DATA_CONTRACT.md) for the shared
`devstrava.session.v1` schema and privacy rules.
