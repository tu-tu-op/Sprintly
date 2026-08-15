import * as vscode from 'vscode';
import { DailySprintlyState, SessionPauseInterval } from './dailyStateStore';
import {
  calculateDeveloperMetrics,
  calculateSessionScore,
  DeveloperMetricInput,
  DeveloperMetrics,
  SessionScore,
} from './developerMetrics';
import { getPrivacySettings, SprintlyPrivacySettings } from './privacySettings';
import { aggregateSessions, AggregationPeriod, SessionAggregation } from './sessionAggregation';
import { TerminalCommandCounts, emptyTerminalCommandCounts } from './terminalCommands';
import {
  clampPercent,
  DEVSTRAVA_EXPORT_SCHEMA_VERSION,
  DEVSTRAVA_SESSION_SCHEMA_VERSION,
  DevStravaAggregateMetadata,
  DevStravaExportPayload,
  DevStravaSessionContract,
  isoDate,
  validateSessionContract,
} from './sessionSchema';
import { SessionStats } from '../sessionTracker';

export interface SessionHistoryRecord {
  schemaVersion: typeof DEVSTRAVA_SESSION_SCHEMA_VERSION;
  /** Numeric alias retained for local migrations from the pre-contract store. */
  version: 1;
  id: string;
  startedAt: number;
  endedAt: number;
  activeDurationMs: number;
  pauses: SessionPauseInterval[];
  coding: {
    manualMs: number;
    aiAssistedMs: number;
    automationMs: number;
    unknownBulkMs: number;
  };
  edits: number;
  linesChanged: number;
  fileSaves: number;
  fileSwitches: number;
  filesTouched: number;
  terminalOpens: number;
  terminalCommands: number;
  terminalCommandsByCategory: TerminalCommandCounts;
  agentPrompts: DailySprintlyState['agentPrompts'];
  tokenStats: DailySprintlyState['tokenStats'];
  buildFailures: DailySprintlyState['buildFailures'];
  archetype: string;
  traits: string[];
  metrics: DeveloperMetrics;
  scores: SessionScore;
  /** Drafts are persisted separately and never returned by list(). */
  completed: boolean;
}

export type SessionHistoryRecordPatch = Partial<Omit<SessionHistoryRecord, 'id' | 'schemaVersion' | 'version'>>;

export interface LocalSessionStoreOptions {
  retention?: number;
  storageKey?: string;
  legacyStorageKey?: string;
  now?: () => number;
}

export interface AggregateSyncPayload {
  schemaVersion: typeof DEVSTRAVA_SESSION_SCHEMA_VERSION;
  generatedAt: number;
  cloudSyncEnabled: boolean;
  sessions: DevStravaSessionContract[];
}

interface PersistedLocalStore {
  schemaVersion: 'devstrava.local-store.v1';
  sessions: SessionHistoryRecord[];
  drafts: SessionHistoryRecord[];
}

const LOCAL_STORE_SCHEMA_VERSION = 'devstrava.local-store.v1' as const;
const DEFAULT_RETENTION = 100;
const DEFAULT_STORAGE_KEY = 'devstrava.localSessionStore.v1';
const LEGACY_STORAGE_KEY = 'sprintly.sessionHistory.v1';

/**
 * The canonical local owner of completed DevStrava sessions.  VS Code's
 * workspaceState is supplied by the activation layer, so separate workspaces
 * do not share private session history.
 */
export class LocalSessionStore implements vscode.Disposable {
  private records: SessionHistoryRecord[];
  private drafts: SessionHistoryRecord[];
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly retentionOverride: number | undefined;
  private readonly now: () => number;
  private readonly storageKey: string;
  private readonly legacyStorageKey: string;

  constructor(
    private readonly storage: vscode.Memento,
    options: LocalSessionStoreOptions | number = {},
  ) {
    const normalizedOptions = typeof options === 'number' ? { retention: options } : options;
    this.retentionOverride = normalizedOptions.retention === undefined
      ? undefined
      : normalizedRetention(normalizedOptions.retention);
    this.now = normalizedOptions.now ?? Date.now;
    this.storageKey = normalizedOptions.storageKey ?? DEFAULT_STORAGE_KEY;
    this.legacyStorageKey = normalizedOptions.legacyStorageKey ?? LEGACY_STORAGE_KEY;
    const parsed = parsePersistedStore(
      storage.get<unknown>(this.storageKey),
      storage.get<unknown>(this.legacyStorageKey),
    );
    this.records = parsed.sessions.slice(0, this.retention);
    this.drafts = parsed.drafts;
  }

  list(): readonly SessionHistoryRecord[] {
    return this.records
      .filter((record) => record.completed)
      .sort(compareNewest)
      .slice(0, this.retention)
      .map(cloneRecord);
  }

  /** Apply a changed historyRetention setting without rewriting session data. */
  applyRetention(): void {
    const next = this.records.sort(compareNewest).slice(0, this.retention);
    if (next.length !== this.records.length) {
      this.records = next;
      this.persist();
    }
  }

