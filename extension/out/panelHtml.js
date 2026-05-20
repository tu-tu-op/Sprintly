"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPanelHtml = getPanelHtml;
function getPanelHtml(webview) {
    const nonce = Math.random().toString(36).slice(2);
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 0;
    user-select: none;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    padding: 0 12px;
    gap: 2px;
  }
  .tab {
    padding: 8px 12px 7px;
    font-size: 12px;
    cursor: pointer;
    color: var(--vscode-foreground);
    opacity: 0.7;
    border-bottom: 2px solid transparent;
    background: none;
    border-top: none; border-left: none; border-right: none;
    outline: none;
    font-family: inherit;
    transition: opacity 0.1s;
  }
  .tab:hover { opacity: 1; }
  .tab.active {
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder, #007fd4);
  }
  .panel { display: none; padding: 12px; }
  .panel.active { display: block; }
  .idle-card {
    background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-input-background));
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 4px;
    padding: 16px;
    text-align: center;
    margin-bottom: 12px;
  }
  .idle-card .idle-icon { font-size: 28px; display: block; margin-bottom: 6px; }
  .idle-card .idle-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .idle-card .idle-sub { font-size: 11px; opacity: 0.6; }
  .stat-card {
    background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-input-background));
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .stat-label { font-size: 11px; font-weight: 600; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.04em; }
  .stat-value { font-size: 22px; font-weight: 300; line-height: 1.1; }
  .stat-detail { font-size: 11px; opacity: 0.6; margin-top: 2px; }
  .bar-track { height: 3px; border-radius: 2px; background: var(--vscode-progressBar-background, #007fd4); opacity: 0.25; margin-top: 6px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 2px; background: var(--vscode-progressBar-background, #007fd4); opacity: 4; transition: width 0.8s ease; }
  .archetype { font-size: 12px; font-weight: 500; margin-bottom: 10px; padding: 5px 8px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); display: inline-block; }
  .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--vscode-panel-border, transparent); font-size: 12px; }
  .stat-row:last-child { border-bottom: none; }
  .stat-row-label { opacity: 0.65; }
  .stat-row-value { font-weight: 500; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; vertical-align: middle; }
  .dot-recording { background: #3fb950; animation: pulse 1.6s ease-in-out infinite; }
  .dot-paused    { background: #e3b341; }
  .dot-idle      { background: var(--vscode-foreground); opacity: 0.3; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .btn-row { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .btn { flex: 1; min-width: 0; padding: 5px 10px; font-size: 12px; font-family: inherit; border-radius: 3px; cursor: pointer; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); white-space: nowrap; text-overflow: ellipsis; overflow: hidden; transition: background 0.1s; }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-danger { border-color: var(--vscode-inputValidation-errorBorder, #f44747); }
  .setting-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border, transparent); font-size: 12px; }
  .setting-row:last-child { border-bottom: none; }
  .setting-label { opacity: 0.8; }
  .toggle { position: relative; display: inline-block; width: 28px; height: 16px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; inset: 0; cursor: pointer; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 8px; transition: background 0.2s; }
  .toggle-slider::before { content: ''; position: absolute; width: 10px; height: 10px; left: 2px; top: 2px; border-radius: 50%; background: var(--vscode-foreground); opacity: 0.5; transition: transform 0.2s, opacity 0.2s; }
  .toggle input:checked + .toggle-slider { background: var(--vscode-button-background); border-color: transparent; }
  .toggle input:checked + .toggle-slider::before { transform: translateX(12px); opacity: 1; background: var(--vscode-button-foreground); }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.5; margin: 12px 0 6px; }
  .section-title:first-child { margin-top: 0; }
</style>
</head>
<body>
<nav class="tabs">
  <button class="tab active" data-tab="session">Session</button>
  <button class="tab" data-tab="settings">Settings</button>
</nav>
<div id="panel-session" class="panel active">
  <div id="view-idle">
    <div class="idle-card">
      <span class="idle-icon">&#x1F3C3;</span>
      <div class="idle-title">No active session</div>
      <div class="idle-sub">Start recording to track your coding activity</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="btn-start">&#x25B6; Start Session</button>
    </div>
  </div>
  <div id="view-recording" style="display:none">
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
      <span class="status-dot dot-recording" id="status-dot"></span>
      <span id="status-text" style="font-size:12px; opacity:0.7">Recording</span>
      <span class="archetype" id="archetype-badge">&#x1F331; Just warming up</span>
    </div>
    <div class="stat-card">
      <div class="stat-label">Duration</div>
      <div class="stat-value" id="stat-duration">00:00</div>
      <div class="stat-detail" id="stat-started">Started just now</div>
      <div class="bar-track"><div class="bar-fill" id="bar-duration" style="width:5%"></div></div>
    </div>
    <div class="stat-card">
      <div class="stat-row"><span class="stat-row-label">&#x270F;&#xFE0F; File edits</span><span class="stat-row-value" id="stat-edits">0</span></div>
      <div class="stat-row"><span class="stat-row-label">&#x1F4C4; Lines changed</span><span class="stat-row-value" id="stat-lines">0</span></div>
      <div class="stat-row"><span class="stat-row-label">&#x1F4BE; Saves</span><span class="stat-row-value" id="stat-saves">0</span></div>
      <div class="stat-row"><span class="stat-row-label">&#x1F4C1; Files touched</span><span class="stat-row-value" id="stat-files">0</span></div>
      <div class="stat-row"><span class="stat-row-label">&#x1F500; File switches</span><span class="stat-row-value" id="stat-switches">0</span></div>
      <div class="stat-row"><span class="stat-row-label">&#x2B1B; Terminal events</span><span class="stat-row-value" id="stat-terminal">0</span></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="btn-pause">&#x23F8; Pause</button>
      <button class="btn" id="btn-stop">&#x23F9; Stop</button>
      <button class="btn btn-danger" id="btn-reset">&#x21BA; Reset</button>
    </div>
  </div>
</div>
<div id="panel-settings" class="panel">
  <div class="section-title">Tracking</div>
  <div class="setting-row"><span class="setting-label">Track file edits</span><label class="toggle"><input type="checkbox" checked id="tog-edits"><span class="toggle-slider"></span></label></div>
  <div class="setting-row"><span class="setting-label">Track terminal activity</span><label class="toggle"><input type="checkbox" checked id="tog-terminal"><span class="toggle-slider"></span></label></div>
  <div class="setting-row"><span class="setting-label">Show archetype badge</span><label class="toggle"><input type="checkbox" checked id="tog-archetype"><span class="toggle-slider"></span></label></div>
  <div class="section-title" style="margin-top:16px">Session</div>
  <div class="setting-row"><span class="setting-label">Auto-prompt on startup</span><label class="toggle"><input type="checkbox" checked id="tog-autoprompt"><span class="toggle-slider"></span></label></div>
  <div class="btn-row" style="margin-top:14px"><button class="btn" id="btn-open-settings">Open full settings &#x2197;</button></div>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });
  document.getElementById('btn-start').addEventListener('click', () => vscode.postMessage({ command: 'start' }));
  document.getElementById('btn-pause').addEventListener('click', () => vscode.postMessage({ command: isPaused ? 'resume' : 'pause' }));
  document.getElementById('btn-stop').addEventListener('click', () => vscode.postMessage({ command: 'stop' }));
  document.getElementById('btn-reset').addEventListener('click', () => vscode.postMessage({ command: 'reset' }));
  document.getElementById('btn-open-settings').addEventListener('click', () => vscode.postMessage({ command: 'openSettings' }));
  let isPaused = false;
  function formatDur(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return (h > 0 ? h + ':' : '') + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
  window.addEventListener('message', ({ data }) => {
    if (data.type !== 'update') return;
    const s = data.stats;
    isPaused = s.isPaused;
    if (!s.isRecording) {
      document.getElementById('view-idle').style.display = '';
      document.getElementById('view-recording').style.display = 'none';
      return;
    }
    document.getElementById('view-idle').style.display = 'none';
    document.getElementById('view-recording').style.display = '';
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (s.isPaused) {
      dot.className = 'status-dot dot-paused';
      txt.textContent = 'Paused';
      document.getElementById('btn-pause').textContent = '\u25B6 Resume';
    } else {
      dot.className = 'status-dot dot-recording';
      txt.textContent = 'Recording';
      document.getElementById('btn-pause').textContent = '\u23F8 Pause';
    }
    document.getElementById('stat-duration').textContent = formatDur(s.durationSeconds);
    const barPct = Math.min(Math.floor(s.durationSeconds / 60) * 2, 100);
    document.getElementById('bar-duration').style.width = Math.max(barPct, 3) + '%';
    if (s.startedAt) {
      const started = new Date(s.startedAt);
      document.getElementById('stat-started').textContent = 'Started at ' + started.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    }
    document.getElementById('stat-edits').textContent    = s.fileEdits;
    document.getElementById('stat-lines').textContent    = s.linesChanged;
    document.getElementById('stat-saves').textContent    = s.fileSaves;
    document.getElementById('stat-files').textContent    = s.activeFilesCount;
    document.getElementById('stat-switches').textContent = s.fileSwitches;
    document.getElementById('stat-terminal').textContent = s.terminalCommands;
    document.getElementById('archetype-badge').textContent = s.archetype;
  });
</script>
</body>
</html>`;
}
//# sourceMappingURL=panelHtml.js.map