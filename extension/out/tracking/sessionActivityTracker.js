"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionActivityTracker = exports.SESSION_GAP_MS = void 0;
exports.classifyChange = classifyChange;
const vscode = require("vscode");
exports.SESSION_GAP_MS = 900000;
const HEARTBEAT_INTERVAL_MS = 120000;
class SessionActivityTracker {
    constructor(store) {
        this.store = store;
        this.disposables = [];
        this.lastHeartbeats = new Map();
        this.lastEditCategories = new Map();
        this.forceNextHeartbeat = new Set();
        this.lifecycleKey = getLifecycleKey(store);
        this.disposables.push(vscode.workspace.onDidChangeTextDocument((event) => {
            if (!this.store.isCapturing()) {
                return;
            }
            const uri = event.document.uri.toString();
            for (const change of event.contentChanges) {
                if (change.text === '' && change.rangeLength > 0) {
                    this.recordNeutralEdit(uri);
                    continue;
                }
                const category = classifyChange(change.text, change.rangeLength);
                this.lastEditCategories.set(uri, category);
                this.recordTextHeartbeat(uri, category, Date.now());
            }
        }), vscode.workspace.onDidSaveTextDocument((document) => {
            if (!this.store.isCapturing()) {
                return;
            }
            this.recordForcedHeartbeat(document.uri.toString(), Date.now());
        }), vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && this.store.isCapturing()) {
                this.recordForcedHeartbeat(editor.document.uri.toString(), Date.now());
            }
        }), this.store.onDidUpdate(() => this.handleSessionLifecycleChange()));
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
        const category = this.lastEditCategories.get(uri) ?? previous?.category ?? 'manual';
        this.forceNextHeartbeat.delete(uri);
        this.commitHeartbeat({ uri, time: now, category });
    }
    commitHeartbeat(heartbeat) {
        if (!this.store.isCapturing(heartbeat.time)) {
            return;
        }
        const previous = this.lastSessionHeartbeat;
        if (previous && previous.category === heartbeat.category) {
            const rawGap = heartbeat.time - previous.time;
            if (rawGap >= 0 && rawGap <= exports.SESSION_GAP_MS) {
                this.store.addSessionDuration(heartbeat.category, rawGap, heartbeat.time);
            }
        }
        this.lastHeartbeats.set(heartbeat.uri, heartbeat);
        this.lastSessionHeartbeat = heartbeat;
    }
    handleSessionLifecycleChange() {
        const nextLifecycleKey = getLifecycleKey(this.store);
        if (nextLifecycleKey === this.lifecycleKey) {
            return;
        }
        this.lifecycleKey = nextLifecycleKey;
        this.lastHeartbeats.clear();
        this.lastEditCategories.clear();
        this.forceNextHeartbeat.clear();
        this.lastSessionHeartbeat = undefined;
    }
}
exports.SessionActivityTracker = SessionActivityTracker;
function classifyChange(text, replacedLength = 0, knownAttribution) {
    if (knownAttribution) {
        return knownAttribution;
    }
    // VS Code does not expose which completion provider authored a document change.
    // Normal typing is observable; bulk inserts/replacements are intentionally kept
    // unattributed instead of being presented as factually AI-generated.
    return text.length > 1 || replacedLength > 0 ? 'unknown-bulk' : 'manual';
}
function getLifecycleKey(store) {
    const session = store.get().session;
    return `${session.id ?? ''}:${session.isActive}:${session.isPaused}`;
}
//# sourceMappingURL=sessionActivityTracker.js.map