  get(id: string): SessionHistoryRecord | null {
    const record = this.drafts.find((candidate) => candidate.id === id)
      ?? this.records.find((candidate) => candidate.id === id);
    return record ? cloneRecord(record) : null;
  }

  /** Create a durable draft and return its stable session id. */
  create(initial: Partial<SessionHistoryRecord> & { id?: string; startedAt?: number } = {}): string {
    const startedAt = safeTimestamp(initial.startedAt, this.now());
    const id = validId(initial.id) ? initial.id : createSessionId(startedAt);
    if (this.get(id)) {
      return id;
    }
    const draft = normalizeRecord({
      ...createEmptyRecord(id, startedAt),
      ...initial,
      id,
      startedAt,
      endedAt: initial.endedAt ?? startedAt,
      completed: false,
    }, false);
    this.drafts = [draft, ...this.drafts.filter((record) => record.id !== id)];
    this.persist();
    return id;
  }

  /** Update either a draft or an already-completed record without duplicating it. */
  update(id: string, patch: SessionHistoryRecordPatch): SessionHistoryRecord | null {
    const draftIndex = this.drafts.findIndex((record) => record.id === id);
    if (draftIndex >= 0) {
      const next = normalizeRecord(mergeRecord(this.drafts[draftIndex], patch), false);
      this.drafts[draftIndex] = next;
      this.persist();
      return cloneRecord(next);
    }
    const recordIndex = this.records.findIndex((record) => record.id === id);
    if (recordIndex < 0) {
      return null;
    }
    const next = normalizeRecord(mergeRecord(this.records[recordIndex], patch), true);
    this.records[recordIndex] = next;
    this.records.sort(compareNewest);
    this.persist();
    return cloneRecord(next);
  }

  /** Persist the latest aggregate snapshot without making an active session visible in list(). */
  upsertDraft(record: SessionHistoryRecord): void {
    const draft = normalizeRecord({ ...record, completed: false }, false);
    this.drafts = [draft, ...this.drafts.filter((candidate) => candidate.id !== draft.id)];
    this.persist();
  }

  /**
   * Mark a draft complete. Repeating complete() for the same id is idempotent,
   * which protects against stop-command retries and extension shutdown races.
   */
  complete(id: string, patch: SessionHistoryRecordPatch = {}): SessionHistoryRecord | null {
    const draft = this.drafts.find((record) => record.id === id);
    if (draft) {
      const completed = normalizeRecord({
        ...mergeRecord(draft, patch),
        completed: true,
        endedAt: patch.endedAt ?? Math.max(draft.startedAt, this.now()),
      }, true);
      this.drafts = this.drafts.filter((record) => record.id !== id);
      this.records = [completed, ...this.records.filter((record) => record.id !== id)]
        .sort(compareNewest)
        .slice(0, this.retention);
      this.persist();
      return cloneRecord(completed);
    }

    const existing = this.records.find((record) => record.id === id);
    return existing ? cloneRecord(existing) : null;
  }

  append(record: SessionHistoryRecord): void {
    const normalized = normalizeRecord({ ...record, completed: true }, true);
    const draft = this.drafts.some((candidate) => candidate.id === normalized.id);
    if (draft) {
      this.complete(normalized.id, normalized);
      return;
    }
    this.records = [normalized, ...this.records.filter((candidate) => candidate.id !== normalized.id)]
      .sort(compareNewest)
      .slice(0, this.retention);
    this.persist();
  }

  delete(id: string): boolean {
    const before = this.records.length + this.drafts.length;
    this.records = this.records.filter((record) => record.id !== id);
    this.drafts = this.drafts.filter((record) => record.id !== id);
    const changed = before !== this.records.length + this.drafts.length;
    if (changed) this.persist(true);
    return changed;
  }

  clear(): void {
    this.records = [];
    this.drafts = [];
    // Clearing is a privacy action and must persist even when recording has
    // just been disabled.
    this.persist(true);
  }

  getAggregates(period: AggregationPeriod = 'all', now = this.now()): SessionAggregation {
    return aggregateSessions(this.list(), period, now);
  }

  export(now = this.now()): DevStravaExportPayload {
    const privacy = getPrivacySettings();
    const records = this.list();
    return {
      schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
      exportVersion: DEVSTRAVA_EXPORT_SCHEMA_VERSION,
      exportedAt: isoDate(now),
      sessions: records.map(toSessionContract),
      aggregates: {
        today: toAggregateMetadata(this.getAggregates('today', now)),
        week: toAggregateMetadata(this.getAggregates('week', now)),
        month: toAggregateMetadata(this.getAggregates('month', now)),
        all: toAggregateMetadata(this.getAggregates('all', now)),
      },
      scoring: { devScoreVersion: 1 },
      settings: {
        localHistoryEnabled: privacy.localHistoryEnabled,
        historyRetention: this.retention,
        telemetryCategories: {
          codingActivity: privacy.trackCodingActivity,
          agentUsage: privacy.trackAgentUsage,
          buildFailures: privacy.trackBuildFailures,
        },
        aiTracking: privacy.aiTrackingVisible,
      },
    };
  }

