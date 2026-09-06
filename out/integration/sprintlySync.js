"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintlySyncService = void 0;
const sprintlyApi_1 = require("./sprintlyApi");
const connectionSettings_1 = require("./connectionSettings");
const pairing_1 = require("./pairing");
const sprintlyContract_1 = require("../tracking/sprintlyContract");
/** Coordinates privacy policy, credentials, API calls, and the durable queue. */
class SprintlySyncService {
    constructor(options) {
        this.options = options;
        this.listeners = new Set();
        this.syncInFlight = null;
        this.readSettings = options.readSettings ?? connectionSettings_1.getSprintlyConnectionSettings;
        this.createClient = options.createClient
            ?? ((settings, token) => new sprintlyApi_1.SprintlyApiClient({ baseUrl: settings.apiUrl, token }));
        this.pairingAdapter = options.pairingAdapter ?? new pairing_1.UnavailablePairingAdapter();
        this.now = options.now ?? Date.now;
        options.stateStore.onDidChange(() => this.notify());
    }
    getStatus() {
        const settings = this.readSettings();
        const state = this.options.stateStore.get();
        return {
            connectionStatus: state.connectionStatus,
            apiUrl: settings.apiUrl,
            environment: settings.environment,
            syncPreference: settings.syncPreference,
            localOnly: settings.syncPreference === 'never',
            leaderboardOptIn: settings.leaderboardOptIn,
            pendingCount: this.options.outbox.pendingCount(),
            failedCount: this.options.outbox.failedCount(),
            lastSuccessfulSync: state.lastSuccessfulSync,
            lastSyncError: state.lastSyncError,
        };
    }
    onDidChange(listener) {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }
    async testConnection() {
        const settings = this.readSettings();
        try {
            await this.createClient(settings, null).health();
            this.options.stateStore.markConnected();
            await this.flushState();
        }
        catch (error) {
            this.options.stateStore.markSyncFailed(errorMessage(error));
            await this.flushState();
            throw error;
        }
    }
    async connectDevelopment() {
        const settings = this.readSettings();
        if (settings.environment !== 'development') {
            throw new Error('Development tokens can be used only when sprintly.apiEnvironment is development.');
        }
        const token = await this.options.tokenStore.get('development', settings.developmentToken);
        if (!token) {
            throw new Error('No development token is configured. Use Sprintly: Set Development Token or sprintly.developmentToken.');
        }
        try {
            await this.createClient(settings, token).health();
            this.options.stateStore.markConnected();
            await this.flushState();
        }
        catch (error) {
            this.options.stateStore.markSyncFailed(errorMessage(error));
            await this.flushState();
            throw error;
        }
    }
    async connectWithPairingCode(code) {
        const settings = this.readSettings();
        if (settings.environment !== 'production') {
            throw new Error('Pairing is available only when sprintly.apiEnvironment is production.');
        }
        const normalizedCode = code.trim();
        if (!normalizedCode)
            throw new Error('A pairing code is required.');
        try {
            const response = await this.pairingAdapter.exchangeCode({ code: normalizedCode });
            await this.options.tokenStore.storeDeviceToken(response.deviceToken);
            await this.createClient(settings, response.deviceToken).health();
            this.options.stateStore.markConnected();
            await this.flushState();
        }
        catch (error) {
            this.options.stateStore.markSyncFailed(errorMessage(error));
            await this.flushState();
            throw error;
        }
    }
    async disconnect() {
        await this.options.tokenStore.clear();
        this.options.stateStore.markDisconnected();
        await this.flushState();
    }
    async setDevelopmentToken(token) {
        await this.options.tokenStore.storeDevelopmentToken(token);
        this.options.stateStore.markDisconnected();
        await this.flushState();
    }
    async eraseLocalData() {
        await this.options.tokenStore.clear();
        this.options.outbox.clear();
        this.options.stateStore.markDisconnected();
        await this.flushState();
    }
    /** Queue and immediately attempt a user-selected session. */
    async syncCurrentSession(record) {
        return this.queueAndSync(record, true);
    }
    /** Queue a completed session only when the completed-session policy is active. */
    async syncCompletedSession(record) {
        return this.queueAndSync(record, false);
    }
    /** Upload due entries; manual invocations also retry failed entries immediately. */
    async syncPendingSessions(manual = true) {
        const settings = this.readSettings();
        const blocked = this.sessionUploadPolicy(settings, manual);
        if (blocked)
            return blocked;
        const entries = this.options.outbox.list().filter((entry) => {
            if (entry.state !== 'pending')
                return false;
            return manual || entry.nextRetryTime === null || entry.nextRetryTime <= this.now();
        });
        return this.syncEntries(entries);
    }
    /** Called at activation and after connectivity returns. */
    async resume() {
        const settings = this.readSettings();
        if (settings.syncPreference === 'never' || settings.syncPreference === 'leaderboard') {
            return this.sessionUploadPolicy(settings, false) ?? emptyResult('skipped');
        }
        const entries = this.options.outbox.due(this.now());
        return this.syncEntries(entries);
    }
    async flush() {
        await Promise.all([this.options.outbox.flush(), this.options.stateStore.flush()]);
    }
    async queueAndSync(record, explicit) {
        const settings = this.readSettings();
        const blocked = this.sessionUploadPolicy(settings, explicit);
        if (blocked)
            return blocked;
        let mapped;
        try {
            mapped = (0, sprintlyContract_1.mapSessionRecord)(record);
        }
        catch (error) {
            const message = errorMessage(error);
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message);
        }
        const entry = this.options.outbox.enqueue(mapped.payload, mapped.warnings.map((warning) => `${warning.field}: ${warning.message}`), explicit);
        this.notify();
        const result = await this.syncEntries([entry]);
        result.queuedCount = 1;
        result.warnings = mapped.warnings.map((warning) => `${warning.field}: ${warning.message}`);
        return result;
    }
    syncEntries(entries) {
        if (this.syncInFlight)
            return this.syncInFlight;
        const operation = this.performSyncEntries(entries);
        this.syncInFlight = operation;
        void operation.then(() => {
            if (this.syncInFlight === operation)
                this.syncInFlight = null;
        }, () => {
            if (this.syncInFlight === operation)
                this.syncInFlight = null;
        });
        return operation;
    }
    async performSyncEntries(entries) {
        if (!entries.length) {
            return emptyResult('queued');
        }
        const settings = this.readSettings();
        const token = await this.options.tokenStore.get(settings.environment, settings.developmentToken);
        if (!token && settings.environment === 'production') {
            const message = 'Sprintly is not connected. Run Sprintly: Connect before syncing.';
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message, entries.length);
        }
        if (!token && settings.environment === 'development') {
            const message = 'No development bearer token is configured.';
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message, entries.length);
        }
        const syncing = entries
            .map((entry) => this.options.outbox.begin(entry.sessionId, this.now()))
            .filter((entry) => entry !== null && entry.state === 'syncing');
        if (!syncing.length)
            return emptyResult('queued');
        this.notify();
        try {
            const response = await this.createClient(settings, token).uploadSessions(syncing.map((entry) => entry.payload));
            return this.applyUploadResult(syncing, response);
        }
        catch (error) {
            return this.applyUploadError(syncing, error);
        }
    }
    async applyUploadResult(entries, response) {
        const accepted = new Set(response.acceptedSessionIds);
        const duplicates = new Set(response.duplicateSessionIds);
        const rejected = response.rejected;
        const rejectedIds = new Set(rejected.map((entry) => entry.sessionId));
        for (const entry of entries) {
            if (accepted.has(entry.sessionId) || duplicates.has(entry.sessionId)) {
                this.options.outbox.markSynced(entry.sessionId);
            }
            else if (rejectedIds.has(entry.sessionId)) {
                const rejection = rejected.find((candidate) => candidate.sessionId === entry.sessionId);
                this.options.outbox.markFailed(entry.sessionId, rejection?.reason ?? 'The website rejected this session.', false, this.now());
            }
            else {
                this.options.outbox.markFailed(entry.sessionId, 'The website did not report a result for this session.', false, this.now());
            }
        }
        const successCount = accepted.size + duplicates.size;
        if (successCount > 0 && rejected.length === 0 && successCount === entries.length) {
            this.options.stateStore.markSyncSucceeded(this.now());
        }
        else {
            this.options.stateStore.markSyncFailed(rejected.length ? rejected.map((entry) => `${entry.sessionId}: ${entry.reason}`).join('; ') : 'The website returned an incomplete upload result.');
        }
        await this.flushState();
        this.notify();
        return {
            state: successCount === entries.length ? 'synced' : successCount > 0 ? 'partial' : 'failed',
            queuedCount: 0,
            syncedCount: accepted.size,
            duplicateCount: duplicates.size,
            rejected,
            warnings: entries.flatMap((entry) => entry.compatibilityWarnings),
        };
    }
    async applyUploadError(entries, error) {
        const apiError = error instanceof sprintlyApi_1.SprintlyApiError ? error : null;
        const message = errorMessage(error);
        for (const entry of entries) {
            const rejection = apiError?.rejected.find((candidate) => candidate.sessionId === entry.sessionId);
            this.options.outbox.markFailed(entry.sessionId, rejection?.reason ?? message, apiError?.retryable ?? true, this.now());
        }
        if (apiError?.kind === 'revoked-device') {
            await this.options.tokenStore.clear();
            this.options.stateStore.markRevoked(message);
        }
        else {
            this.options.stateStore.markSyncFailed(message);
        }
        await this.flushState();
        this.notify();
        return {
            state: 'failed',
            queuedCount: entries.length,
            syncedCount: 0,
            duplicateCount: 0,
            rejected: apiError?.rejected ?? [],
            warnings: entries.flatMap((entry) => entry.compatibilityWarnings),
            error: message,
        };
    }
    sessionUploadPolicy(settings, explicit) {
        if (settings.syncPreference === 'never') {
            return {
                state: 'skipped', queuedCount: 0, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [],
                error: 'Local-only mode is active. No network request was made.',
            };
        }
        if (settings.syncPreference === 'leaderboard') {
            return {
                state: 'skipped', queuedCount: 0, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [],
                error: settings.leaderboardOptIn
                    ? 'Leaderboard mode sends only aggregate leaderboard data; session upload is not used.'
                    : 'Leaderboard upload requires explicit opt-in.',
            };
        }
        if (settings.syncPreference === 'selected' && !explicit) {
            return {
                state: 'skipped', queuedCount: 0, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [],
                error: 'Selected-session mode waits for an explicit session selection.',
            };
        }
        return null;
    }
    async flushState() {
        await Promise.all([this.options.outbox.flush(), this.options.stateStore.flush()]);
    }
    notify() {
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch {
                // UI observers cannot interrupt synchronization.
            }
        }
    }
}
exports.SprintlySyncService = SprintlySyncService;
function emptyResult(state) {
    return { state, queuedCount: 0, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [] };
}
function failedResult(error, queuedCount = 0) {
    return {
        state: 'failed', queuedCount, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [], error,
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : 'Sprintly synchronization failed.';
}
//# sourceMappingURL=sprintlySync.js.map