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

    if (this.view) {
      this.view.show(true);
      this._render();
      return;
    }

    vscode.commands.executeCommand(`${SESSION_VIEW_ID}.focus`);
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
  const statRows = [
    ['Time', formatDuration(state.telemetry.timing.activeSeconds || state.elapsedSeconds)],
    ['Edits', state.telemetry.counters.edits],
    ['Terminal', state.telemetry.counters.terminalCommands],
    ['Mistakes', mistakes]
  ].map(([label, value]) => {
    return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
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
      --bg: var(--vscode-sideBar-background, #111318);
      --text: var(--vscode-foreground, #eef3f7);
      --muted: var(--vscode-descriptionForeground, #99a6b5);
      --border: rgba(185, 205, 230, 0.14);
      --glass: rgba(30, 36, 46, 0.72);
      --glass-top: rgba(255, 255, 255, 0.08);
      --cyan: #8be8ff;
      --indigo: #8f9bff;
      --green: #87f5c4;
      --gold: #f6d98c;
      --shadow: 0 14px 32px rgba(0, 0, 0, 0.26);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 10px;
      color: var(--text);
      background:
        linear-gradient(145deg, rgba(143, 155, 255, 0.08), transparent 42%),
        var(--bg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      font-size: var(--vscode-font-size, 13px);
    }

    .widget {
      display: grid;
      gap: 10px;
      max-width: 300px;
      margin: 0 auto;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background:
        linear-gradient(180deg, var(--glass-top), rgba(255, 255, 255, 0.025)),
        var(--glass);
      box-shadow: var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.10);
      backdrop-filter: blur(16px) saturate(130%);
    }

    .top,
    .brand,
    .state,
    .summary-top,
    .privacy,
    .actions {
      display: flex;
      align-items: center;
    }

    .top,
    .summary-top,
    .actions {
      justify-content: space-between;
      gap: 10px;
    }

    .brand {
      gap: 8px;
      min-width: 0;
    }

    .mark {
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 8px;
      color: #071014;
      background: linear-gradient(135deg, var(--cyan), var(--indigo));
      font-weight: 800;
      box-shadow: 0 7px 18px rgba(139, 232, 255, 0.14);
    }

    .brand strong,
    .persona strong,
    .health strong,
    .stat strong {
      display: block;
    }

    .brand strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.1;
      font-size: 13px;
    }

    .brand span,
    .state,
    .persona span,
    .health span,
    .privacy,
    .secondary,
    .stat span {
      color: var(--muted);
      font-size: 11px;
    }

    .state {
      gap: 6px;
      padding: 4px 8px;
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.045);
      white-space: nowrap;
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--muted);
    }

    .state.live .dot {
      background: var(--green);
      box-shadow: 0 0 0 4px rgba(135, 245, 196, 0.10);
    }

    .state.paused .dot {
      background: var(--gold);
      box-shadow: 0 0 0 4px rgba(246, 217, 140, 0.10);
    }

    .summary {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 14px;
      background:
        linear-gradient(135deg, rgba(139, 232, 255, 0.11), transparent 48%),
        rgba(255, 255, 255, 0.045);
    }

    .persona {
      min-width: 0;
    }

    .persona strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 178px;
      font-size: 18px;
      line-height: 1.15;
    }

    .badge {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 12px;
      color: #071014;
      background: linear-gradient(145deg, #d9fbff, #a8afff);
      font-weight: 800;
    }

    .health {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      gap: 10px;
    }

    .health strong {
      margin-top: 3px;
      font-size: 15px;
      line-height: 1.1;
    }

    .ring {
      --score: ${mainScore};
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background:
        radial-gradient(circle at center, #141922 58%, transparent 59%),
        conic-gradient(var(--cyan) calc(var(--score) * 1%), rgba(255, 255, 255, 0.12) 0);
      font-size: 11px;
      font-weight: 750;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .stat {
      min-width: 0;
      padding: 7px 8px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.035);
    }

    .stat strong {
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }

    .privacy {
      gap: 6px;
      padding: 1px 2px;
    }

    .privacy-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--green);
    }

    button {
      font: inherit;
    }

    .primary {
      height: 32px;
      min-width: 118px;
      border: 0;
      border-radius: 10px;
      color: #071014;
      background: linear-gradient(135deg, var(--cyan), var(--indigo));
      cursor: pointer;
      font-weight: 750;
      box-shadow: 0 9px 19px rgba(139, 232, 255, 0.14);
    }

    .secondary {
      border: 0;
      padding: 5px 1px;
      background: transparent;
      cursor: pointer;
    }

    .primary:hover,
    .secondary:hover {
      filter: brightness(1.08);
    }

    .primary:active,
    .secondary:active {
      transform: translateY(1px);
    }
  </style>
</head>
<body>
  <main class="widget" aria-label="DevStrava compact session controls">
    <section class="top">
      <div class="brand">
        <div class="mark">D</div>
        <div>
          <strong>DevStrava</strong>
          <span>Control panel</span>
        </div>
      </div>
      <div class="state ${statusClass}">
        <span class="dot"></span>
        <span>${statusLabel}</span>
      </div>
    </section>

    <section class="summary">
      <div class="summary-top">
        <div class="persona">
          <span>Current style</span>
          <strong>${escapeHtml(state.scores.archetype.label)}</strong>
        </div>
        <div class="badge">${getPersonaInitials(state.scores.archetype.label)}</div>
      </div>
      <div class="health">
        <div>
          <span>${escapeHtml(health.caption)}</span>
          <strong>${escapeHtml(health.label)}</strong>
        </div>
        <div class="ring">${mainScore}</div>
      </div>
    </section>

    <section class="stats" aria-label="Essential session stats">
      ${statRows}
    </section>

    <div class="privacy">
      <span class="privacy-dot"></span>
      <span>Private until you share</span>
    </div>

    <section class="actions">
      <button class="primary" data-command="${action.command}">${action.label}</button>
      <button class="secondary" data-command="${secondaryAction.command}">${secondaryAction.label}</button>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        vscode.postMessage({ command: button.dataset.command });
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