  /** Import is synchronous in memory; persistence is queued like all store writes. */
  import(payload: unknown, mode: 'merge' | 'replace' = 'merge'): number {
    const imported = parseImportPayload(payload);
    if (!getPrivacySettings().localHistoryEnabled) {
      throw new Error('Local history is disabled in Sprintly settings.');
    }

    const incoming = imported.map((record) => normalizeRecord({ ...record, completed: true }, true));
    if (mode === 'replace') {
      this.records = incoming.slice(0, this.retention).sort(compareNewest);
    } else {
      const byId = new Map<string, SessionHistoryRecord>(this.records.map((record) => [record.id, record]));
      for (const record of incoming) {
        const existing = byId.get(record.id);
        if (!existing || record.endedAt >= existing.endedAt) {
          byId.set(record.id, record);
        }
      }
      this.records = [...byId.values()].sort(compareNewest).slice(0, this.retention);
    }
    this.persist();
    return incoming.length;
  }

  exportAggregatePayload(): AggregateSyncPayload {
    return createAggregateSyncPayload(this.list(), getPrivacySettings());
  }

  /** Finalize a draft after a process restart without inventing missing counters. */
  recoverInterruptedSession(id: string, endedAt: number): SessionHistoryRecord | null {
    const record = this.get(id);
    if (!record || record.completed) return record;
    return this.complete(id, { endedAt: Math.max(record.startedAt, endedAt) });
  }

  dispose(): void {}

  private get retention(): number {
    return this.retentionOverride ?? readRetention();
  }

  private persist(force = false): void {
    if (!force && !getPrivacySettings().localHistoryEnabled) {
      return;
    }
    const snapshot: PersistedLocalStore = {
      schemaVersion: LOCAL_STORE_SCHEMA_VERSION,
      sessions: this.records.map(cloneRecord),
      drafts: this.drafts.map(cloneRecord),
    };
    this.persistQueue = this.persistQueue
      .then(() => this.storage.update(this.storageKey, snapshot))
      .then(() => undefined, () => undefined);
  }
}

/** Backward-compatible name used by the original active command wiring. */
export class SessionHistoryStore extends LocalSessionStore {}

export function createAggregateSyncPayload(
  records: readonly SessionHistoryRecord[],
  settings: Pick<SprintlyPrivacySettings, 'cloudSyncEnabled'>,
  generatedAt = Date.now(),
): AggregateSyncPayload {
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    generatedAt,
    cloudSyncEnabled: settings.cloudSyncEnabled,
    sessions: records.map(toSessionContract),
  };
}

export function buildSessionHistoryRecord(
  state: Readonly<DailySprintlyState>,
  trackerStats: Readonly<SessionStats>,
  archetype: string,
  traits: string[],
  metrics: DeveloperMetrics,
  endedAt: number,
  completed = true,
): SessionHistoryRecord | null {
  const session = state.session;
  if (!session.id || session.startedAt === null) {
    return null;
  }
  const safeEndedAt = Math.max(session.startedAt, safeTimestamp(endedAt, Date.now()));
  const metricInput = metricInputFromState(state, trackerStats, safeEndedAt);
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    version: 1,
    id: session.id,
    startedAt: session.startedAt,
    endedAt: safeEndedAt,
    activeDurationMs: resolveActiveDurationMs(state, trackerStats, safeEndedAt),
    pauses: session.pauses.map((pause) => ({ ...pause })),
    coding: {
      manualMs: safeNumber(session.manualMs ?? session.hardcodeMs),
      aiAssistedMs: safeNumber(session.aiAssistedMs ?? session.vibecodeMs),
      automationMs: safeNumber(session.automationMs),
      unknownBulkMs: safeNumber(session.unknownBulkMs),
    },
    edits: safeNumber(trackerStats.fileEdits),
    linesChanged: safeNumber(trackerStats.linesChanged),
    fileSaves: safeNumber(trackerStats.fileSaves),
    fileSwitches: safeNumber(trackerStats.fileSwitches),
    filesTouched: trackerStats.activeFiles.size,
    terminalOpens: safeNumber(trackerStats.terminalOpens),
    terminalCommands: safeNumber(trackerStats.terminalCommands),
    terminalCommandsByCategory: normalizeTerminalCounts(trackerStats.terminalCommandsByCategory),
    agentPrompts: { ...state.agentPrompts },
    tokenStats: cloneTokenStats(state.tokenStats),
    buildFailures: cloneBuildFailures(state.buildFailures),
    archetype: archetype || 'Steady Builder',
    traits: traits.filter((trait) => typeof trait === 'string').slice(0, 3),
    metrics: { ...metrics },
    scores: calculateSessionScore(metricInput),
    completed,
  };
}

