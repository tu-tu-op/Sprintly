# DevStrava

DevStrava is a consent-first VS Code extension foundation for a "Strava for developers" experience.

## What Is Included

- Startup consent prompt on extension activation
- Local consent storage
- Right-aligned status bar controls
- Minimal session stats panel
- Privacy-safe telemetry counters for edits, saves, file switches, terminal activity, failed runs, and active time
- Style scoring for vibecoding, hardcore coding, debugging intensity, and productivity rhythm
- Pause, resume, reset, and stop controls
- Static companion website in `website/`

## Current Privacy Model

The extension does not record anything by default. Recording only starts when the user explicitly approves the current session. The extension records only aggregated metadata:

- Recording on/off state
- Session start time
- Elapsed session time
- Consent decision history for the local machine
- Activity counters and summary scores

It does not store raw code, raw terminal command text, or file paths.

## Commands

- `DevStrava: Session Controls`
- `DevStrava: Toggle Stats`
- `DevStrava: Open Compact Control Panel`
- `DevStrava: Pause Recording`
- `DevStrava: Resume Recording`
- `DevStrava: Stop Recording`
- `DevStrava: Reset Current Session`

## Website

Open `website/index.html` in a browser to view the companion dashboard, session history, share-card controls, regional leaderboard, and public/private profile controls.
