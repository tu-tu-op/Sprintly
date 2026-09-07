import {
  SprintlyApiClient,
  SprintlyApiError,
  SprintlyUploadResult,
  SPRINTLY_MAX_REQUEST_BYTES,
  SPRINTLY_MAX_SESSIONS_PER_REQUEST,
  serializeSprintlyUploadEnvelope,
} from './sprintlyApi';
import {
  SprintlyConnectionSettings,
  getSprintlyConnectionSettings,
} from './connectionSettings';
import {
  HttpPairingAdapter,
  PairingExchangeRequest,
  PairingDeviceType,
  SprintlyPairingAdapter,
} from './pairing';
import { SprintlyTokenStore } from './secureTokenStore';
import { SyncOutbox, SyncOutboxEntry } from './syncOutbox';
import { SprintlyConnectionStatus, SyncStateStore } from './syncState';
import { mapSessionRecord } from '../tracking/sprintlyContract';
import type { SessionHistoryRecord } from '../tracking/localSessionStore';

export interface SprintlySyncStatus {
  connectionStatus: SprintlyConnectionStatus;
  apiUrl: string;
  environment: SprintlyConnectionSettings['environment'];
  syncPreference: SprintlyConnectionSettings['syncPreference'];
  localOnly: boolean;
  leaderboardOptIn: boolean;
  pendingCount: number;
  failedCount: number;
  lastSuccessfulSync: number | null;
  lastSyncError: string | null;
  pairingRequired: boolean;
  syncDisabled: boolean;
  rejectedCount: number;
}

export type SyncOperationState = 'skipped' | 'queued' | 'synced' | 'partial' | 'failed';

export interface SyncOperationResult {
  state: SyncOperationState;
  queuedCount: number;
  syncedCount: number;
  duplicateCount: number;
  rejected: Array<{ sessionId: string; reason: string }>;
  warnings: string[];
  error?: string;
}

interface UploadBatchSummary {
  acceptedSessionIds: string[];
  duplicateSessionIds: string[];
  rejected: Array<{ sessionId: string; reason: string }>;
  warnings: string[];
  error?: string;
}

export interface SprintlySyncServiceOptions {
  tokenStore: SprintlyTokenStore;
  outbox: SyncOutbox;
  stateStore: SyncStateStore;
  readSettings?: () => SprintlyConnectionSettings;
  createClient?: (settings: SprintlyConnectionSettings, token: string | null) => SprintlyApiClient;
  pairingAdapter?: SprintlyPairingAdapter;
  createPairingAdapter?: (settings: SprintlyConnectionSettings) => SprintlyPairingAdapter;
  deviceName?: string | (() => string | Promise<string>);
  deviceType?: PairingDeviceType;
  createDeviceId?: () => string;
  now?: () => number;
}

/** Coordinates privacy policy, credentials, API calls, and the durable queue. */
export class SprintlySyncService {
  private readonly readSettings: () => SprintlyConnectionSettings;
  private readonly createClient: (settings: SprintlyConnectionSettings, token: string | null) => SprintlyApiClient;
  private readonly pairingAdapter: SprintlyPairingAdapter | undefined;
  private readonly createPairingAdapter: (settings: SprintlyConnectionSettings) => SprintlyPairingAdapter;
  private readonly deviceName: string | (() => string | Promise<string>);
  private readonly deviceType: PairingDeviceType;
  private readonly createDeviceId: (() => string) | undefined;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private syncInFlight: Promise<SyncOperationResult> | null = null;
  private inMemoryToken: string | null = null;
  private authBlocked = false;

  constructor(private readonly options: SprintlySyncServiceOptions) {
    this.readSettings = options.readSettings ?? getSprintlyConnectionSettings;
    this.createClient = options.createClient
      ?? ((settings, token) => new SprintlyApiClient({ baseUrl: settings.apiUrl, token }));
    this.pairingAdapter = options.pairingAdapter;
    this.createPairingAdapter = options.createPairingAdapter
      ?? ((settings) => new HttpPairingAdapter({ baseUrl: settings.apiUrl }));
    this.deviceName = options.deviceName ?? 'VS Code';
    this.deviceType = options.deviceType ?? 'vscode';
    this.createDeviceId = options.createDeviceId;
    this.now = options.now ?? Date.now;
    options.stateStore.onDidChange(() => this.notify());
  }