export function toSessionContract(record: SessionHistoryRecord): DevStravaSessionContract {
  const codingTotal = record.coding.manualMs
    + record.coding.aiAssistedMs
    + record.coding.automationMs
    + record.coding.unknownBulkMs;
  const pauseDurationMs = record.pauses.reduce((total, pause) => total
    + Math.max(0, (pause.endedAt ?? record.endedAt) - pause.startedAt), 0);
  const claude = record.tokenStats.claudeCode;
  const copilot = record.tokenStats.githubCopilot;
  const scores = record.scores ?? scoresFromMetrics(record.metrics);
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    // `id` is a deprecated local alias retained for consumers of the first
    // aggregate payload. It contains no additional information.
    id: record.id,
    sessionId: record.id,
    startedAt: isoDate(record.startedAt),
    endedAt: isoDate(record.endedAt),
    activeDurationSeconds: roundSeconds(record.activeDurationMs),
    pauseDurationSeconds: roundSeconds(pauseDurationMs),
    coding: {
      manualPercent: percent(record.coding.manualMs, codingTotal),
      aiAssistedPercent: percent(record.coding.aiAssistedMs, codingTotal),
      automationPercent: percent(record.coding.automationMs, codingTotal),
      unknownBulkEditPercent: percent(record.coding.unknownBulkMs, codingTotal),
      manualSeconds: roundSeconds(record.coding.manualMs),
      aiAssistedSeconds: roundSeconds(record.coding.aiAssistedMs),
      automationSeconds: roundSeconds(record.coding.automationMs),
      unknownBulkEditSeconds: roundSeconds(record.coding.unknownBulkMs),
    },
    activity: {
      edits: record.edits,
      saves: record.fileSaves,
      filesTouched: record.filesTouched,
      fileSwitches: record.fileSwitches,
      linesChangedEstimate: record.linesChanged,
    },
    terminal: {
      totalCommands: record.terminalCommands,
      terminalOpens: record.terminalOpens,
      build: record.terminalCommandsByCategory.build,
      test: record.terminalCommandsByCategory.test,
      git: record.terminalCommandsByCategory.git,
      packageManager: record.terminalCommandsByCategory['package-manager'],
      devServer: record.terminalCommandsByCategory['dev-server'],
      lint: record.terminalCommandsByCategory.lint,
      formatter: record.terminalCommandsByCategory.formatter,
      deployment: record.terminalCommandsByCategory.deployment,
      other: record.terminalCommandsByCategory.other,
    },
    ai: {
      claudeCodePrompts: record.agentPrompts.claudeCode,
      codexPrompts: record.agentPrompts.codex,
      copilotPrompts: record.agentPrompts.githubCopilot,
      tokenTotals: {
        claude: claude ? claude.input + claude.output + claude.cacheRead + claude.cacheCreate : null,
        codex: record.tokenStats.codex === 'unavailable' ? null : record.tokenStats.codex.total,
        copilot: copilot ? copilot.input + copilot.output : null,
      },
    },
    reliability: {
      failures: record.buildFailures.total,
      recoveredFailures: record.buildFailures.recoveredFailures,
      recoveryRate: record.buildFailures.total === 0
        ? 100
        : percent(record.buildFailures.recoveredFailures, record.buildFailures.total),
      failureStreak: record.buildFailures.failureStreak,
      cleanSession: record.buildFailures.total === 0,
      byCategory: { ...record.buildFailures.byCategory },
      successfulRuns: record.buildFailures.successfulRuns,
      maxFailureStreak: record.buildFailures.maxFailureStreak,
    },
    scores: {
      devScoreVersion: 1,
      focus: clampPercent(scores.focus),
      consistency: clampPercent(scores.consistency),
      recovery: clampPercent(scores.recovery),
      testingDiscipline: clampPercent(scores.testingDiscipline),
      shippingActivity: clampPercent(scores.shippingActivity),
      aiBalance: clampPercent(scores.aiBalance),
      devScore: clampPercent(scores.devScore),
    },
    archetype: {
      primaryArchetype: record.archetype,
      secondaryTraits: [...record.traits],
    },
  };
}

function parseImportPayload(payload: unknown): SessionHistoryRecord[] {
  const parsed = typeof payload === 'string' ? parseJson(payload) : payload;
  if (!isRecord(parsed)) {
    throw new Error('DevStrava import must be a JSON object.');
  }
  const sessions = parsed.sessions;
  if (!Array.isArray(sessions)) {
    throw new Error('DevStrava import is missing a sessions array.');
  }
  if (parsed.exportVersion !== undefined && parsed.exportVersion !== DEVSTRAVA_EXPORT_SCHEMA_VERSION) {
    throw new Error(`Unsupported future DevStrava export schema: ${String(parsed.exportVersion)}`);
  }
  if (parsed.schemaVersion === DEVSTRAVA_SESSION_SCHEMA_VERSION) {
    const result: SessionHistoryRecord[] = [];
    for (const session of sessions) {
      const validation = validateSessionContract(session);
      if (!validation.ok) {
        throw new Error(`Invalid DevStrava session: ${validation.errors.join('; ')}`);
      }
      result.push(fromSessionContract(validation.value));
    }
    return result;
  }
  if (parsed.schemaVersion === DEVSTRAVA_EXPORT_SCHEMA_VERSION) {
    throw new Error('Export envelope schema must carry devstrava.session.v1 at schemaVersion.');
  }
  if (parsed.schemaVersion === 1 || parsed.schemaVersion === undefined) {
    const result = sessions.map((session) => {
      if (!isRecord(session)) throw new Error('Invalid legacy session record.');
      return normalizeRecord(session, true);
    });
    return result;
  }
  throw new Error(`Unsupported future DevStrava schema: ${String(parsed.schemaVersion)}`);
}

