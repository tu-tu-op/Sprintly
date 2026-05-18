# Sprintly Commands

Common commands for working on this project.

## Verify JavaScript Syntax

PowerShell may block `npm.ps1` on some Windows machines, so prefer `npm.cmd`:

```powershell
npm.cmd run check
```

Direct syntax checks:

```powershell
node --check src/extension.js
node --check src/session/sessionManager.js
node --check src/session/activityTracker.js
node --check src/session/scoringModel.js
node --check src/session/telemetryModel.js
node --check src/state/sessionStore.js
node --check src/ui/consentPrompt.js
node --check src/ui/sessionPanel.js
node --check src/ui/statusBarController.js
node --check website/app.js
```

## Run The VS Code Extension

Open this folder in VS Code:

```powershell
code C:\Projects\Sprintly
```

Then open the Run and Debug panel and choose `Run Sprintly Extension`, or press `F5`, to launch an Extension Development Host.

Useful commands inside the Extension Development Host:

```text
Sprintly: Session Controls
Sprintly: Toggle Stats
Sprintly: Open Compact Control Panel
Sprintly: Pause Recording
Sprintly: Resume Recording
Sprintly: Stop Recording
Sprintly: Reset Current Session
```

## Run The Website

The website is static and can be opened directly:

```powershell
start .\website\index.html
```

Optional local static server:

```powershell
npx.cmd serve .\website
```

If `serve` starts successfully, open the URL it prints, usually:

```text
http://localhost:3000
```

## Git Status

```powershell
git status --short
```
