"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionActivityTracker = exports.SESSION_GAP_MS = void 0;
exports.classifyChange = classifyChange;
const vscode = require("vscode");
const dailyStateStore_1 = require("./dailyStateStore");
exports.SESSION_GAP_MS = 900000;
const HEARTBEAT_INTERVAL_MS = 120000;
class SessionActivityTracker {
    constructor(store) {
        this.store = store;
        this.disposables = [];
        this.lastHeartbeats = new Map();
        this.lastEditCategories = new Map();
        this.forceNextHeartbeat = new Set();
        this.disposables.push(vscode.workspace.onDidChangeTextDocument((event) => {
            const uri = event.document.uri.toString();
            for (const change of event.contentChanges) {
                if (change.text === '' && change.rangeLength > 0) {
                    this.recordNeutralEdit(uri);
                    continue;
                }
                const category = classifyChange(change.text);
                this.lastEditCategories.set(uri, category);
                this.recordTextHeartbeat(uri, category, Date.now());
            }
        }), vscode.workspace.onDidSaveTextDocument((document) => {
            this.recordForcedHeartbeat(document.uri.toString(), Date.now());
        }), vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.recordForcedHeartbeat(editor.document.uri.toString(), Date.now());
            }
        }));
    }
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
    recordNeutralEdit(uri) {
        this.lastEditCategories.delete(uri);
        this.forceNextHeartbeat.add(uri);
        if (this.lastSessionHeartbeat?.uri === uri) {
            this.lastSessionHeartbeat = undefined;
        }
    }
    recordTextHeartbeat(uri, category, now) {
        const previous = this.lastHeartbeats.get(uri);
        const shouldHeartbeat = !previous
            || this.forceNextHeartbeat.has(uri)
            || now - previous.time >= HEARTBEAT_INTERVAL_MS
            || previous.category !== category;
        if (!shouldHeartbeat) {
            return;
        }
        this.forceNextHeartbeat.delete(uri);
        this.commitHeartbeat({ uri, time: now, category });
    }
    recordForcedHeartbeat(uri, now) {
        const previous = this.lastHeartbeats.get(uri);
        // ASSUMPTION: a save or first activation without a classified edit is hardcode,
        // because the required heartbeat must carry one of the two duration categories.
        const category = this.lastEditCategories.get(uri) ?? previous?.category ?? 'hardcode';
        this.forceNextHeartbeat.delete(uri);
        this.commitHeartbeat({ uri, time: now, category });
    }
    commitHeartbeat(heartbeat) {
        const previous = this.lastSessionHeartbeat;
        if (previous && previous.category === heartbeat.category) {
            const rawGap = heartbeat.time - previous.time;
            if (rawGap >= 0 && rawGap <= exports.SESSION_GAP_MS) {
                const durationToday = heartbeat.time - Math.max(previous.time, (0, dailyStateStore_1.localDayBounds)().start);
                this.store.addSessionDuration(heartbeat.category, durationToday);
            }
        }
        this.lastHeartbeats.set(heartbeat.uri, heartbeat);
        this.lastSessionHeartbeat = heartbeat;
    }
}
exports.SessionActivityTracker = SessionActivityTracker;
function classifyChange(text) {
    const newlineCount = text.match(/\n/g)?.length ?? 0;
    return text.length >= 50 || newlineCount >= 2 ? 'vibecode' : 'hardcode';
}
//# sourceMappingURL=sessionActivityTracker.js.map