function fromSessionContract(session: DevStravaSessionContract): SessionHistoryRecord {
  const coding = session.coding;
  const terminal = session.terminal;
  const failures = session.reliability;
  const scores = session.scores;
  return normalizeRecord({
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    version: 1,
    id: session.sessionId,
    startedAt: Date.parse(session.startedAt),
    endedAt: Date.parse(session.endedAt),
    activeDurationMs: session.activeDurationSeconds * 1_000,
    pauses: [],
    coding: {
      manualMs: coding.manualSeconds * 1_000,
      aiAssistedMs: coding.aiAssistedSeconds * 1_000,
      automationMs: coding.automationSeconds * 1_000,
      unknownBulkMs: coding.unknownBulkEditSeconds * 1_000,
    },
    edits: session.activity.edits,
    linesChanged: session.activity.linesChangedEstimate,
    fileSaves: session.activity.saves,
    fileSwitches: session.activity.fileSwitches,
    filesTouched: session.activity.filesTouched,
    terminalOpens: terminal.terminalOpens,
    terminalCommands: terminal.totalCommands,
    terminalCommandsByCategory: {
      ...emptyTerminalCommandCounts(),
      build: terminal.build,
      test: terminal.test,
      git: terminal.git,
      'package-manager': terminal.packageManager,
      'dev-server': terminal.devServer,
      lint: terminal.lint,
      formatter: terminal.formatter,
      deployment: terminal.deployment,
      other: terminal.other,
    },
    agentPrompts: {
      claudeCode: session.ai.claudeCodePrompts,
      codex: session.ai.codexPrompts,
      githubCopilot: session.ai.copilotPrompts,
    },
    tokenStats: {
      claudeCode: session.ai.tokenTotals.claude === null ? null : {
        input: session.ai.tokenTotals.claude,
        output: 0,
        cacheRead: 0,
        cacheCreate: 0,
      },
      codex: session.ai.tokenTotals.codex === null ? 'unavailable' : { total: session.ai.tokenTotals.codex },
      githubCopilot: session.ai.tokenTotals.copilot === null ? null : {
        input: session.ai.tokenTotals.copilot,
        output: 0,
        credits: 0,
      },
    },
    buildFailures: {
      total: failures.failures,
      byCategory: { ...failures.byCategory },
      successfulRuns: failures.successfulRuns ?? 0,
      recoveredFailures: failures.recoveredFailures,
      failureStreak: failures.failureStreak,
      maxFailureStreak: failures.maxFailureStreak ?? failures.failureStreak,
    },
    archetype: session.archetype.primaryArchetype,
    traits: [...session.archetype.secondaryTraits],
    metrics: {
      focusScore: scores.focus,
      contextSwitches: session.activity.fileSwitches,
      shippingActivity: scores.shippingActivity,
      testingDiscipline: scores.testingDiscipline,
      aiBalance: scores.aiBalance,
      recoveryRate: scores.recovery,
      cleanRun: failures.cleanSession,
    },
    scores,
    completed: true,
  }, true);
}

function parsePersistedStore(primary: unknown, legacy: unknown): { sessions: SessionHistoryRecord[]; drafts: SessionHistoryRecord[] } {
  if (isRecord(primary) && primary.schemaVersion === LOCAL_STORE_SCHEMA_VERSION) {
    return {
      sessions: parseInternalRecords(primary.sessions, true),
      drafts: parseInternalRecords(primary.drafts, false),
    };
  }
  return { sessions: parseInternalRecords(legacy, true), drafts: [] };
}

function parseInternalRecords(value: unknown, completed: boolean): SessionHistoryRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    try {
      return [normalizeRecord(entry, completed)];
    } catch {
      return [];
    }
  });
}

