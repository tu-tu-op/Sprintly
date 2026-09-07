"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintlySyncService = void 0;
const sprintlyApi_1 = require("./sprintlyApi");
const connectionSettings_1 = require("./connectionSettings");
const pairing_1 = require("./pairing");
const privacySettings_1 = require("../tracking/privacySettings");
const sprintlyContract_1 = require("../tracking/sprintlyContract");
/** Coordinates privacy policy, credentials, API calls, and the durable queue. */
class SprintlySyncService {
    constructor(options) {
        this.options = options;
        this.listeners = new Set();
        this.syncInFlight = null;
        this.inMemoryToken = null;
        this.authBlocked = false;
        this.hasCredential = false;
        this.readSettings = options.readSettings ?? connectionSettings_1.getSprintlyConnectionSettings;
        this.createClient = options.createClient
            ?? ((settings, token) => new sprintlyApi_1.SprintlyApiClient({ baseUrl: settings.apiUrl, token }));
        this.pairingAdapter = options.pairingAdapter;
        this.createPairingAdapter = options.createPairingAdapter
            ?? ((settings) => new pairing_1.HttpPairingAdapter({ baseUrl: settings.apiUrl }));
        this.deviceName = options.deviceName ?? 'VS Code';
        this.deviceType = options.deviceType ?? 'vscode';
        this.createDeviceId = options.createDeviceId;
        this.now = options.now ?? Date.now;
        options.stateStore.onDidChange(() => this.notify());
        void this.refreshCredentialState();
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
            pairingRequired: this.authBlocked
                || state.authRequired
                || state.connectionStatus === 'revoked'
                || !this.hasCredential,
            syncEnabled: settings.syncEnabled !== false,
            syncDisabled: state.syncDisabled,
            rejectedCount: this.options.outbox.rejectedCount(),
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
            const state = this.options.stateStore.get();
            if (!this.authBlocked && !state.authRequired && state.connectionStatus !== 'revoked') {
                this.options.stateStore.markConnected(!state.syncDisabled);
            }
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
        const token = await this.options.tokenStore.get('development');
        if (!token) {
            throw new Error('No local development token is configured. Use Sprintly: Set Development Token.');
        }
        try {
            await this.createClient(settings, null).health();
            this.inMemoryToken = token;
            this.hasCredential = true;
            this.authBlocked = false;
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
        const normalizedCode = code.trim();
        if (!normalizedCode)
            throw new Error('A pairing code is required.');
        try {
            // Health is intentionally unauthenticated and must succeed before the
            // one-time pairing code is consumed.
            await this.createClient(settings, null).health();
            const deviceId = await this.options.tokenStore.getOrCreateDeviceId(this.createDeviceId);
            const deviceName = typeof this.deviceName === 'function'
                ? await this.deviceName()
                : this.deviceName;
            const adapter = this.pairingAdapter ?? this.createPairingAdapter(settings);
            const response = await adapter.exchangeCode({
                code: normalizedCode,
                deviceId,
                deviceName: deviceName.trim() || 'VS Code',
                deviceType: this.deviceType,
            });
            await this.options.tokenStore.storeDeviceToken(response.token);
            this.inMemoryToken = response.token;
            this.hasCredential = true;
            this.authBlocked = false;
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
        this.inMemoryToken = null;
        this.hasCredential = false;
        this.authBlocked = false;
        this.options.stateStore.markDisconnected();
        await this.flushState();
    }
    async setDevelopmentToken(token) {
        await this.options.tokenStore.storeDevelopmentToken(token);
        this.inMemoryToken = null;
        this.hasCredential = true;
        this.authBlocked = false;
        this.options.stateStore.markDisconnected();
        await this.flushState();
    }
    async eraseLocalData() {
        await this.options.tokenStore.clear();
        this.inMemoryToken = null;
        this.hasCredential = false;
        this.authBlocked = false;
        this.options.outbox.clear();
        this.options.stateStore.markDisconnected();
        await this.flushState();
    }
    async clearQueuedSessions() {
        this.options.outbox.clear();
        await this.options.outbox.flush();
        this.notify();
    }
    /** Queue and immediately attempt a user-selected session. */
    async syncCurrentSession(record) {
        return this.queueAndSync(record, true);
    }
    /** Queue a completed session only when the completed-session policy is active. */
    async syncCompletedSession(record) {
        return this.queueAndSync(record, false);
    }
    /** Explicitly migrate completed local history; pairing never triggers this automatically. */
    async migrateLocalSessions(records) {
        const settings = this.readSettings();
        const blocked = this.sessionUploadPolicy(settings, true);
        if (blocked)
            return blocked;
        if (!records.length)
            return emptyResult('synced');
        const mapped = [];
        try {
            // Map the entire selection before mutating the queue. A malformed legacy
            // record must not leave a half-migrated batch behind.
            for (const record of records)
                mapped.push(this.mapForUpload(record));
        }
        catch (error) {
            const message = errorMessage(error);
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message);
        }
        const entries = [];
        try {
            for (const entry of mapped) {
                entries.push(this.options.outbox.enqueue(entry.payload, entry.warnings.map((warning) => `${warning.field}: ${warning.message}`)));
            }
        }
        catch (error) {
            const message = errorMessage(error);
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message, entries.length);
        }
        this.notify();
        const pending = entries.filter((entry) => entry.state !== 'synced');
        if (!pending.length) {
            await this.flushState();
            return {
                ...emptyResult('synced'),
                queuedCount: entries.length,
                syncedCount: entries.length,
                warnings: mapped.flatMap((entry) => entry.warnings.map((warning) => `${warning.field}: ${warning.message}`)),
            };
        }
        const result = await this.syncEntries(pending);
        result.queuedCount = entries.length;
        result.warnings = mapped.flatMap((entry) => entry.warnings.map((warning) => `${warning.field}: ${warning.message}`));
        return result;
    }
    /** Upload due entries; manual invocations also retry failed entries immediately. */
    async syncPendingSessions(manual = true) {
        const settings = this.readSettings();
        const blocked = this.sessionUploadPolicy(settings, manual);
        if (blocked)
            return blocked;
        const state = this.options.stateStore.get();
        if (state.syncDisabled && !manual) {
            return failedResult(state.syncDisabledReason ?? 'Website synchronization is disabled in Sprintly Settings.', this.options.outbox.pendingCount());
        }
        if (manual) {
            this.options.stateStore.clearSyncDisabled();
            this.options.outbox.retryFailed();
            this.notify();
            await this.flushState();
        }
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
        if (settings.syncEnabled === false || !(0, privacySettings_1.getPrivacySettings)().enabled) {
            return skippedResult(settings.syncEnabled === false
                ? 'Extension synchronization is disabled in Sprintly Settings.'
                : 'Sprintly is disabled in Settings.', this.options.outbox.pendingCount());
        }
        if (settings.syncPreference === 'never' || settings.syncPreference === 'leaderboard') {
            return this.sessionUploadPolicy(settings, false) ?? emptyResult('skipped');
        }
        const state = this.options.stateStore.get();
        if (state.syncDisabled) {
            return failedResult(state.syncDisabledReason ?? 'Website synchronization is disabled in Sprintly Settings.', this.options.outbox.pendingCount());
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
            mapped = this.mapForUpload(record);
        }
        catch (error) {
            const message = errorMessage(error);
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message);
        }
        let entry;
        try {
            entry = this.options.outbox.enqueue(mapped.payload, mapped.warnings.map((warning) => `${warning.field}: ${warning.message}`), explicit);
        }
        catch (error) {
            const message = errorMessage(error);
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message);
        }
        if (entry.state === 'synced') {
            return {
                ...emptyResult('synced'),
                syncedCount: 1,
                warnings: mapped.warnings.map((warning) => `${warning.field}: ${warning.message}`),
            };
        }
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
        if (settings.syncEnabled === false || !(0, privacySettings_1.getPrivacySettings)().enabled) {
            return skippedResult(settings.syncEnabled === false
                ? 'Extension synchronization is disabled in Sprintly Settings.'
                : 'Sprintly is disabled in Settings.', entries.length);
        }
        const state = this.options.stateStore.get();
        if (state.syncDisabled) {
            const message = state.syncDisabledReason
                ?? 'Website synchronization is disabled in Sprintly Settings.';
            return failedResult(message, entries.length);
        }
        if (this.authBlocked || state.authRequired || state.connectionStatus === 'revoked') {
            const message = 'Sprintly authorization expired. Pair the extension again before syncing.';
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message, entries.length);
        }
        const token = this.inMemoryToken ?? await this.options.tokenStore.get(settings.environment);
        if (!token && settings.environment === 'production') {
            const message = 'Sprintly is not connected. Run Sprintly: Connect before syncing.';
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message, entries.length);
        }
        if (!token && settings.environment === 'development') {
            const message = 'No local development bearer token is configured.';
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message, entries.length);
        }
        if (!token) {
            const message = 'No Sprintly bearer token is configured.';
            this.options.stateStore.markSyncFailed(message);
            await this.flushState();
            return failedResult(message, entries.length);
        }
        const total = emptyBatchSummary(entries);
        for (const batch of chunkEntries(entries)) {
            const result = await this.uploadChunk(settings, token, batch);
            mergeBatchSummary(total, result);
            if (result.error)
                break;
        }
        const successfulIds = new Set([
            ...total.acceptedSessionIds,
            ...total.duplicateSessionIds,
        ]);
        const successfulCount = successfulIds.size;
        const completeSuccess = !total.error
            && total.rejected.length === 0
            && successfulCount === entries.length;
        if (completeSuccess) {
            this.options.stateStore.markSyncSucceeded(this.now());
        }
        else if (!total.error || this.options.stateStore.get().lastSyncError === null) {
            this.options.stateStore.markSyncFailed(total.error
                ?? (total.rejected.length
                    ? total.rejected.map((entry) => `${entry.sessionId}: ${entry.reason}`).join('; ')
                    : 'The website returned an incomplete upload result.'));
        }
        await this.flushState();
        this.notify();
        const queuedCount = Math.max(0, entries.length - successfulCount - total.rejected.length);
        return {
            state: completeSuccess
                ? 'synced'
                : successfulCount > 0 ? 'partial' : 'failed',
            queuedCount,
            syncedCount: total.acceptedSessionIds.length,
            duplicateCount: total.duplicateSessionIds.length,
            rejected: total.rejected,
            warnings: total.warnings,
            ...(total.error ? { error: total.error } : {}),
        };
    }
    async uploadChunk(settings, token, entries) {
        const syncing = entries
            .map((entry) => this.options.outbox.begin(entry.sessionId, this.now()))
            .filter((entry) => entry !== null && entry.state === 'syncing');
        if (!syncing.length)
            return emptyBatchSummary(entries);
        this.notify();
        return this.uploadSyncingChunk(settings, token, syncing);
    }
    async uploadSyncingChunk(settings, token, entries) {
        try {
            const privacy = (0, privacySettings_1.getPrivacySettings)();
            const response = await this.createClient(settings, token).uploadSessions(entries.map((entry) => redactSessionForPrivacy(entry.payload, privacy)));
            return this.applyUploadResult(entries, response);
        }
        catch (error) {
            if (isPayloadTooLarge(error) && entries.length > 1) {
                // The server may apply a stricter byte calculation than the client.
                // Return these entries to pending before trying bounded sub-batches.
                for (const entry of entries)
                    this.options.outbox.releaseSyncing(entry.sessionId);
                const midpoint = Math.ceil(entries.length / 2);
                const left = await this.uploadChunk(settings, token, entries.slice(0, midpoint));
                if (left.error)
                    return left;
                const right = await this.uploadChunk(settings, token, entries.slice(midpoint));
                return mergeBatchSummaries(left, right);
            }
            return this.applyUploadError(entries, error);
        }
    }
    applyUploadResult(entries, response) {
        const entryIds = new Set(entries.map((entry) => entry.sessionId));
        const accepted = new Set(response.acceptedSessionIds.filter((id) => entryIds.has(id)));
        const duplicates = new Set(response.duplicateSessionIds.filter((id) => entryIds.has(id)));
        const rejectionById = new Map(response.rejected
            .filter((entry) => entryIds.has(entry.sessionId))
            .map((entry) => [entry.sessionId, entry.reason]));
        const rejected = [];
        for (const entry of entries) {
            if (accepted.has(entry.sessionId) || duplicates.has(entry.sessionId)) {
                this.options.outbox.markSynced(entry.sessionId);
            }
            else {
                const reason = rejectionById.get(entry.sessionId)
                    ?? 'The website did not report a result for this session.';
                this.options.outbox.markFailed(entry.sessionId, reason, false, this.now());
                rejected.push({ sessionId: entry.sessionId, reason });
            }
        }
        return {
            acceptedSessionIds: [...accepted],
            duplicateSessionIds: [...duplicates],
            rejected,
            warnings: entries.flatMap((entry) => entry.compatibilityWarnings),
        };
    }
    applyUploadError(entries, error) {
        const apiError = error instanceof sprintlyApi_1.SprintlyApiError ? error : null;
        const message = errorMessage(error);
        const rejectionById = new Map((apiError?.rejected ?? []).map((entry) => [entry.sessionId, entry.reason]));
        const rejected = [];
        for (const entry of entries) {
            const rejection = rejectionById.get(entry.sessionId);
            this.options.outbox.markFailed(entry.sessionId, rejection ?? message, apiError?.kind === 'unauthorized' || apiError?.kind === 'revoked-device'
                ? false
                : apiError?.retryable ?? true, this.now());
            if (rejection)
                rejected.push({ sessionId: entry.sessionId, reason: rejection });
        }
        if (apiError?.kind === 'sync-disabled') {
            this.options.stateStore.markSyncDisabled(message);
        }
        else if (apiError?.kind === 'revoked-device') {
            this.inMemoryToken = null;
            this.hasCredential = false;
            this.authBlocked = true;
            this.options.stateStore.markRevoked(message);
        }
        else if (apiError?.kind === 'unauthorized') {
            // A 401 disables this process' uploader. The persisted SecretStorage
            // value is deliberately left untouched until the user explicitly
            // disconnects or completes a new pairing.
            this.inMemoryToken = null;
            this.hasCredential = false;
            this.authBlocked = true;
            this.options.stateStore.markAuthorizationRequired(message);
        }
        else {
            this.options.stateStore.markSyncFailed(message);
        }
        return {
            acceptedSessionIds: [],
            duplicateSessionIds: [],
            rejected,
            warnings: entries.flatMap((entry) => entry.compatibilityWarnings),
            error: message,
        };
    }
    sessionUploadPolicy(settings, explicit) {
        if (settings.syncEnabled === false) {
            return skippedResult('Extension synchronization is disabled in Sprintly Settings.');
        }
        if (!(0, privacySettings_1.getPrivacySettings)().enabled) {
            return skippedResult('Sprintly is disabled in Settings.');
        }
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
    mapForUpload(record) {
        const mapped = (0, sprintlyContract_1.mapSessionRecord)(record);
        return {
            ...mapped,
            payload: redactSessionForPrivacy(mapped.payload, (0, privacySettings_1.getPrivacySettings)()),
        };
    }
    async flushState() {
        await Promise.all([this.options.outbox.flush(), this.options.stateStore.flush()]);
    }
    async refreshCredentialState() {
        try {
            const settings = this.readSettings();
            this.hasCredential = await this.options.tokenStore.has(settings.environment);
            this.notify();
        }
        catch {
            this.hasCredential = false;
        }
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
function skippedResult(error, queuedCount = 0) {
    return {
        state: 'skipped', queuedCount, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [], error,
    };
}
function redactSessionForPrivacy(payload, privacy) {
    const redacted = JSON.parse(JSON.stringify(payload));
    if (!privacy.enabled || !privacy.trackCodingActivity) {
        redacted.coding = {
            manualPercent: 0,
            aiAssistedPercent: 0,
            automationPercent: 0,
            unknownBulkEditPercent: 100,
        };
        redacted.activity = {
            edits: 0,
            saves: 0,
            filesTouched: 0,
            linesChangedEstimate: 0,
        };
    }
    if (!privacy.enabled || !privacy.trackTerminalActivity) {
        redacted.terminal = {
            totalCommands: 0,
            build: 0,
            test: 0,
            git: 0,
            packageManager: 0,
            devServer: 0,
            lint: 0,
            other: 0,
        };
    }
    if (!privacy.enabled || !privacy.trackAgentUsage) {
        redacted.ai = {
            claudeCodePrompts: 0,
            codexPrompts: 0,
            copilotPrompts: 0,
            tokenTotals: { claude: 0, codex: 0, copilot: 0 },
        };
    }
    if (!privacy.enabled || !privacy.trackBuildFailures) {
        redacted.reliability = { failures: 0, recoveredFailures: 0, recoveryRate: 100 };
    }
    return redacted;
}
function errorMessage(error) {
    const message = error instanceof Error ? error.message : 'Sprintly synchronization failed.';
    return message
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/(token|secret|password|code)\s*[:=]\s*[^\s,;]+/gi, '$1: [redacted]')
        .slice(0, 500);
}
function emptyBatchSummary(entries = []) {
    return {
        acceptedSessionIds: [],
        duplicateSessionIds: [],
        rejected: [],
        warnings: entries.flatMap((entry) => entry.compatibilityWarnings),
    };
}
function mergeBatchSummary(target, next) {
    target.acceptedSessionIds = unique([...target.acceptedSessionIds, ...next.acceptedSessionIds]);
    target.duplicateSessionIds = unique([...target.duplicateSessionIds, ...next.duplicateSessionIds]);
    const rejectedById = new Map(target.rejected.map((entry) => [entry.sessionId, entry]));
    for (const entry of next.rejected)
        rejectedById.set(entry.sessionId, entry);
    target.rejected = [...rejectedById.values()];
    target.warnings = [...target.warnings, ...next.warnings];
    if (target.error === undefined && next.error !== undefined)
        target.error = next.error;
}
function mergeBatchSummaries(left, right) {
    const merged = emptyBatchSummary();
    mergeBatchSummary(merged, left);
    mergeBatchSummary(merged, right);
    return merged;
}
function chunkEntries(entries) {
    const chunks = [];
    let current = [];
    for (const entry of entries) {
        const wouldExceedCount = current.length >= sprintlyApi_1.SPRINTLY_MAX_SESSIONS_PER_REQUEST;
        const wouldExceedBytes = current.length > 0
            && Buffer.byteLength((0, sprintlyApi_1.serializeSprintlyUploadEnvelope)([...current, entry].map((candidate) => candidate.payload)), 'utf8') > sprintlyApi_1.SPRINTLY_MAX_REQUEST_BYTES;
        if (wouldExceedCount || wouldExceedBytes) {
            chunks.push(current);
            current = [];
        }
        current.push(entry);
    }
    if (current.length)
        chunks.push(current);
    return chunks;
}
function isPayloadTooLarge(error) {
    return error instanceof sprintlyApi_1.SprintlyApiError && error.status === 413;
}
function unique(values) {
    return [...new Set(values)];
}
//# sourceMappingURL=sprintlySync.js.map