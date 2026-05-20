"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionPanelProvider = exports.SESSION_VIEW_ID = void 0;
const vscode = require("vscode");
const panelHtml_1 = require("./panelHtml");
exports.SESSION_VIEW_ID = 'sprintly.sessionView';
class SessionPanelProvider {
    constructor(tracker, context, onStart, onPause, onResume, onStop, onReset) {
        this.tracker = tracker;
        this.context = context;
        this.onStart = onStart;
        this.onPause = onPause;
        this.onResume = onResume;
        this.onStop = onStop;
        this.onReset = onReset;
        this.pushTimer = null;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };
        webviewView.webview.html = (0, panelHtml_1.getPanelHtml)(webviewView.webview);
        // Push stats immediately when panel opens
        this._push();
        // Push every second while visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._push();
                this._startPushTimer();
            }
            else {
                this._stopPushTimer();
            }
        });
        this._startPushTimer();
        // Handle button clicks from the webview
        webviewView.webview.onDidReceiveMessage(msg => {
            switch (msg.command) {
                case 'start':
                    this.onStart();
                    break;
                case 'pause':
                    this.onPause();
                    break;
                case 'resume':
                    this.onResume();
                    break;
                case 'stop':
                    this.onStop();
                    break;
                case 'reset':
                    this.onReset();
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
                    break;
            }
        });
    }
    /** Called externally to force a stat refresh (e.g. after start/stop). */
    refresh() { this._push(); }
    _push() {
        if (!this.view?.visible)
            return;
        const stats = this.tracker.get();
        this.view.webview.postMessage({
            type: 'update',
            stats: {
                isRecording: stats.isRecording,
                isPaused: stats.isPaused,
                durationSeconds: stats.durationSeconds,
                fileEdits: stats.fileEdits,
                fileSaves: stats.fileSaves,
                fileSwitches: stats.fileSwitches,
                activeFilesCount: stats.activeFiles.size,
                linesChanged: stats.linesChanged,
                terminalCommands: stats.terminalCommands,
                startedAt: stats.startedAt?.toISOString() ?? null,
                archetype: this.tracker.archetype(),
            },
        });
    }
    _startPushTimer() {
        if (this.pushTimer)
            return;
        this.pushTimer = setInterval(() => this._push(), 1000);
    }
    _stopPushTimer() {
        if (this.pushTimer) {
            clearInterval(this.pushTimer);
            this.pushTimer = null;
        }
    }
    dispose() { this._stopPushTimer(); }
}
exports.SessionPanelProvider = SessionPanelProvider;
//# sourceMappingURL=sessionPanelProvider.js.map