function normalizeRecord(value: Record<string, unknown>, completed: boolean): SessionHistoryRecord {
  const id = validId(value.id) ? value.id : (() => { throw new Error('Session id is required.'); })();
  const startedAt = safeTimestamp(value.startedAt, -1);
  const endedAt = safeTimestamp(value.endedAt, -1);
  if (startedAt < 0 || endedAt < startedAt) {
    throw new Error(`Invalid timestamps for session ${id}.`);
  }
  const coding = isRecord(value.coding) ? value.coding : {};
  const failures = isRecord(value.buildFailures) ? value.buildFailures : {};
  const metrics = isRecord(value.metrics) ? value.metrics : {};
  const rawScores = isRecord(value.scores) ? value.scores : undefined;
  const metricsValue: DeveloperMetrics = {
    focusScore: safeNumber(metrics.focusScore),
    contextSwitches: safeNumber(metrics.contextSwitches),
    shippingActivity: safeNumber(metrics.shippingActivity),
    testingDiscipline: safeNumber(metrics.testingDiscipline),
    aiBalance: safeNumber(metrics.aiBalance),
    recoveryRate: safeNumber(metrics.recoveryRate),
    cleanRun: metrics.cleanRun === true,
  };
  const scoreValue = rawScores
    ? {
      devScoreVersion: 1 as const,
      focus: safeNumber(rawScores.focus),
      consistency: safeNumber(rawScores.consistency),
      recovery: safeNumber(rawScores.recovery),
      testingDiscipline: safeNumber(rawScores.testingDiscipline),
      shippingActivity: safeNumber(rawScores.shippingActivity),
      aiBalance: safeNumber(rawScores.aiBalance),
      devScore: safeNumber(rawScores.devScore),
    }
    : scoresFromMetrics(metricsValue);
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    version: 1,
    id,
    startedAt,
    endedAt,
    activeDurationMs: safeNumber(value.activeDurationMs),
    pauses: parsePauses(value.pauses),
    coding: {
      manualMs: safeNumber(coding.manualMs ?? (coding.manualSeconds && Number(coding.manualSeconds) * 1_000)),
      aiAssistedMs: safeNumber(coding.aiAssistedMs ?? (coding.aiAssistedSeconds && Number(coding.aiAssistedSeconds) * 1_000)),
      automationMs: safeNumber(coding.automationMs ?? (coding.automationSeconds && Number(coding.automationSeconds) * 1_000)),
      unknownBulkMs: safeNumber(coding.unknownBulkMs ?? (coding.unknownBulkEditSeconds && Number(coding.unknownBulkEditSeconds) * 1_000)),
    },
    edits: safeNumber(value.edits),
    linesChanged: safeNumber(value.linesChanged ?? value.linesChangedEstimate),
    fileSaves: safeNumber(value.fileSaves ?? value.saves),
    fileSwitches: safeNumber(value.fileSwitches),
    filesTouched: safeNumber(value.filesTouched),
    terminalOpens: safeNumber(value.terminalOpens),
    terminalCommands: safeNumber(value.terminalCommands ?? value.totalCommands),
    terminalCommandsByCategory: parseTerminalCounts(value.terminalCommandsByCategory ?? value.terminal),
    agentPrompts: parsePromptStats(value.agentPrompts ?? value.ai),
    tokenStats: parseTokenStats(value.tokenStats ?? value.ai),
    buildFailures: {
      total: safeNumber(failures.total ?? failures.failures),
      byCategory: parseNumberRecord(failures.byCategory),
      successfulRuns: safeNumber(failures.successfulRuns),
      recoveredFailures: safeNumber(failures.recoveredFailures),
      failureStreak: safeNumber(failures.failureStreak),
      maxFailureStreak: safeNumber(failures.maxFailureStreak),
    },
    archetype: typeof value.archetype === 'string'
      ? value.archetype
      : isRecord(value.archetype) && typeof value.archetype.primaryArchetype === 'string'
        ? value.archetype.primaryArchetype
        : 'Steady Builder',
    traits: Array.isArray(value.traits)
      ? value.traits.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : isRecord(value.archetype) && Array.isArray(value.archetype.secondaryTraits)
        ? value.archetype.secondaryTraits.filter((item): item is string => typeof item === 'string').slice(0, 3)
        : [],
    metrics: metricsValue,
    scores: scoreValue,
    completed: value.completed === true || completed,
  };
}

function createEmptyRecord(id: string, startedAt: number): SessionHistoryRecord {
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    version: 1,
    id,
    startedAt,
    endedAt: startedAt,
    activeDurationMs: 0,
    pauses: [],
    coding: { manualMs: 0, aiAssistedMs: 0, automationMs: 0, unknownBulkMs: 0 },
    edits: 0,
    linesChanged: 0,
    fileSaves: 0,
    fileSwitches: 0,
    filesTouched: 0,
    terminalOpens: 0,
    terminalCommands: 0,
    terminalCommandsByCategory: emptyTerminalCommandCounts(),
    agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 0 },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    buildFailures: {
      total: 0,
      byCategory: {},
      successfulRuns: 0,
      recoveredFailures: 0,
      failureStreak: 0,
      maxFailureStreak: 0,
    },
    archetype: 'Steady Builder',
    traits: [],
    metrics: {
      focusScore: 0,
      contextSwitches: 0,
      shippingActivity: 0,
      testingDiscipline: 0,
      aiBalance: 0,
      recoveryRate: 100,
      cleanRun: true,
    },
    scores: {
      devScoreVersion: 1,
      focus: 0,
      consistency: 0,
      recovery: 100,
      testingDiscipline: 0,
      shippingActivity: 0,
      aiBalance: 0,
      devScore: 0,
    },
    completed: false,
  };
}

