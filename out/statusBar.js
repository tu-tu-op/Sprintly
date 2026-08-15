"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintlyStatusBar = void 0;
exports.updateTooltip = updateTooltip;
exports.makeProgressBar = makeProgressBar;
exports.startLiveUpdates = startLiveUpdates;
const vscode = require("vscode");
class SprintlyStatusBar {
    constructor(tracker, context) {
        this.tracker = tracker;
        this.ticker = null;
        this.item = vscode.window.createStatusBarItem('sprintly.statusbar', vscode.StatusBarAlignment.Left, 100);
        this.item.name = 'Sprintly';
        this.item.command = 'sprintly.showStatusPanel';
        this.item.show();
        context.subscriptions.push(this.item);
        // Initial render
        this.update();
        // Live updates: hook into tracker events (fires every second while recording)
        startLiveUpdates(context, this.item, tracker);
    }
    // ─── Public API ──────────────────────────────────────────────────────────────
    update() {
        const s = this.tracker.get();
        if (!s.isRecording) {
            this._stopTicker();
            this.item.text = '$(circle-outline) Sprintly';
            this.item.backgroundColor = undefined;
            this.item.color = undefined;
        }
        else if (s.isPaused) {
            this._stopTicker();
            const [m, sec] = formatDuration(s.durationSeconds);
            this.item.text = `$(debug-pause) Sprintly ${m}:${sec}`;
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.item.color = undefined;
        }
        else {
            this._startTicker();
        }
        updateTooltip(this.item, this.tracker);
    }
    // ─── Private helpers ─────────────────────────────────────────────────────────
    _startTicker() {
        if (this.ticker) {
            return;
        }
        this.ticker = setInterval(() => {
            try {
                const s = this.tracker.get();
                const [m, sec] = formatDuration(s.durationSeconds);
                this.item.text = `$(pulse) Sprintly ${m}:${sec}`;
                this.item.backgroundColor = undefined;
                this.item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
                updateTooltip(this.item, this.tracker);
            }
            catch {
                this.item.text = '$(pulse) —';
            }
        }, 1000);
    }
    _stopTicker() {
        if (this.ticker) {
            clearInterval(this.ticker);
            this.ticker = null;
        }
    }
    dispose() { this._stopTicker(); this.item.dispose(); }
}
exports.SprintlyStatusBar = SprintlyStatusBar;
// ─── Named top-level functions (spec §6) ─────────────────────────────────────
/** Update the status bar item's rich MarkdownString tooltip. */
function updateTooltip(item, tracker) {
    const s = tracker.get();
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.appendMarkdown('### $(pulse) Sprintly\n\n---\n\n');
    if (!s.isRecording) {
        md.appendMarkdown('$(circle-outline) **No active session**\n\n');
        md.appendMarkdown('Start a session to begin tracking.\n\n');
    }
    else {
        const [m, sec] = formatDuration(s.durationSeconds);
        const stateLabel = s.isPaused ? '$(debug-pause) **Paused**' : '$(record) **Recording**';
        md.appendMarkdown(`${stateLabel} — ${m}:${sec}\n\n`);
        md.appendMarkdown(`$(edit) **Edits:** ${s.fileEdits}\n\n`);
        md.appendMarkdown(`$(save) **Saves:** ${s.fileSaves}\n\n`);
        md.appendMarkdown(`$(files) **Files touched:** ${s.activeFiles.size}\n\n`);
        md.appendMarkdown(`$(list-ordered) **Lines changed:** ${s.linesChanged}\n\n`);
        md.appendMarkdown(`$(terminal) **Terminal opens:** ${s.terminalCommands}\n\n`);
        // Activity progress bar (100 edits = full bar)
        const pct = activityPct(s.fileEdits);
        md.appendMarkdown(`${makeProgressBar(pct)} ${pct}% activity\n\n`);
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`**Archetype:** ${tracker.archetype()}\n\n`);
    }
    md.appendMarkdown('---\n\n');
    md.appendMarkdown(`[$(graph) Open Panel](command:sprintly.showStatusPanel)  ` +
        `[$(settings-gear) Settings](command:workbench.action.openSettings?%5B%22sprintly%22%5D)\n`);
    item.tooltip = md;
}
/** Render a 10-block ASCII progress bar for a 0–100 percentage. */
function makeProgressBar(pct) {
    const filled = Math.round(Math.max(0, Math.min(100, pct)) / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}
/**
 * Hook into tracker events for live status bar refreshes.
 * Falls back to a '—' placeholder on error so the bar never crashes.
 */
function startLiveUpdates(context, item, tracker) {
    const tick = () => {
        try {
            const s = tracker.get();
            if (!s.isRecording) {
                return;
            } // idle state handled by update()
            updateTooltip(item, tracker);
        }
        catch {
            item.text = '$(pulse) —';
        }
    };
    // Event-driven (fires every second while recording — no polling overhead needed)
    context.subscriptions.push(tracker.onDidUpdate.event(tick));
}
// ─── Utilities ────────────────────────────────────────────────────────────────
/** Returns [mm, ss] strings, both zero-padded. */
function formatDuration(totalSeconds) {
    return [
        String(Math.floor(totalSeconds / 60)).padStart(2, '0'),
        String(totalSeconds % 60).padStart(2, '0'),
    ];
}
/** Activity percentage: 100 edits = 100%. Capped at 100. */
function activityPct(edits) {
    return Math.min(100, Math.round((edits / 100) * 100));
}
//# sourceMappingURL=statusBar.js.map