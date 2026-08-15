const vscode = require('vscode');

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEW_ID = 'sprintly.sessionStatsView';

// ─── SessionStatsViewProvider ─────────────────────────────────────────────────

/**
 * Implements the WebviewViewProvider API so the session stats panel renders
 * inside VS Code's bottom panel (Terminal / Output / Problems area) rather
 * than as an editor tab.
 *
 * Registration in extension.js:
 *   vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {...})
 *
 * VS Code auto-generates the focus command:
 *   `sprintly.sessionStatsView.focus`
 */
class SessionStatsViewProvider {
  /**
   * @param {vscode.Uri} extensionUri
   * @param {import('../session/sessionManager').SessionManager} sessionManager
   */
  constructor(extensionUri, sessionManager) {
    this.extensionUri = extensionUri;
    this.sessionManager = sessionManager;

    /** @type {vscode.WebviewView | undefined} */
    this._view = undefined;

    // Re-render whenever session state changes
    this._changeSubscription = this.sessionManager.onDidChange(() => {
      this._render();
    });
  }

  // ── WebviewViewProvider interface ────────────────────────────────────────────

  /**
   * Called by VS Code the first time this view is revealed (and after each
   * deserialisation if retainContextWhenHidden is false).
   *
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true
    };

    // Re-render whenever the view becomes visible again
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._render();
      }
    });

    // Clean up the reference if the view is disposed
    webviewView.onDidDispose(() => {
      this._view = undefined;
    });

    this._wireMessages();
    this._render();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Focus the bottom panel and reveal this view.
   * Called by the status bar icon click (sprintly.toggleStats).
   */
  show() {
    this.sessionManager.notePanelShown();
    vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  dispose() {
    if (this._changeSubscription) {
      this._changeSubscription.dispose();
    }
    // _view is owned by VS Code; we do not dispose it ourselves
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _wireMessages() {
    if (!this._view) return;

    this._view.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'closePanel':
          // Collapse the bottom panel entirely
          await vscode.commands.executeCommand('workbench.action.closePanel');
          break;

        case 'openConsentPrompt':
          await vscode.commands.executeCommand('sprintly.showConsentPrompt');
          break;

        case 'pauseRecording':
          await vscode.commands.executeCommand('sprintly.pauseRecording');
          break;

        case 'resumeRecording':
          await vscode.commands.executeCommand('sprintly.resumeRecording');
          break;

        case 'stopRecording':
          await vscode.commands.executeCommand('sprintly.stopRecording');
          break;

        case 'resetSession':
          await vscode.commands.executeCommand('sprintly.resetSession');
          break;

        case 'openHistory':
          vscode.env.openExternal(vscode.Uri.parse('https://sprintly.app'));
          break;

        default:
          break;
      }
    });
  }

  _render() {
    if (!this._view || !this._view.visible) return;
    const state = this.sessionManager.getSnapshot();
    this._view.webview.html = getPopupHtml(state);
  }
}

// ─── HTML generation ──────────────────────────────────────────────────────────

