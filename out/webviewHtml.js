"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewHtml = getWebviewHtml;
/**
 * Generates the full self-contained HTML for the Sprintly dashboard webview.
 * Uses a nonce-based CSP. No external resources.
 */
function getWebviewHtml(webview, nonce) {
    const csp = [
        `default-src 'none'`,
        `style-src 'nonce-${nonce}'`,
        `script-src 'nonce-${nonce}'`,
        `font-src 'none'`,
        `img-src 'none'`,
    ].join('; ');
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sprintly Dashboard</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: var(--vscode-sideBar-background, #1e1e2e);
      --surface: var(--vscode-editor-background, #181825);
      --surface2: var(--vscode-editorWidget-background, #24243a);
      --border: var(--vscode-panel-border, #313145);
      --text: var(--vscode-foreground, #cdd6f4);
      --text-muted: var(--vscode-descriptionForeground, #6c7086);
      --text-dim: var(--vscode-disabledForeground, #45475a);
      --accent: var(--vscode-focusBorder, #89b4fa);
      --accent-warm: #f38ba8;
      --accent-green: #a6e3a1;
      --accent-yellow: #f9e2af;
      --accent-mauve: #cba6f7;
      --radius: 8px;
      --radius-sm: 5px;
      --shadow: 0 2px 12px rgba(0,0,0,0.35);
      --font: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
      --font-mono: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace);
    }

    html, body {
      width: 100%; height: 100%;
      font-family: var(--font);
      font-size: 13px;
      color: var(--text);
      background: var(--bg);
      overflow-x: hidden;
    }

    body { display: flex; flex-direction: column; min-height: 100vh; }

    /* ── Header ──────────────────────────────────────────────── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px 10px;
      border-bottom: 1px solid var(--border);
    }
    .brand {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .brand-icon { font-size: 15px; }

    .status-pill {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 3px 9px;
      border-radius: 20px;
      border: 1px solid transparent;
      transition: background 0.3s, color 0.3s, border-color 0.3s;
    }
    .status-pill.idle    { background: var(--surface2); color: var(--text-muted); border-color: var(--border); }
    .status-pill.active  { background: rgba(166,227,161,0.15); color: var(--accent-green); border-color: rgba(166,227,161,0.3); }
    .status-pill.paused  { background: rgba(249,226,175,0.15); color: var(--accent-yellow); border-color: rgba(249,226,175,0.3); }

    /* ── Timer block ─────────────────────────────────────────── */
    .timer-block {
      padding: 18px 14px 14px;
      text-align: center;
    }
    .timer {
      font-family: var(--font-mono);
      font-size: 38px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--text);
      line-height: 1;
      transition: color 0.3s;
    }
    .timer.active  { color: var(--accent-green); }
    .timer.paused  { color: var(--accent-yellow); }
    .archetype {
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
      letter-spacing: 0.01em;
    }

    /* ── Stat grid ───────────────────────────────────────────── */
    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      padding: 0 12px 12px;
    }
    .stat-card {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px 10px 9px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-label {
      font-size: 10px;
      color: var(--text-dim);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text);
      line-height: 1;
    }
    .stat-sub {
      font-size: 10px;
      color: var(--text-muted);
    }

    /* ── Divider ─────────────────────────────────────────────── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 0 12px 12px;
    }

    /* ── Action bar ──────────────────────────────────────────── */
    .action-bar {
      padding: 0 12px 14px;
      display: flex;
      gap: 8px;
    }
    .btn {
      flex: 1;
      padding: 8px 10px;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
      letter-spacing: 0.02em;
    }
    .btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .btn:active { transform: scale(0.97); }
    .btn:hover  { opacity: 0.88; }

    .btn-primary {
      background: var(--accent);
      color: #11111b;
    }
    .btn-secondary {
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-danger {
      background: rgba(243,139,168,0.15);
      color: var(--accent-warm);
      border: 1px solid rgba(243,139,168,0.25);
    }

    /* ── Consent card ────────────────────────────────────────── */
    .consent-card {
      margin: 14px 12px;
      padding: 16px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      text-align: center;
    }
    .consent-emoji { font-size: 28px; display: block; margin-bottom: 10px; }
    .consent-title {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .consent-body {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 14px;
    }

    /* ── Reset confirm ───────────────────────────────────────── */
    .confirm-bar {
      padding: 0 12px 14px;
      display: none;
      gap: 8px;
    }
    .confirm-bar.visible { display: flex; }
    .confirm-label {
      font-size: 11px;
      color: var(--accent-warm);
      padding: 8px 4px;
      flex: 1;
    }

    /* ── Footer ──────────────────────────────────────────────── */
    .footer {
      margin-top: auto;
      padding: 10px 14px;
      border-top: 1px solid var(--border);
      font-size: 10px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-link {
      color: var(--text-dim);
      cursor: pointer;
      text-decoration: none;
      background: none;
      border: none;
      font-size: 10px;
      padding: 0;
    }
    .footer-link:hover { color: var(--accent); }
    .footer-link:focus-visible { outline: 1px solid var(--accent); border-radius: 2px; }

    /* ── Hidden utility ──────────────────────────────────────── */
    .hidden { display: none !important; }
  </style>
</head>
<body>

  <!-- Header -->
  <header class="header">
    <div class="brand">
      <span class="brand-icon">🏃</span>
      Sprintly
    </div>
    <span id="statusPill" class="status-pill idle">Idle</span>
  </header>

  <!-- ── IDLE / CONSENT SCREEN ─────────────────────────────────── -->
  <div id="consentView">
    <div class="consent-card">
      <span class="consent-emoji">🏁</span>
      <div class="consent-title">Ready to sprint?</div>
      <div class="consent-body">
        Sprintly tracks your coding session — edits, saves, file switches,
        and terminal activity — only while you're recording.<br>
        Nothing runs silently. You're always in control.
      </div>
      <div class="action-bar" style="padding:0;">
        <button id="btnConsentStart" class="btn btn-primary">Start Recording</button>
      </div>
    </div>
  </div>

  <!-- ── ACTIVE SESSION SCREEN ─────────────────────────────────── -->
  <div id="sessionView" class="hidden">

    <!-- Timer + archetype -->
    <div class="timer-block">
      <div id="timer" class="timer">00:00</div>
      <div id="archetype" class="archetype">🌱 Just warming up</div>
    </div>

    <!-- Stat grid -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Edits</div>
        <div id="statEdits" class="stat-value">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Saves</div>
        <div id="statSaves" class="stat-value">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Lines</div>
        <div id="statLines" class="stat-value">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Files</div>
        <div id="statFiles" class="stat-value">0</div>
        <div id="statSwitches" class="stat-sub">0 switches</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Terminal</div>
        <div id="statTerminal" class="stat-value">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Session</div>
        <div id="statDuration" class="stat-value" style="font-size:13px;line-height:1.4">—</div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Actions -->
    <div class="action-bar" id="actionBar">
      <button id="btnPrimary" class="btn btn-primary">Pause</button>
      <button id="btnStop"    class="btn btn-secondary">Stop</button>
      <button id="btnReset"   class="btn btn-danger">Reset</button>
    </div>

    <!-- Reset confirmation -->
    <div class="confirm-bar" id="confirmBar">
      <span class="confirm-label">⚠ Clear all stats?</span>
      <button id="btnConfirmReset"  class="btn btn-danger"     style="flex:0;padding:8px 14px">Yes, reset</button>
      <button id="btnCancelReset"   class="btn btn-secondary"  style="flex:0;padding:8px 14px">Cancel</button>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer">
    <span>Sprintly · consent-first</span>
    <button class="footer-link" id="btnSettings">Settings</button>
  </footer>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── DOM refs ────────────────────────────────────────────────
    const statusPill    = document.getElementById('statusPill');
    const consentView   = document.getElementById('consentView');
    const sessionView   = document.getElementById('sessionView');
    const timer         = document.getElementById('timer');
    const archetype     = document.getElementById('archetype');
    const statEdits     = document.getElementById('statEdits');
    const statSaves     = document.getElementById('statSaves');
    const statLines     = document.getElementById('statLines');
    const statFiles     = document.getElementById('statFiles');
    const statSwitches  = document.getElementById('statSwitches');
    const statTerminal  = document.getElementById('statTerminal');
    const statDuration  = document.getElementById('statDuration');
    const btnPrimary    = document.getElementById('btnPrimary');
    const btnStop       = document.getElementById('btnStop');
    const btnReset      = document.getElementById('btnReset');
    const confirmBar    = document.getElementById('confirmBar');
    const actionBar     = document.getElementById('actionBar');
    const btnSettings   = document.getElementById('btnSettings');
    const btnConsentStart = document.getElementById('btnConsentStart');
    const btnConfirmReset = document.getElementById('btnConfirmReset');
    const btnCancelReset  = document.getElementById('btnCancelReset');

    // ── Escape helper (prevents HTML injection) ──────────────────
    function esc(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // ── Format seconds → MM:SS / H:MM:SS ────────────────────────
    function fmtTimer(sec) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const mm = String(m).padStart(2, '0');
      const ss = String(s).padStart(2, '0');
      return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
    }

    // ── Render state ─────────────────────────────────────────────
    function render(state) {
      if (!state.isRecording) {
        // Show consent / idle view
        consentView.classList.remove('hidden');
        sessionView.classList.add('hidden');

        statusPill.textContent = 'Idle';
        statusPill.className = 'status-pill idle';
        return;
      }

      // Show session view
      consentView.classList.add('hidden');
      sessionView.classList.remove('hidden');

      // Status pill
      if (state.isPaused) {
        statusPill.textContent = 'Paused';
        statusPill.className = 'status-pill paused';
        timer.className = 'timer paused';
      } else {
        statusPill.textContent = 'Recording';
        statusPill.className = 'status-pill active';
        timer.className = 'timer active';
      }

      // Timer + archetype
      timer.textContent = fmtTimer(state.durationSeconds);
      archetype.textContent = esc(state.archetype);

      // Stats
      statEdits.textContent     = state.fileEdits;
      statSaves.textContent     = state.fileSaves;
      statLines.textContent     = state.linesChanged;
      statFiles.textContent     = state.activeFilesCount;
      statSwitches.textContent  = state.fileSwitches + ' switches';
      statTerminal.textContent  = state.terminalCommands;
      statDuration.textContent  = esc(state.formattedDuration);

      // Primary action
      btnPrimary.textContent = state.isPaused ? 'Resume' : 'Pause';
    }

    // ── Button actions ───────────────────────────────────────────
    btnConsentStart.addEventListener('click', () => {
      vscode.postMessage({ type: 'start' });
    });

    btnPrimary.addEventListener('click', () => {
      const label = btnPrimary.textContent.trim();
      vscode.postMessage({ type: label === 'Resume' ? 'resume' : 'pause' });
    });

    btnStop.addEventListener('click', () => {
      vscode.postMessage({ type: 'stop' });
    });

    btnReset.addEventListener('click', () => {
      actionBar.style.display = 'none';
      confirmBar.classList.add('visible');
    });

    btnConfirmReset.addEventListener('click', () => {
      confirmBar.classList.remove('visible');
      actionBar.style.display = '';
      vscode.postMessage({ type: 'reset' });
    });

    btnCancelReset.addEventListener('click', () => {
      confirmBar.classList.remove('visible');
      actionBar.style.display = '';
    });

    btnSettings.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    // ── Message bridge ───────────────────────────────────────────
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'stateUpdate') {
        render(msg.state);
      }
    });

    // ── Signal ready ─────────────────────────────────────────────
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
//# sourceMappingURL=webviewHtml.js.map