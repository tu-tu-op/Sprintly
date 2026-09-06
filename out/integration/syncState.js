"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncStateStore = exports.DEFAULT_SYNC_STATE_KEY = exports.SYNC_STATE_SCHEMA_VERSION = void 0;
exports.SYNC_STATE_SCHEMA_VERSION = 'sprintly.sync-state.v1';
exports.DEFAULT_SYNC_STATE_KEY = 'sprintly.syncState.v1';
class SyncStateStore {
    constructor(storage, storageKey = exports.DEFAULT_SYNC_STATE_KEY) {
        this.storage = storage;
        this.storageKey = storageKey;
        this.persistQueue = Promise.resolve();
        this.listeners = new Set();
        this.state = parseState(storage.get(storageKey));
    }
    get() {
        return { ...this.state };
    }
    onDidChange(listener) {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }
    markConnected() {
        this.update({ connectionStatus: 'connected', lastSyncError: null });
    }
    markDisconnected() {
        this.update({ connectionStatus: 'disconnected' });
    }
    markRevoked(error = 'The Sprintly device has been revoked.') {
        this.update({ connectionStatus: 'revoked', lastSyncError: sanitizeError(error) });
    }
    markSyncSucceeded(timestamp = Date.now()) {
        this.update({
            connectionStatus: 'connected',
            lastSuccessfulSync: timestamp,
            lastSyncError: null,
        });
    }
    markSyncFailed(error, status = 'disconnected') {
        this.update({ connectionStatus: status, lastSyncError: sanitizeError(error) });
    }
    async flush() {
        await this.persistQueue;
        if (this.lastPersistError !== undefined) {
            const error = this.lastPersistError;
            this.lastPersistError = undefined;
            throw error;
        }
    }
    update(patch) {
        this.state = { ...this.state, ...patch };
        this.persistQueue = this.persistQueue
            .then(() => this.storage.update(this.storageKey, { ...this.state }))
            .then(() => undefined, (error) => {
            this.lastPersistError = error;
        });
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch {
                // Status observers must never interrupt a state transition.
            }
        }
    }
}
exports.SyncStateStore = SyncStateStore;
function parseState(value) {
    if (!isRecord(value) || value.schemaVersion !== exports.SYNC_STATE_SCHEMA_VERSION) {
        return emptyState();
    }
    const status = value.connectionStatus;
    return {
        schemaVersion: exports.SYNC_STATE_SCHEMA_VERSION,
        connectionStatus: status === 'connected' || status === 'revoked' ? status : 'disconnected',
        lastSuccessfulSync: nullableTimestamp(value.lastSuccessfulSync),
        lastSyncError: typeof value.lastSyncError === 'string' ? sanitizeError(value.lastSyncError) : null,
    };
}
function emptyState() {
    return {
        schemaVersion: exports.SYNC_STATE_SCHEMA_VERSION,
        connectionStatus: 'disconnected',
        lastSuccessfulSync: null,
        lastSyncError: null,
    };
}
function nullableTimestamp(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function sanitizeError(value) {
    return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]').slice(0, 500);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=syncState.js.map