function getPopupHtml(state) {
  const nonce = String(Date.now());
  const statusLabel = state.isRecording
    ? state.isPaused ? 'Paused' : 'Live'
    : 'Idle';
  const statusClass = state.isRecording
    ? state.isPaused ? 'paused' : 'live'
    : 'idle';

  const action = getPrimaryAction(state);
  const secondaryAction = getSecondaryAction(state);
  const health = getSessionHealth(state);
  const mistakes =
    state.telemetry.counters.failedRuns +
    state.telemetry.counters.terminalFailures +
    state.telemetry.counters.testFailures +
    state.telemetry.counters.quickRevisions +
    state.telemetry.counters.repeatedEdits;

  const statPills = [
    ['Time', formatDuration(state.telemetry.timing.activeSeconds || state.elapsedSeconds)],
    ['Edits', state.telemetry.counters.edits],
    ['Terminal', state.telemetry.counters.terminalCommands],
    ['Mistakes', mistakes]
  ].map(([label, value]) =>
    `<div class="stat"><span class="stat-label">${label}</span><strong class="stat-val">${value}</strong></div>`
  ).join('');

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
  <title>Sprintly</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Tokens ── */
    :root {
      --cyan:   #8be8ff;
      --indigo: #8f9bff;
      --green:  #87f5c4;
      --gold:   #f6d98c;
      --rose:   #ff7eb3;

      --bg-base:    #0d1117;
      --bg-card:    rgba(22, 27, 34, 0.92);
      --bg-chip:    rgba(255, 255, 255, 0.05);
      --border:     rgba(255, 255, 255, 0.08);
      --border-hi:  rgba(255, 255, 255, 0.18);
      --text:       #e6edf3;
      --muted:      #7d8590;

      --btn-bg:     #1f6feb;
      --btn-hover:  #388bfd;
      --btn-active: #1158c7;
      --btn-fg:     #ffffff;

      --shadow-card: 0 24px 64px rgba(0, 0, 0, 0.72), 0 4px 16px rgba(0, 0, 0, 0.4);
      --shadow-glow: 0 0 0 1px rgba(139, 232, 255, 0.12);

      --radius-card: 14px;
      --radius-chip: 8px;
      --radius-pill: 999px;
    }

    /* ── Page shell — fills the webview frame, centres the card ── */
    html, body {
      height: 100%;
      background: var(--bg-base);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 20px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 12px;
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Floating card ── */
    .card {
      width: 100%;
      max-width: 320px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-card), var(--shadow-glow);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 0;
      animation: popIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    @keyframes popIn {
      from { opacity: 0; transform: scale(0.94) translateY(-6px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* ── Inner padding wrapper ── */
    .inner {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 14px 12px;
    }

    /* ── Header: logo · brand · status · close ── */
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .logo {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      border-radius: 7px;
      background: linear-gradient(135deg, var(--cyan) 0%, var(--indigo) 100%);
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 11px;
      color: #07101a;
      box-shadow: 0 2px 8px rgba(139, 232, 255, 0.30);
      letter-spacing: -0.5px;
    }

    .brand {
      flex: 1;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.01em;
      color: var(--text);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px 2px 6px;
      border: 1px solid var(--border);
      border-radius: var(--radius-pill);
      font-size: 10px;
      color: var(--muted);
      background: var(--bg-chip);
      white-space: nowrap;
      transition: border-color 0.2s;
    }
    .status-badge.live   { border-color: rgba(135, 245, 196, 0.30); color: var(--green); }
    .status-badge.paused { border-color: rgba(246, 217, 140, 0.30); color: var(--gold);  }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }
    .status-badge.live   .dot { box-shadow: 0 0 0 3px rgba(135, 245, 196, 0.18); animation: pulse 2s infinite; }
    .status-badge.paused .dot { box-shadow: 0 0 0 3px rgba(246, 217, 140, 0.18); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.5; }
    }

    .close-btn {
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      display: grid;
      place-items: center;
      font-size: 14px;
      line-height: 1;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
    }
    .close-btn:hover  { background: rgba(255,255,255,0.08); color: var(--text); }
    .close-btn:active { background: rgba(255,255,255,0.04); }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 0 14px;
    }

    /* ── Persona / health row ── */
    .persona-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-chip);
      background: var(--bg-chip);
    }

    .persona-info { flex: 1; min-width: 0; }
    .persona-label { font-size: 10px; color: var(--muted); margin-bottom: 1px; }
    .persona-name {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .health-col { text-align: right; min-width: 0; flex-shrink: 0; }
    .health-caption { font-size: 10px; color: var(--muted); margin-bottom: 1px; }
    .health-label {
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 90px;
    }

    .score-ring {
      --pct: ${mainScore};
      width: 38px;
      height: 38px;
      flex-shrink: 0;
      border-radius: 50%;
      background:
        radial-gradient(circle at center, var(--bg-base) 52%, transparent 53%),
        conic-gradient(var(--cyan) calc(var(--pct) * 1%), rgba(255,255,255,0.08) 0);
      display: grid;
      place-items: center;
      font-size: 10px;
      font-weight: 800;
      color: var(--cyan);
    }

    /* ── Stats row ── */
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 6px 4px 5px;
      border: 1px solid var(--border);
      border-radius: var(--radius-chip);
      background: var(--bg-chip);
      gap: 2px;
      transition: border-color 0.15s;
    }
    .stat:hover { border-color: var(--border-hi); }

    .stat-label {
      font-size: 9px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .stat-val {
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }

    /* ── Actions ── */
    .actions {
      display: flex;
      gap: 7px;
    }

    .btn-primary {
      flex: 1;
      height: 30px;
      border: none;
      border-radius: 8px;
      background: var(--btn-bg);
      color: var(--btn-fg);
      font: 600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .btn-primary:hover  { background: var(--btn-hover); }
    .btn-primary:active { background: var(--btn-active); transform: translateY(1px); }

    .btn-secondary {
      height: 30px;
      padding: 0 11px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s, transform 0.1s;
    }
    .btn-secondary:hover  { color: var(--text); border-color: var(--border-hi); }
    .btn-secondary:active { transform: translateY(1px); }

    /* ── Footer ── */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

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
      box-shadow: 0 0 4px rgba(135, 245, 196, 0.5);
    }

    .history-link {
      font-size: 10px;
      color: var(--muted);
      text-decoration: none;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      transition: color 0.15s;
    }
    .history-link:hover { color: var(--cyan); }
  </style>
</head>
<body>
  <div class="card" role="dialog" aria-label="Sprintly session controls">

    <div class="inner">

      <!-- Header -->
      <div class="header">
        <div class="logo" aria-hidden="true">SP</div>
        <span class="brand">Sprintly</span>
        <div class="status-badge ${statusClass}" aria-label="Status: ${statusLabel}">
          <span class="dot"></span>
          <span>${statusLabel}</span>
        </div>
        <button class="close-btn" id="btn-close" aria-label="Close panel" title="Close (Esc)">✕</button>
      </div>

      <!-- Persona + score ring -->
      <div class="persona-row">
        <div class="persona-info">
          <div class="persona-label">Style</div>
          <div class="persona-name">${escapeHtml(state.scores.archetype.label)}</div>
        </div>
        <div class="health-col">
          <div class="health-caption">${escapeHtml(health.caption)}</div>
          <div class="health-label">${escapeHtml(health.label)}</div>
        </div>
        <div class="score-ring" aria-label="Score ${mainScore}">${mainScore}</div>
      </div>

      <!-- Stats chips -->
      <div class="stats" aria-label="Session stats">
        ${statPills}
      </div>

      <!-- Actions -->
      <div class="actions">
        <button class="btn-primary" id="btn-primary" data-command="${action.command}">${action.label}</button>
        <button class="btn-secondary" id="btn-secondary" data-command="${secondaryAction.command}">${secondaryAction.label}</button>
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="privacy">
          <span class="privacy-dot" aria-hidden="true"></span>
          <span>Private until you share</span>
        </div>
        <button class="history-link" id="btn-history" data-command="openHistory">View history ↗</button>
      </div>

    </div><!-- /.inner -->
  </div><!-- /.card -->

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Button click handlers
    document.querySelectorAll('[data-command]').forEach(function(el) {
      el.addEventListener('click', function() {
        vscode.postMessage({ command: el.dataset.command });
      });
    });

    // Close button
    document.getElementById('btn-close').addEventListener('click', function() {
      vscode.postMessage({ command: 'closePanel' });
    });

    // Escape key dismisses the panel
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        vscode.postMessage({ command: 'closePanel' });
      }
    });
  </script>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0)   return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getPrimaryAction(state) {
  if (!state.isRecording) return { label: 'Start Recording', command: 'openConsentPrompt' };
  if (state.isPaused)     return { label: 'Resume', command: 'resumeRecording' };
  return { label: 'Pause', command: 'pauseRecording' };
}

function getSecondaryAction(state) {
  if (state.isRecording) return { label: 'Stop', command: 'stopRecording' };
  return { label: 'Reset', command: 'resetSession' };
}

function getSessionHealth(state) {
  const mistakes =
    state.telemetry.counters.failedRuns +
    state.telemetry.counters.terminalFailures +
    state.telemetry.counters.testFailures;
  const rhythm = state.scores.scores.rhythm;

  if (!state.isRecording) return { label: 'Ready to record', caption: 'Awaiting consent' };
  if (state.isPaused)     return { label: 'Paused cleanly',   caption: 'Focus preserved' };
  if (mistakes >= 5)      return { label: 'Debug push',       caption: 'Recovery mode'   };
  if (rhythm >= 70)       return { label: 'Smooth rhythm',    caption: 'Session health'  };
  return { label: 'In motion', caption: 'Session health' };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { SessionStatsViewProvider };
