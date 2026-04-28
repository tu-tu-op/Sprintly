const vscode = require('vscode');

const SESSION_VIEW_ID = 'devStravaStatsView';

class SessionPanel {
  /**
   * @param {vscode.Uri} extensionUri
   * @param {import('../session/sessionManager').SessionManager} sessionManager
   */
  constructor(extensionUri, sessionManager) {
    this.extensionUri = extensionUri;
    this.sessionManager = sessionManager;
    this.view = undefined;
    this.changeSubscription = this.sessionManager.onDidChange(() => {
      this._render();
    });
  }

  register(context) {
    const provider = vscode.window.registerWebviewViewProvider(SESSION_VIEW_ID, this, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    });

    context.subscriptions.push(provider);
  }

  show() {
    this.sessionManager.notePanelShown();
    // Always execute the view focus command — this is the correct VS Code API
    // to open the panel container in the bottom panel region and reveal the
    // webview tab inside it. If the view is already resolved and visible we
    // also call view.show(true) to bring it into focus without toggling.
    vscode.commands.executeCommand(`${SESSION_VIEW_ID}.focus`);

    if (this.view) {
      this.view.show(true);
      this._render();
    }
  }

  /**
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    this.view.webview.options = {
      enableScripts: true
    };

    this.view.onDidDispose(() => {
      this.view = undefined;
    });

    this.view.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'openConsentPrompt') {
        await vscode.commands.executeCommand('devStrava.showConsentPrompt');
      }

      if (message.command === 'pauseRecording') {
        await vscode.commands.executeCommand('devStrava.pauseRecording');
      }

      if (message.command === 'resumeRecording') {
        await vscode.commands.executeCommand('devStrava.resumeRecording');
      }

      if (message.command === 'stopRecording') {
        await vscode.commands.executeCommand('devStrava.stopRecording');
      }

      if (message.command === 'shareSession') {
        await vscode.window.showInformationMessage('DevStrava share cards live in the companion website.');
      }

      if (message.command === 'resetSession') {
        await vscode.commands.executeCommand('devStrava.resetSession');
      }
    });

    this._render();
  }

  _render() {
    if (!this.view) {
      return;
    }

    const state = this.sessionManager.getSnapshot();
    this.view.webview.html = getPanelHtml(state);
  }

  dispose() {
    if (this.changeSubscription) {
      this.changeSubscription.dispose();
    }

    this.view = undefined;
  }
}

function getPanelHtml(state) {
  const nonce = String(Date.now());
  const statusLabel = state.isRecording ? (state.isPaused ? 'Paused' : 'Live') : 'Ready';
  const statusClass = state.isRecording ? (state.isPaused ? 'paused' : 'live') : 'idle';
  const action = getPrimaryAction(state);
  const secondaryAction = getSecondaryAction(state);
  const health = getSessionHealth(state);
  const mistakes = state.telemetry.counters.failedRuns +
    state.telemetry.counters.terminalFailures +
    state.telemetry.counters.testFailures +
    state.telemetry.counters.quickRevisions +
    state.telemetry.counters.repeatedEdits;
  const statPills = [
    ['Time', formatDuration(state.telemetry.timing.activeSeconds || state.elapsedSeconds)],
    ['Edits', state.telemetry.counters.edits],
    ['Terminal', state.telemetry.counters.terminalCommands],
    ['Mistakes', mistakes]
  ].map(([label, value]) => {
    return `<div class="stat"><span class="stat-label">${label}</span><strong class="stat-val">${value}</strong></div>`;
  }).join('');
  const mainScore = Math.max(
    state.scores.scores.hardcore,
    state.scores.scores.vibecoding,
    state.scores.scores.debugging,
    state.scores.scores.rhythm
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DevStrava</title>
  <style>
    :root {
      color-scheme: light dark;
      /* Use panel background tokens so the view truly inherits VS Code's panel chrome */
      --bg: var(--vscode-panel-background, var(--vscode-editor-background, #1e1e1e));
      --text: var(--vscode-foreground, #cccccc);
      --muted: var(--vscode-descriptionForeground, #858585);
      --border: var(--vscode-panel-border, rgba(128,128,128,0.20));
      --input-bg: var(--vscode-input-background, rgba(255,255,255,0.06));
      --btn-bg: var(--vscode-button-background, #0078d4);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #026ec1);
      --cyan: #8be8ff;
      --indigo: #8f9bff;
      --green: #87f5c4;
      --gold: #f6d98c;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family, "Segoe UI", system-ui, sans-serif);
      font-size: var(--vscode-font-size, 12px);
      line-height: 1.4;
      overflow-x: hidden;
      /* Prevent scrollbars on the body itself */
      overflow-y: auto;
    }

    /* ─── Main layout: a compact vertical stack ─── */
    .panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
      min-width: 0;
    }

    /* ─── Header row: brand + status badge ─── */
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mark {
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 6px;
      color: #071014;
      background: linear-gradient(135deg, var(--cyan), var(--indigo));
      font-weight: 800;
      font-size: 11px;
      box-shadow: 0 2px 8px rgba(139, 232, 255, 0.20);
    }

    .brand-name {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.01em;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .state {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 999px;
      font-size: 10px;
      color: var(--muted);
      background: rgba(255,255,255,0.04);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--muted);
      flex-shrink: 0;
    }

    .state.live  .dot { background: var(--green); box-shadow: 0 0 0 3px rgba(135,245,196,0.15); }
    .state.paused .dot { background: var(--gold);  box-shadow: 0 0 0 3px rgba(246,217,140,0.15); }

    /* ─── Persona + score row ─── */
    .persona-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: rgba(255,255,255,0.03);
    }

    .persona-info {
      flex: 1;
      min-width: 0;
    }

    .persona-label {
      font-size: 10px;
      color: var(--muted);
    }

    .persona-name {
      font-size: 12px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .health-label {
      font-size: 10px;
      color: var(--muted);
      text-align: right;
    }

    .health-value {
      font-size: 11px;
      font-weight: 600;
      text-align: right;
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ring {
      --score: ${mainScore};
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background:
        radial-gradient(circle at center, var(--bg) 56%, transparent 57%),
        conic-gradient(var(--cyan) calc(var(--score) * 1%), rgba(255,255,255,0.10) 0);
      font-size: 10px;
      font-weight: 700;
    }

    /* ─── Stats row: 4 pill chips in a single horizontal strip ─── */
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 5px 4px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input-bg);
      min-width: 0;
    }

    .stat-label {
      font-size: 10px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .stat-val {
      font-size: 12px;
      font-weight: 700;
      margin-top: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    /* ─── Action row ─── */
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .primary {
      flex: 1;
      height: 28px;
      border: none;
      border-radius: 6px;
      color: var(--btn-fg);
      background: var(--btn-bg);
      cursor: pointer;
      font: 600 11px var(--vscode-font-family, "Segoe UI", sans-serif);
      letter-spacing: 0.02em;
      transition: background 0.15s ease, filter 0.15s ease;
    }

    .primary:hover  { background: var(--btn-hover); }
    .primary:active { filter: brightness(0.92); transform: translateY(1px); }

    .secondary {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0 10px;
      height: 28px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font: 11px var(--vscode-font-family, "Segoe UI", sans-serif);
      white-space: nowrap;
      transition: color 0.15s ease, border-color 0.15s ease;
    }

    .secondary:hover  { color: var(--text); border-color: rgba(255,255,255,0.25); }
    .secondary:active { transform: translateY(1px); }

    /* ─── Privacy footer ─── */
    .privacy {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: var(--muted);
    }

    .privacy-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--green);
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="panel" role="region" aria-label="DevStrava compact session controls">

    <!-- Header: brand mark + status -->
    <div class="header">
      <div class="mark" aria-hidden="true">D</div>
      <span class="brand-name">DevStrava</span>
      <div class="state ${statusClass}" aria-label="Recording status: ${statusLabel}">
        <span class="dot"></span>
        <span>${statusLabel}</span>
      </div>
    </div>

    <!-- Persona + score ring -->
    <div class="persona-row">
      <div class="persona-info">
        <div class="persona-label">Style</div>
        <div class="persona-name">${escapeHtml(state.scores.archetype.label)}</div>
      </div>
      <div style="text-align:right;min-width:0;">
        <div class="health-label">${escapeHtml(health.caption)}</div>
        <div class="health-value">${escapeHtml(health.label)}</div>
      </div>
      <div class="ring" aria-label="Score ${mainScore}">${mainScore}</div>
    </div>

    <!-- Stats chips -->
    <div class="stats" aria-label="Session stats">
      ${statPills}
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="primary" id="btn-primary" data-command="${action.command}">${action.label}</button>
      <button class="secondary" id="btn-secondary" data-command="${secondaryAction.command}">${secondaryAction.label}</button>
    </div>

    <!-- Privacy notice -->
    <div class="privacy">
      <span class="privacy-dot" aria-hidden="true"></span>
      <span>Private until you share</span>
    </div>

  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ command: btn.dataset.command });
      });
    });
  </script>
