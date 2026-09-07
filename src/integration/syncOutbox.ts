import {
  SprintlySessionContract,
  validateSprintlySession,
} from '../tracking/sprintlyContract';

export type SyncOutboxState = 'pending' | 'syncing' | 'synced' | 'failed';
export type SessionSyncStatus = 'local' | 'pending' | 'synced' | 'rejected';

export interface SyncOutboxEntry {
  sessionId: string;
  payload: SprintlySessionContract;
  state: SyncOutboxState;
  attemptCount: number;
  lastAttemptTime: number | null;
  nextRetryTime: number | null;
  lastError: string | null;
  compatibilityWarnings: string[];
}

export interface SyncOutboxStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface SyncOutboxOptions {
  storageKey?: string;
  now?: () => number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  maxEntries?: number;
  jitterRatio?: number;
  random?: () => number;
  onError?: (error: unknown) => void;
}

interface PersistedOutbox {
  schemaVersion: 'sprintly.sync-outbox.v1';
  entries: SyncOutboxEntry[];
}

export const SYNC_OUTBOX_SCHEMA_VERSION = 'sprintly.sync-outbox.v1' as const;
export const DEFAULT_SYNC_OUTBOX_KEY = 'sprintly.syncOutbox.v1';
const DEFAULT_RETRY_BASE_MS = 60_000;
const DEFAULT_RETRY_MAX_MS = 3_600_000;
const DEFAULT_MAX_ENTRIES = 1_000;
const DEFAULT_JITTER_RATIO = 0.2;

/** Durable, aggregate-only upload queue. No token or local path is persisted. */
export class SyncOutbox {
  private entries: SyncOutboxEntry[];
  private persistQueue: Promise<void> = Promise.resolve();
  private lastPersistError: unknown;
  private readonly storageKey: string;
  private readonly now: () => number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly maxEntries: number;
  private readonly jitterRatio: number;
  private readonly random: () => number;
  private readonly onPersistError: ((error: unknown) => void) | undefined;