function mergeRecord(record: SessionHistoryRecord, patch: SessionHistoryRecordPatch): Record<string, unknown> {
  return {
    ...record,
    ...patch,
    coding: { ...record.coding, ...(patch.coding ?? {}) },
    terminalCommandsByCategory: {
      ...record.terminalCommandsByCategory,
      ...(patch.terminalCommandsByCategory ?? {}),
    },
    agentPrompts: { ...record.agentPrompts, ...(patch.agentPrompts ?? {}) },
    tokenStats: patch.tokenStats ? cloneTokenStats(patch.tokenStats) : cloneTokenStats(record.tokenStats),
    buildFailures: patch.buildFailures
      ? cloneBuildFailures(patch.buildFailures)
      : cloneBuildFailures(record.buildFailures),
    metrics: { ...record.metrics, ...(patch.metrics ?? {}) },
    scores: patch.scores ? { ...patch.scores } : { ...record.scores },
    pauses: patch.pauses ? patch.pauses.map((pause) => ({ ...pause })) : record.pauses.map((pause) => ({ ...pause })),
  };
}

function cloneRecord(record: SessionHistoryRecord): SessionHistoryRecord {
  return {
    ...record,
    pauses: record.pauses.map((pause) => ({ ...pause })),
    coding: { ...record.coding },
    terminalCommandsByCategory: { ...record.terminalCommandsByCategory },
    agentPrompts: { ...record.agentPrompts },
    tokenStats: cloneTokenStats(record.tokenStats),
    buildFailures: cloneBuildFailures(record.buildFailures),
    traits: [...record.traits],
    metrics: { ...record.metrics },
    scores: { ...record.scores },
  };
}

function cloneTokenStats(stats: DailySprintlyState['tokenStats']): DailySprintlyState['tokenStats'] {
  return {
    claudeCode: stats.claudeCode ? { ...stats.claudeCode } : null,
    codex: stats.codex === 'unavailable' ? 'unavailable' : { ...stats.codex },
    githubCopilot: stats.githubCopilot ? { ...stats.githubCopilot } : null,
  };
}

function cloneBuildFailures(failures: DailySprintlyState['buildFailures']): DailySprintlyState['buildFailures'] {
  return {
    ...failures,
    byCategory: { ...failures.byCategory },
  };
}

function parsePromptStats(value: unknown): DailySprintlyState['agentPrompts'] {
  const record = isRecord(value) ? value : {};
  return {
    claudeCode: safeNumber(record.claudeCode ?? record.claudeCodePrompts),
    codex: safeNumber(record.codex ?? record.codexPrompts),
    githubCopilot: safeNumber(record.githubCopilot ?? record.copilotPrompts),
  };
}

function parseTokenStats(value: unknown): DailySprintlyState['tokenStats'] {
  const record = isRecord(value) ? value : {};
  const claude = isRecord(record.claudeCode) ? record.claudeCode : null;
  const copilot = isRecord(record.githubCopilot) ? record.githubCopilot : null;
  const aiTokens = isRecord(record.tokenTotals) ? record.tokenTotals : {};
  const claudeTotal = typeof aiTokens.claude === 'number' ? aiTokens.claude : null;
  const codexTotal = typeof aiTokens.codex === 'number' ? aiTokens.codex : null;
  const copilotTotal = typeof aiTokens.copilot === 'number' ? aiTokens.copilot : null;
  return {
    claudeCode: claude ? {
      input: safeNumber(claude.input),
      output: safeNumber(claude.output),
      cacheRead: safeNumber(claude.cacheRead),
      cacheCreate: safeNumber(claude.cacheCreate),
    } : claudeTotal === null ? null : {
      input: claudeTotal,
      output: 0,
      cacheRead: 0,
      cacheCreate: 0,
    },
    codex: isRecord(record.codex) && typeof record.codex.total === 'number'
      ? { total: safeNumber(record.codex.total) }
      : codexTotal === null ? 'unavailable' : { total: codexTotal },
    githubCopilot: copilot ? {
      input: safeNumber(copilot.input),
      output: safeNumber(copilot.output),
      credits: safeNumber(copilot.credits),
    } : copilotTotal === null ? null : { input: copilotTotal, output: 0, credits: 0 },
  };
}

function parseTerminalCounts(value: unknown): TerminalCommandCounts {
  const record = isRecord(value) ? value : {};
  return {
    build: safeNumber(record.build),
    test: safeNumber(record.test),
    'package-manager': safeNumber(record['package-manager'] ?? record.packageManager),
    git: safeNumber(record.git),
    'dev-server': safeNumber(record['dev-server'] ?? record.devServer),
    lint: safeNumber(record.lint),
    formatter: safeNumber(record.formatter),
    deployment: safeNumber(record.deployment),
    other: safeNumber(record.other),
  };
}