</body>
</html>`;
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getPrimaryAction(state) {
  if (!state.isRecording) {
    return {
      label: 'Start',
      command: 'openConsentPrompt'
    };
  }

  if (state.isPaused) {
    return {
      label: 'Resume',
      command: 'resumeRecording'
    };
  }

  return {
    label: 'Pause',
    command: 'pauseRecording'
  };
}

function getSecondaryAction(state) {
  if (state.isRecording) {
    return {
      label: 'Stop',
      command: 'stopRecording'
    };
  }

  return {
    label: 'Share',
    command: 'shareSession'
  };
}

function getSessionHealth(state) {
  const mistakes = state.telemetry.counters.failedRuns +
    state.telemetry.counters.terminalFailures +
    state.telemetry.counters.testFailures;
  const rhythm = state.scores.scores.rhythm;

  if (!state.isRecording) {
    return {
      label: 'Ready to record',
      caption: 'Awaiting consent'
    };
  }

  if (state.isPaused) {
    return {
      label: 'Paused cleanly',
      caption: 'Focus preserved'
    };
  }

  if (mistakes >= 5) {
    return {
      label: 'Debug push',
      caption: 'Recovery mode'
    };
  }

  if (rhythm >= 70) {
    return {
      label: 'Smooth rhythm',
      caption: 'Session health'
    };
  }

  return {
    label: 'In motion',
    caption: 'Session health'
  };
}

function getPersonaInitials(label) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  SessionPanel,
  SESSION_VIEW_ID
};
