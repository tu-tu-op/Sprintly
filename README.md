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
- Explicit Connect Website, Share Session, Sync History, and Join Leaderboard handoffs

The extension never stores raw source code, prompt text, terminal command text,
terminal output, secrets, or environment variables. Unattributed bulk edits are
reported as unknown bulk edits rather than being called AI-generated.

## Commands

- `Open Quick Panel`
- `Sprintly: Start Session`, `Pause Session`, `Resume Session`, `Stop Session`
- `Sprintly: Export DevStrava Data`, `Import DevStrava Data`
- `Connect to DevStrava Website`, `Share Session`, `Sync History`, `Join DevStrava Leaderboard`

## Website handoff

The current repository has no production authenticated website API. Explicit
handoff commands save a selected aggregate JSON file and, where appropriate,
open the configured website URL. Payloads are never placed in a URL and no
automatic network upload occurs.

See [DEVSTRAVA_DATA_CONTRACT.md](DEVSTRAVA_DATA_CONTRACT.md) for the shared
`devstrava.session.v1` schema and privacy rules.
