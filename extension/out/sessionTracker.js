"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionTracker = void 0;
const vscode = require("vscode");
const terminalCommands_1 = require("./tracking/terminalCommands");
const developerMetrics_1 = require("./tracking/developerMetrics");
class SessionTracker {
    constructor() {
        this.stats = this.blank();
        this.listeners = [];
        this.tick = null;
        /** Fired whenever stats change so subscribers can push updates to the webview */
        this.onDidUpdate = new vscode.EventEmitter();
    }
    blank() {
        return {
            isRecording: false, startedAt: null, durationSeconds: 0,
            fileEdits: 0, fileSaves: 0, fileSwitches: 0,
            activeFiles: new Set(), linesChanged: 0, terminalCommands: 0,
            terminalOpens: 0, terminalCommandsByCategory: (0, terminalCommands_1.emptyTerminalCommandCounts)(),
            isPaused: false, totalPausedSeconds: 0, pausedAt: null,
        };
    }
    start() {
        this.stats = this.blank();
        this.stats.isRecording = true;
        this.stats.startedAt = new Date();
        this._attach();
        this._startTick();
        this._emit();
    }
    pause() {
        if (!this.stats.isRecording || this.stats.isPaused)
            return;
        this.stats.isPaused = true;
        this.stats.pausedAt = new Date();
        if (this.tick)
            clearInterval(this.tick);
        this._emit();
    }
    resume() {
        if (!this.stats.isPaused || !this.stats.pausedAt)
            return;
        this.stats.totalPausedSeconds += (Date.now() - this.stats.pausedAt.getTime()) / 1000;
        this.stats.isPaused = false;
        this.stats.pausedAt = null;
        this._startTick();
        this._emit();
    }
    stop() {
        this.stats.isRecording = false;
        this.stats.isPaused = false;
        if (this.tick)
            clearInterval(this.tick);
        this._detach();
        this._emit();
    }
    reset() {
        this.stop();
        this.stats = this.blank();
        this._emit();
    }
    get() {
        return {
            ...this.stats,
            activeFiles: new Set(this.stats.activeFiles),
            terminalCommandsByCategory: { ...this.stats.terminalCommandsByCategory },
        };
    }
    archetype() {
        const s = this.stats;
        if (s.durationSeconds < 30)
            return 'Steady Builder';
        return (0, developerMetrics_1.deriveDeveloperProfile)({
            sessionDurationMs: s.durationSeconds * 1000,
            coding: { manualMs: 0, aiAssistedMs: 0, automationMs: 0, unknownBulkMs: 0 },
            fileEdits: s.fileEdits,
            fileSaves: s.fileSaves,
            fileSwitches: s.fileSwitches,
            terminalCommands: s.terminalCommands,
            terminalCommandsByCategory: s.terminalCommandsByCategory,
            failures: 0,
            recoveredFailures: 0,
            successfulRuns: 0,
        }).primary;
    }
    _emit() { this.onDidUpdate.fire(this.get()); }
    _startTick() {
        this.tick = setInterval(() => {
            if (this.stats.startedAt && !this.stats.isPaused) {
                const elapsed = (Date.now() - this.stats.startedAt.getTime()) / 1000;
                this.stats.durationSeconds = Math.floor(elapsed - this.stats.totalPausedSeconds);
                this._emit();
            }
        }, 1000);
    }
    _attach() {
        this.listeners.push(vscode.workspace.onDidChangeTextDocument(e => {
            if (!this.stats.isRecording || this.stats.isPaused)
                return;
            this.stats.fileEdits++;
            this.stats.linesChanged += e.contentChanges.reduce((n, c) => n + Math.abs(c.text.split('\n').length - 1), 0);
            this.stats.activeFiles.add(e.document.fileName);
        }), vscode.workspace.onDidSaveTextDocument(() => {
            if (!this.stats.isRecording || this.stats.isPaused)
                return;
            this.stats.fileSaves++;
        }), vscode.window.onDidChangeActiveTextEditor(e => {
            if (!this.stats.isRecording || this.stats.isPaused || !e)
                return;
            this.stats.fileSwitches++;
            this.stats.activeFiles.add(e.document.fileName);
        }), vscode.window.onDidOpenTerminal(() => {
            if (!this.stats.isRecording || this.stats.isPaused)
                return;
            this.stats.terminalOpens++;
        }), vscode.window.onDidEndTerminalShellExecution((event) => {
            if (!this.stats.isRecording || this.stats.isPaused)
                return;
            const category = (0, terminalCommands_1.classifyTerminalCommand)(event.execution.commandLine?.value);
            this.stats.terminalCommands++;
            this.stats.terminalCommandsByCategory[category]++;
        }));
    }
    _detach() {
        this.listeners.forEach(d => d.dispose());
        this.listeners = [];
    }
    dispose() {
        this.reset();
        this.onDidUpdate.dispose();
    }
}
exports.SessionTracker = SessionTracker;
//# sourceMappingURL=sessionTracker.js.map