  constructor(
    private readonly storage: SyncOutboxStorage,
    options: SyncOutboxOptions = {},
  ) {
    this.storageKey = options.storageKey ?? DEFAULT_SYNC_OUTBOX_KEY;
    this.now = options.now ?? Date.now;
    this.retryBaseMs = positiveInteger(options.retryBaseMs, DEFAULT_RETRY_BASE_MS);
    this.retryMaxMs = Math.max(this.retryBaseMs, positiveInteger(options.retryMaxMs, DEFAULT_RETRY_MAX_MS));
    this.maxEntries = positiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);
    this.jitterRatio = boundedRatio(options.jitterRatio, DEFAULT_JITTER_RATIO);
    this.random = options.random ?? Math.random;
    this.onPersistError = options.onError;
    this.entries = readPersistedEntries(storage.get<unknown>(this.storageKey)).slice(0, this.maxEntries);
    // A process can die while an entry is syncing. It is safe to replay it;
    // the website uses sessionId for idempotency.
    let recovered = false;
    this.entries = this.entries.map((entry) => {
      if (entry.state !== 'syncing') return entry;
      recovered = true;
      return { ...entry, state: 'pending', nextRetryTime: null };
    });
    if (recovered) this.persist();
  }

  list(): readonly SyncOutboxEntry[] {
    return this.entries.map(cloneEntry);
  }

  get(sessionId: string): SyncOutboxEntry | null {
    const entry = this.entries.find((candidate) => candidate.sessionId === sessionId);
    return entry ? cloneEntry(entry) : null;
  }

  pendingCount(): number {
    return this.entries.filter((entry) => entry.state === 'pending' || entry.state === 'syncing').length;
  }

  failedCount(): number {
    return this.entries.filter((entry) => entry.state === 'failed').length;
  }

  rejectedCount(): number {
    return this.failedCount();
  }

  getSessionStatus(sessionId: string): SessionSyncStatus {
    const entry = this.entries.find((candidate) => candidate.sessionId === sessionId);
    if (!entry) return 'local';
    if (entry.state === 'synced') return 'synced';
    if (entry.state === 'failed') return 'rejected';
    return 'pending';
  }

  due(now = this.now()): SyncOutboxEntry[] {
    return this.entries
      .filter((entry) => entry.state === 'pending' && (entry.nextRetryTime === null || entry.nextRetryTime <= now))
      .map(cloneEntry);
  }

  enqueue(
    payload: SprintlySessionContract,
    compatibilityWarnings: readonly string[] = [],
    force = false,
  ): SyncOutboxEntry {
    const validation = validateSprintlySession(payload);
    if (!validation.ok) {
      throw new Error(`Cannot queue invalid session: ${validation.errors.join('; ')}`);
    }
    const existingIndex = this.entries.findIndex((entry) => entry.sessionId === payload.sessionId);
    const existing = existingIndex >= 0 ? this.entries[existingIndex] : undefined;
    if (existing?.state === 'synced' && !force) return cloneEntry(existing);
    if (existingIndex < 0 && this.entries.length >= this.maxEntries) {
      this.pruneSyncedEntries();
      if (this.entries.length >= this.maxEntries) {
        throw new Error('Sprintly sync queue is full. Sync or clear existing queued sessions first.');
      }
    }
    const next: SyncOutboxEntry = {
      sessionId: payload.sessionId,
      payload: clonePayload(payload),
      state: 'pending',
      attemptCount: existing && force ? 0 : existing?.attemptCount ?? 0,
      lastAttemptTime: existing && force ? null : existing?.lastAttemptTime ?? null,
      nextRetryTime: null,
      lastError: null,
      compatibilityWarnings: [...compatibilityWarnings],
    };
    if (existingIndex >= 0) this.entries[existingIndex] = next;
    else this.entries.push(next);
    this.persist();
    return cloneEntry(next);
  }

  begin(sessionId: string, now = this.now()): SyncOutboxEntry | null {
    const entry = this.entries.find((candidate) => candidate.sessionId === sessionId);
    if (!entry || entry.state === 'synced') return entry ? cloneEntry(entry) : null;
    entry.state = 'syncing';
    entry.attemptCount += 1;
    entry.lastAttemptTime = now;
    entry.nextRetryTime = null;
    this.persist();
    return cloneEntry(entry);
  }

  /** Return a server-rejected batch to pending when a 413 is being split. */
  releaseSyncing(sessionId: string): SyncOutboxEntry | null {
    const entry = this.entries.find((candidate) => candidate.sessionId === sessionId);
    if (!entry || entry.state !== 'syncing') return entry ? cloneEntry(entry) : null;
    entry.state = 'pending';
    entry.nextRetryTime = null;
    this.persist();
    return cloneEntry(entry);
  }

  markSynced(sessionId: string): SyncOutboxEntry | null {
    const entry = this.entries.find((candidate) => candidate.sessionId === sessionId);
    if (!entry) return null;
    entry.state = 'synced';
    entry.nextRetryTime = null;
    entry.lastError = null;
    this.persist();
    return cloneEntry(entry);
  }

  markFailed(
    sessionId: string,
    error: string,
    retryable: boolean,
    now = this.now(),
  ): SyncOutboxEntry | null {
    const entry = this.entries.find((candidate) => candidate.sessionId === sessionId);
    if (!entry) return null;
    entry.lastError = sanitizeError(error);
    if (retryable) {
      entry.state = 'pending';
      entry.nextRetryTime = now + this.retryDelay(entry.attemptCount);
    } else {
      entry.state = 'failed';
      entry.nextRetryTime = null;
    }
    this.persist();
    return cloneEntry(entry);
  }

  retryFailed(sessionId?: string): number {
    let changed = 0;
    for (const entry of this.entries) {
      if (entry.state !== 'failed' || (sessionId !== undefined && entry.sessionId !== sessionId)) continue;
      entry.state = 'pending';
      entry.nextRetryTime = null;
      entry.lastError = null;
      changed += 1;
    }
    if (changed) this.persist();
    return changed;
  }

  clear(): void {
    this.entries = [];
    this.persist(true);
  }

  async flush(): Promise<void> {
    await this.persistQueue;
    if (this.lastPersistError !== undefined) {
      const error = this.lastPersistError;
      this.lastPersistError = undefined;
      throw error;
    }
  }

  dispose(): void {}

  private retryDelay(attemptCount: number): number {
    const exponent = Math.max(0, Math.min(30, attemptCount - 1));
    const exponential = Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** exponent));
    const sample = this.random();
    const random = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0.5;
    const jittered = exponential * (1 + ((random * 2) - 1) * this.jitterRatio);
    return Math.max(1, Math.min(this.retryMaxMs, Math.round(jittered)));
  }

  private pruneSyncedEntries(): void {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.state !== 'synced');
    if (this.entries.length !== before) this.persist();
  }

  private persist(force = false): void {
    const snapshot: PersistedOutbox = {
      schemaVersion: SYNC_OUTBOX_SCHEMA_VERSION,
      entries: this.entries.map(cloneEntry),
    };
    this.persistQueue = this.persistQueue
      .then(() => this.storage.update(this.storageKey, snapshot))
      .then(() => undefined, (error: unknown) => {
        this.lastPersistError = error;
        try {
          this.onPersistError?.(error);
        } catch {
          // Persistence observers must not break the queue.
        }
      });
    // `force` documents privacy clears and intentionally keeps the same
    // serialized path as ordinary state transitions.
    void force;
  }
}

function readPersistedEntries(value: unknown): SyncOutboxEntry[] {
  if (!isRecord(value) || value.schemaVersion !== SYNC_OUTBOX_SCHEMA_VERSION || !Array.isArray(value.entries)) {
    return [];
  }
  return value.entries.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.sessionId !== 'string') return [];
    const validation = validateSprintlySession(entry.payload);
    if (!validation.ok) return [];
    if (validation.value.sessionId !== entry.sessionId) return [];
    const state = entry.state;
    if (state !== 'pending' && state !== 'syncing' && state !== 'synced' && state !== 'failed') return [];
    return [{
      sessionId: entry.sessionId,
      payload: clonePayload(validation.value),
      state,
      attemptCount: nonNegativeInteger(entry.attemptCount),
      lastAttemptTime: nullableTimestamp(entry.lastAttemptTime),
      nextRetryTime: nullableTimestamp(entry.nextRetryTime),
      lastError: typeof entry.lastError === 'string' ? sanitizeError(entry.lastError) : null,
      compatibilityWarnings: Array.isArray(entry.compatibilityWarnings)
        ? entry.compatibilityWarnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 20)
        : [],
    }];
  });
}

function cloneEntry(entry: SyncOutboxEntry): SyncOutboxEntry {
  return {
    ...entry,
    payload: clonePayload(entry.payload),
    compatibilityWarnings: [...entry.compatibilityWarnings],
  };
}

function clonePayload(payload: SprintlySessionContract): SprintlySessionContract {
  return JSON.parse(JSON.stringify(payload)) as SprintlySessionContract;
}

function sanitizeError(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password|code)\s*[:=]\s*[^\s,;]+/gi, '$1: [redacted]')
    .slice(0, 500);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function boundedRatio(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

function nullableTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