function normalizeTerminalCounts(value: TerminalCommandCounts | undefined): TerminalCommandCounts {
  return { ...emptyTerminalCommandCounts(), ...(value ?? {}) };
}

function parsePauses(value: unknown): SessionPauseInterval[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const startedAt = safeTimestamp(entry.startedAt, -1);
    const endedAt = entry.endedAt === null ? null : safeTimestamp(entry.endedAt, -1);
    if (startedAt < 0 || (endedAt !== null && endedAt < startedAt)) return [];
    return [{ startedAt, endedAt }];
  });
}

function parseNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const number = safeNumber(item);
    return typeof item === 'number' && Number.isFinite(item) && item >= 0 ? [[key, number]] : [];
  }));
}

function metricInputFromState(
  state: Readonly<DailySprintlyState>,
  stats: Readonly<SessionStats>,
  endedAt: number,
): DeveloperMetricInput {
  return {
    sessionDurationMs: resolveActiveDurationMs(state, stats, endedAt),
    coding: {
      manualMs: safeNumber(state.session.manualMs ?? state.session.hardcodeMs),
      aiAssistedMs: safeNumber(state.session.aiAssistedMs ?? state.session.vibecodeMs),
      automationMs: safeNumber(state.session.automationMs),
      unknownBulkMs: safeNumber(state.session.unknownBulkMs),
    },
    fileEdits: safeNumber(stats.fileEdits),
    fileSaves: safeNumber(stats.fileSaves),
    fileSwitches: safeNumber(stats.fileSwitches),
    terminalCommands: safeNumber(stats.terminalCommands),
    terminalCommandsByCategory: stats.terminalCommandsByCategory,
    failures: safeNumber(state.buildFailures.total),
    recoveredFailures: safeNumber(state.buildFailures.recoveredFailures),
    successfulRuns: safeNumber(state.buildFailures.successfulRuns),
  };
}

function resolveActiveDurationMs(
  state: Readonly<DailySprintlyState>,
  stats: Readonly<SessionStats>,
  endedAt: number,
): number {
  if (stats.durationSeconds > 0) {
    return Math.max(0, Math.round(stats.durationSeconds * 1_000));
  }
  if (state.session.startedAt === null) return 0;
  const pausedMs = state.session.pauses.reduce((total, pause) => total
    + Math.max(0, (pause.endedAt ?? endedAt) - pause.startedAt), 0);
  return Math.max(0, endedAt - state.session.startedAt - pausedMs);
}

function scoresFromMetrics(metrics: DeveloperMetrics): SessionScore {
  return {
    devScoreVersion: 1,
    focus: clampPercent(metrics.focusScore),
    consistency: 0,
    recovery: clampPercent(metrics.recoveryRate),
    testingDiscipline: clampPercent(metrics.testingDiscipline),
    shippingActivity: clampPercent(metrics.shippingActivity),
    aiBalance: clampPercent(metrics.aiBalance),
    devScore: 0,
  };
}

function toAggregateMetadata(aggregation: SessionAggregation): DevStravaAggregateMetadata {
  return {
    period: aggregation.period,
    sessions: aggregation.sessions,
    codingTimeSeconds: roundSeconds(aggregation.codingTimeMs),
    activeTimeSeconds: roundSeconds(aggregation.activeTimeMs),
    averageSessionSeconds: roundSeconds(aggregation.averageSessionMs),
    averageAiBalance: aggregation.aiBalance,
    failures: aggregation.failures,
    recoveredFailures: aggregation.recoveredFailures,
    recoveryRate: aggregation.recoveryRate,
    currentStreak: aggregation.currentStreak,
    longestStreak: aggregation.longestStreak,
    bestSessionId: aggregation.bestSessionId,
    longestSessionId: aggregation.longestSessionId,
    devScoreVersion: 1,
    devScore: aggregation.devScore,
  };
}

function compareNewest(left: SessionHistoryRecord, right: SessionHistoryRecord): number {
  return right.endedAt - left.endedAt || right.startedAt - left.startedAt || left.id.localeCompare(right.id);
}

function readRetention(): number {
  const configuration = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('sprintly')
    : undefined;
  const value = configuration?.get<unknown>('historyRetention', DEFAULT_RETENTION);
  return normalizedRetention(value);
}

function normalizedRetention(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(1_000, value)
    : DEFAULT_RETENTION;
}

function createSessionId(startedAt: number): string {
  return `sess_${Math.round(startedAt).toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function safeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function roundSeconds(milliseconds: number): number {
  return Math.round(Math.max(0, milliseconds) / 1_000);
}

function percent(value: number, total: number): number {
  return total > 0 ? clampPercent((value / total) * 100) : 0;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error('DevStrava import is not valid JSON.');
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
