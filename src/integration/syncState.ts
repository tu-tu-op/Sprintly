export type SprintlyConnectionStatus = 'connected' | 'disconnected' | 'revoked';

export interface PersistedSyncState {
  schemaVersion: 'sprintly.sync-state.v1';
  connectionStatus: SprintlyConnectionStatus;
  lastSuccessfulSync: number | null;
  lastSyncError: string | null;
}

export interface SyncStateStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface SyncStateListener {
  dispose(): void;
}

export const SYNC_STATE_SCHEMA_VERSION = 'sprintly.sync-state.v1' as const;
export const DEFAULT_SYNC_STATE_KEY = 'sprintly.syncState.v1';

export class SyncStateStore {
  private state: PersistedSyncState;
  private persistQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private lastPersistError: unknown;

  constructor(
    private readonly storage: SyncStateStorage,
    private readonly storageKey = DEFAULT_SYNC_STATE_KEY,
  ) {
    this.state = parseState(storage.get<unknown>(storageKey));
  }

  get(): PersistedSyncState {
    return { ...this.state };
  }

  onDidChange(listener: () => void): SyncStateListener {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  markConnected(): void {
    this.update({ connectionStatus: 'connected', lastSyncError: null });
  }

  markDisconnected(): void {
    this.update({ connectionStatus: 'disconnected' });
  }

  markRevoked(error = 'The Sprintly device has been revoked.'): void {
    this.update({ connectionStatus: 'revoked', lastSyncError: sanitizeError(error) });
  }

  markSyncSucceeded(timestamp = Date.now()): void {
    this.update({
      connectionStatus: 'connected',
      lastSuccessfulSync: timestamp,
      lastSyncError: null,
    });
  }

  markSyncFailed(error: string, status: SprintlyConnectionStatus = 'disconnected'): void {
    this.update({ connectionStatus: status, lastSyncError: sanitizeError(error) });
  }

  async flush(): Promise<void> {
    await this.persistQueue;
    if (this.lastPersistError !== undefined) {
      const error = this.lastPersistError;
      this.lastPersistError = undefined;
      throw error;
    }
  }

  private update(patch: Partial<PersistedSyncState>): void {
    this.state = { ...this.state, ...patch };
    this.persistQueue = this.persistQueue
      .then(() => this.storage.update(this.storageKey, { ...this.state }))
      .then(() => undefined, (error: unknown) => {
        this.lastPersistError = error;
      });
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Status observers must never interrupt a state transition.
      }
    }
  }
}

function parseState(value: unknown): PersistedSyncState {
  if (!isRecord(value) || value.schemaVersion !== SYNC_STATE_SCHEMA_VERSION) {
    return emptyState();
  }
  const status = value.connectionStatus;
  return {
    schemaVersion: SYNC_STATE_SCHEMA_VERSION,
    connectionStatus: status === 'connected' || status === 'revoked' ? status : 'disconnected',
    lastSuccessfulSync: nullableTimestamp(value.lastSuccessfulSync),
    lastSyncError: typeof value.lastSyncError === 'string' ? sanitizeError(value.lastSyncError) : null,
  };
}

function emptyState(): PersistedSyncState {
  return {
    schemaVersion: SYNC_STATE_SCHEMA_VERSION,
    connectionStatus: 'disconnected',
    lastSuccessfulSync: null,
    lastSyncError: null,
  };
}

function nullableTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizeError(value: string): string {
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]').slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
