"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionActivityTracker = exports.ACTIVE_GAP_CREDIT_MS = void 0;
exports.classifyChange = classifyChange;
const vscode = require("vscode");
const privacySettings_1 = require("./privacySettings");
/**
 * Maximum inter-heartbeat gap fully credited as engaged coding time. The
 * heartbeat interval is two minutes during continuous activity, so gaps at or
 * under twice that plausibly represent ongoing work. Anything longer is an
 * explicit idle period and credits nothing: fifteen idle minutes can no longer
 * be recorded as coding (audit Bug #6).
 */
exports.ACTIVE_GAP_CREDIT_MS = 240000;
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
            if (!this.store.isCapturing() || !(0, privacySettings_1.isTelemetryCategoryEnabled)('codingActivity')) {
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
            if (!this.store.isCapturing() || !(0, privacySettings_1.isTelemetryCategoryEnabled)('codingActivity')) {
                return;
            }
            this.recordForcedHeartbeat(document.uri.toString(), Date.now());
        }), vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && this.store.isCapturing() && (0, privacySettings_1.isTelemetryCategoryEnabled)('codingActivity')) {
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
        // A save or editor switch extends an already-established category for the
        // document, but never fabricates one: without classified edit evidence the
        // heartbeat is a neutral anchor that attributes no duration (audit Bug #7
        // false-positive review).
        const category = this.lastEditCategories.get(uri) ?? previous?.category ?? null;
        this.forceNextHeartbeat.delete(uri);
        this.commitHeartbeat({ uri, time: now, category });
    }
    commitHeartbeat(heartbeat) {
        if (!this.store.isCapturing(heartbeat.time)) {
            return;
        }
        const previous = this.lastSessionHeartbeat;
        if (previous && previous.category !== null && previous.category === heartbeat.category) {
            const rawGap = heartbeat.time - previous.time;
            // Bounded engaged-time credit: only a short, plausibly continuous gap
            // counts; longer gaps are idle and contribute nothing.
            if (rawGap >= 0 && rawGap <= exports.ACTIVE_GAP_CREDIT_MS) {
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