  getStatus(): SprintlySyncStatus {
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
      pairingRequired: this.authBlocked,
      syncDisabled: state.syncDisabled,
      rejectedCount: this.options.outbox.rejectedCount(),
    };
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async testConnection(): Promise<void> {
    const settings = this.readSettings();
    try {
      await this.createClient(settings, null).health();
      this.options.stateStore.markConnected(!this.options.stateStore.get().syncDisabled);
      await this.flushState();
    } catch (error) {
      this.options.stateStore.markSyncFailed(errorMessage(error));
      await this.flushState();
      throw error;
    }
  }

  async connectDevelopment(): Promise<void> {
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
      this.authBlocked = false;
      this.options.stateStore.markConnected();
      await this.flushState();
    } catch (error) {
      this.options.stateStore.markSyncFailed(errorMessage(error));
      await this.flushState();
      throw error;
    }
  }

  async connectWithPairingCode(code: string): Promise<void> {
    const settings = this.readSettings();
    if (settings.environment !== 'production') {
      throw new Error('Pairing is available only when sprintly.apiEnvironment is production.');
    }
    const normalizedCode = code.trim();
    if (!normalizedCode) throw new Error('A pairing code is required.');
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
      } satisfies PairingExchangeRequest);
      await this.options.tokenStore.storeDeviceToken(response.token);
      this.inMemoryToken = response.token;
      this.authBlocked = false;
      this.options.stateStore.markConnected();
      await this.flushState();
    } catch (error) {
      this.options.stateStore.markSyncFailed(errorMessage(error));
      await this.flushState();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.options.tokenStore.clear();
    this.inMemoryToken = null;
    this.authBlocked = false;
    this.options.stateStore.markDisconnected();
    await this.flushState();
  }

  async setDevelopmentToken(token: string): Promise<void> {
    await this.options.tokenStore.storeDevelopmentToken(token);
    this.inMemoryToken = null;
    this.authBlocked = false;
    this.options.stateStore.markDisconnected();
    await this.flushState();
  }

  async eraseLocalData(): Promise<void> {
    await this.options.tokenStore.clear();
    this.inMemoryToken = null;
    this.authBlocked = false;
    this.options.outbox.clear();
    this.options.stateStore.markDisconnected();
    await this.flushState();
  }

  async clearQueuedSessions(): Promise<void> {
    this.options.outbox.clear();
    await this.options.outbox.flush();
    this.notify();
  }

  /** Queue and immediately attempt a user-selected session. */
  async syncCurrentSession(record: SessionHistoryRecord): Promise<SyncOperationResult> {
    return this.queueAndSync(record, true);
  }

  /** Queue a completed session only when the completed-session policy is active. */
  async syncCompletedSession(record: SessionHistoryRecord): Promise<SyncOperationResult> {
    return this.queueAndSync(record, false);
  }

  /** Upload due entries; manual invocations also retry failed entries immediately. */
  async syncPendingSessions(manual = true): Promise<SyncOperationResult> {
    const settings = this.readSettings();
    const blocked = this.sessionUploadPolicy(settings, manual);
    if (blocked) return blocked;
    const state = this.options.stateStore.get();
    if (state.syncDisabled && !manual) {
      return failedResult(
        state.syncDisabledReason ?? 'Website synchronization is disabled in Sprintly Settings.',
        this.options.outbox.pendingCount(),
      );
    }
    if (manual) {
      this.options.stateStore.clearSyncDisabled();
      this.options.outbox.retryFailed();
      this.notify();
    }
    const entries = this.options.outbox.list().filter((entry) => {
      if (entry.state !== 'pending') return false;
      return manual || entry.nextRetryTime === null || entry.nextRetryTime <= this.now();
    });
    return this.syncEntries(entries);
  }

  /** Called at activation and after connectivity returns. */
  async resume(): Promise<SyncOperationResult> {
    const settings = this.readSettings();
    if (settings.syncPreference === 'never' || settings.syncPreference === 'leaderboard') {
      return this.sessionUploadPolicy(settings, false) ?? emptyResult('skipped');
    }
    const state = this.options.stateStore.get();
    if (state.syncDisabled) {
      return failedResult(
        state.syncDisabledReason ?? 'Website synchronization is disabled in Sprintly Settings.',
        this.options.outbox.pendingCount(),
      );
    }
    const entries = this.options.outbox.due(this.now());
    return this.syncEntries(entries);
  }

  async flush(): Promise<void> {
    await Promise.all([this.options.outbox.flush(), this.options.stateStore.flush()]);
  }

  private async queueAndSync(
    record: SessionHistoryRecord,
    explicit: boolean,
  ): Promise<SyncOperationResult> {
    const settings = this.readSettings();
    const blocked = this.sessionUploadPolicy(settings, explicit);
    if (blocked) return blocked;
    let mapped;
    try {
      mapped = mapSessionRecord(record);
    } catch (error) {
      const message = errorMessage(error);
      this.options.stateStore.markSyncFailed(message);
      await this.flushState();
      return failedResult(message);
    }
    let entry: SyncOutboxEntry;
    try {
      entry = this.options.outbox.enqueue(
        mapped.payload,
        mapped.warnings.map((warning) => `${warning.field}: ${warning.message}`),
        explicit,
      );
    } catch (error) {
      const message = errorMessage(error);
      this.options.stateStore.markSyncFailed(message);
      await this.flushState();
      return failedResult(message);
    }
    this.notify();
    const result = await this.syncEntries([entry]);
    result.queuedCount = 1;
    result.warnings = mapped.warnings.map((warning) => `${warning.field}: ${warning.message}`);
    return result;
  }

  private syncEntries(entries: readonly SyncOutboxEntry[]): Promise<SyncOperationResult> {
    if (this.syncInFlight) return this.syncInFlight;
    const operation = this.performSyncEntries(entries);
    this.syncInFlight = operation;
    void operation.then(
      () => {
        if (this.syncInFlight === operation) this.syncInFlight = null;
      },
      () => {
        if (this.syncInFlight === operation) this.syncInFlight = null;
      },
    );
    return operation;
  }

  private async performSyncEntries(entries: readonly SyncOutboxEntry[]): Promise<SyncOperationResult> {
    if (!entries.length) {
      return emptyResult('queued');
    }
    const settings = this.readSettings();
    const state = this.options.stateStore.get();
    if (state.syncDisabled) {
      const message = state.syncDisabledReason
        ?? 'Website synchronization is disabled in Sprintly Settings.';
      return failedResult(message, entries.length);
    }
    if (this.authBlocked) {
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
      if (result.error) break;
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
    } else if (!total.error || this.options.stateStore.get().lastSyncError === null) {
      this.options.stateStore.markSyncFailed(
        total.error
          ?? (total.rejected.length
            ? total.rejected.map((entry) => `${entry.sessionId}: ${entry.reason}`).join('; ')
            : 'The website returned an incomplete upload result.'),
      );
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

  private async uploadChunk(
    settings: SprintlyConnectionSettings,
    token: string,
    entries: readonly SyncOutboxEntry[],
  ): Promise<UploadBatchSummary> {
    const syncing = entries
      .map((entry) => this.options.outbox.begin(entry.sessionId, this.now()))
      .filter((entry): entry is SyncOutboxEntry => entry !== null && entry.state === 'syncing');
    if (!syncing.length) return emptyBatchSummary(entries);
    this.notify();
    return this.uploadSyncingChunk(settings, token, syncing);
  }

  private async uploadSyncingChunk(
    settings: SprintlyConnectionSettings,
    token: string,
    entries: readonly SyncOutboxEntry[],
  ): Promise<UploadBatchSummary> {
    try {
      const response = await this.createClient(settings, token).uploadSessions(entries.map((entry) => entry.payload));
      return this.applyUploadResult(entries, response);
    } catch (error) {
      if (isPayloadTooLarge(error) && entries.length > 1) {
        // The server may apply a stricter byte calculation than the client.
        // Return these entries to pending before trying bounded sub-batches.
        for (const entry of entries) this.options.outbox.releaseSyncing(entry.sessionId);
        const midpoint = Math.ceil(entries.length / 2);
        const left = await this.uploadChunk(settings, token, entries.slice(0, midpoint));
        if (left.error) return left;
        const right = await this.uploadChunk(settings, token, entries.slice(midpoint));
        return mergeBatchSummaries(left, right);
      }
      return this.applyUploadError(entries, error);
    }
  }

  private applyUploadResult(
    entries: readonly SyncOutboxEntry[],
    response: SprintlyUploadResult,
  ): UploadBatchSummary {
    const entryIds = new Set(entries.map((entry) => entry.sessionId));
    const accepted = new Set(response.acceptedSessionIds.filter((id) => entryIds.has(id)));
    const duplicates = new Set(response.duplicateSessionIds.filter((id) => entryIds.has(id)));
    const rejectionById = new Map(
      response.rejected
        .filter((entry) => entryIds.has(entry.sessionId))
        .map((entry) => [entry.sessionId, entry.reason]),
    );
    const rejected: Array<{ sessionId: string; reason: string }> = [];
    for (const entry of entries) {
      if (accepted.has(entry.sessionId) || duplicates.has(entry.sessionId)) {
        this.options.outbox.markSynced(entry.sessionId);
      } else {
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

  private applyUploadError(
    entries: readonly SyncOutboxEntry[],
    error: unknown,
  ): UploadBatchSummary {
    const apiError = error instanceof SprintlyApiError ? error : null;
    const message = errorMessage(error);
    const rejectionById = new Map(
      (apiError?.rejected ?? []).map((entry) => [entry.sessionId, entry.reason]),
    );
    const rejected: Array<{ sessionId: string; reason: string }> = [];
    for (const entry of entries) {
      const rejection = rejectionById.get(entry.sessionId);
      this.options.outbox.markFailed(
        entry.sessionId,
        rejection ?? message,
        apiError?.kind === 'unauthorized' || apiError?.kind === 'revoked-device'
          ? false
          : apiError?.retryable ?? true,
        this.now(),
      );
      if (rejection) rejected.push({ sessionId: entry.sessionId, reason: rejection });
    }
    if (apiError?.kind === 'sync-disabled') {
      this.options.stateStore.markSyncDisabled(message);
    } else if (apiError?.kind === 'revoked-device') {
      this.inMemoryToken = null;
      this.authBlocked = true;
      this.options.stateStore.markRevoked(message);
    } else if (apiError?.kind === 'unauthorized') {
      // A 401 disables this process' uploader. The persisted SecretStorage
      // value is deliberately left untouched until the user explicitly
      // disconnects or completes a new pairing.
      this.inMemoryToken = null;
      this.authBlocked = true;
      this.options.stateStore.markSyncFailed(message);
    } else {
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

  private sessionUploadPolicy(
    settings: SprintlyConnectionSettings,
    explicit: boolean,
  ): SyncOperationResult | null {
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

  private async flushState(): Promise<void> {
    await Promise.all([this.options.outbox.flush(), this.options.stateStore.flush()]);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // UI observers cannot interrupt synchronization.
      }
    }
  }
}

function emptyResult(state: SyncOperationState): SyncOperationResult {
  return { state, queuedCount: 0, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [] };
}

function failedResult(error: string, queuedCount = 0): SyncOperationResult {
  return {
    state: 'failed', queuedCount, syncedCount: 0, duplicateCount: 0, rejected: [], warnings: [], error,
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Sprintly synchronization failed.';
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password|code)\s*[:=]\s*[^\s,;]+/gi, '$1: [redacted]')
    .slice(0, 500);
}

function emptyBatchSummary(entries: readonly SyncOutboxEntry[] = []): UploadBatchSummary {
  return {
    acceptedSessionIds: [],
    duplicateSessionIds: [],
    rejected: [],
    warnings: entries.flatMap((entry) => entry.compatibilityWarnings),
  };
}

function mergeBatchSummary(target: UploadBatchSummary, next: UploadBatchSummary): void {
  target.acceptedSessionIds = unique([...target.acceptedSessionIds, ...next.acceptedSessionIds]);
  target.duplicateSessionIds = unique([...target.duplicateSessionIds, ...next.duplicateSessionIds]);
  const rejectedById = new Map(target.rejected.map((entry) => [entry.sessionId, entry]));
  for (const entry of next.rejected) rejectedById.set(entry.sessionId, entry);
  target.rejected = [...rejectedById.values()];
  target.warnings = [...target.warnings, ...next.warnings];
  if (target.error === undefined && next.error !== undefined) target.error = next.error;
}

function mergeBatchSummaries(left: UploadBatchSummary, right: UploadBatchSummary): UploadBatchSummary {
  const merged = emptyBatchSummary();
  mergeBatchSummary(merged, left);
  mergeBatchSummary(merged, right);
  return merged;
}

function chunkEntries(entries: readonly SyncOutboxEntry[]): SyncOutboxEntry[][] {
  const chunks: SyncOutboxEntry[][] = [];
  let current: SyncOutboxEntry[] = [];
  for (const entry of entries) {
    const wouldExceedCount = current.length >= SPRINTLY_MAX_SESSIONS_PER_REQUEST;
    const wouldExceedBytes = current.length > 0
      && Buffer.byteLength(
        serializeSprintlyUploadEnvelope([...current, entry].map((candidate) => candidate.payload)),
        'utf8',
      ) > SPRINTLY_MAX_REQUEST_BYTES;
    if (wouldExceedCount || wouldExceedBytes) {
      chunks.push(current);
      current = [];
    }
    current.push(entry);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function isPayloadTooLarge(error: unknown): boolean {
  return error instanceof SprintlyApiError && error.status === 413;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
