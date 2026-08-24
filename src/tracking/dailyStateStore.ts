import * as vscode from 'vscode';

export type CodingCategory =
  | 'manual'
  | 'ai-assisted'
  | 'automation'
  | 'unknown-bulk'
  | 'hardcode'
  | 'vibecode';
export type AgentId = 'claude-code' | 'codex' | 'github-copilot';

export interface SessionPauseInterval {
  startedAt: number;
  endedAt: number | null;
}

export interface SessionSplit {
  id: string | null;
  startedAt: number | null;
  endedAt: number | null;
  isActive: boolean;
  isPaused: boolean;
  pausedAt: number | null;
  pauses: SessionPauseInterval[];
  hardcodeMs: number;
  vibecodeMs: number;
  manualMs: number;
  aiAssistedMs: number;
  automationMs: number;
  unknownBulkMs: number;
}

export interface AgentPromptStats {
  claudeCode: number;
  codex: number;
  githubCopilot: number;
}

export interface BuildFailureStats {
  total: number;
  byCategory: Record<string, number>;
  successfulRuns: number;
  recoveredFailures: number;
  failureStreak: number;
  maxFailureStreak: number;
  /** Category of the most recent failure; used for same-task recovery checks. */
  lastFailureCategory: string | null;
}

export interface ClaudeTokenStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export interface CopilotTokenStats {
  input: number;
  output: number;
  credits: number;
}

export interface TokenStats {
  claudeCode: ClaudeTokenStats | null;
  codex: { total: number } | 'unavailable';
  githubCopilot: CopilotTokenStats | null;
}

export interface AgentFileCursor {
  offset: number;
}

export interface SprintlySessionState {
  version: 3;
  detectedAgents: AgentId[];
  session: SessionSplit;
  agentPrompts: AgentPromptStats;
  buildFailures: BuildFailureStats;
  tokenStats: TokenStats;
  agentFileCursors: Record<string, AgentFileCursor>;
  /**
   * Last durable observation of live session activity (editor heartbeat,
   * terminal event, agent batch, or lifecycle transition). Interrupted
   * sessions are closed at this boundary so VS Code/machine downtime is never
   * counted as coding time.
   */
  lastObservedAt: number | null;
}

/** @deprecated Kept as a source-compatible alias while consumers migrate names. */
export type DailySprintlyState = SprintlySessionState;

export interface AgentLogBatch {
  sourceId: string;
  detected: boolean;
  filePath: string;
  nextOffset: number;
  promptCount: number;
  sessionId?: string;
  claudeUsage?: ClaudeTokenStats;
  codexTokens?: number;
  codexUsageAvailable?: boolean;
  copilotUsage?: CopilotTokenStats;
}

const SESSION_STATE_KEY = 'sprintly.sessionTracking.v3';
const LEGACY_DAILY_STATE_KEY = 'sprintly.dailyTracking.v2';

/** Command categories whose success can evidence recovery of a failure family. */
const RECOVERABLE_FAMILIES: Record<string, string> = {
  build: 'build_failure',
  test: 'test_failure',
  lint: 'lint_failure',
};

export class DailyStateStore implements vscode.Disposable {
  private state: SprintlySessionState;
  private readonly interruptedSessionId: string | null;
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly updateEmitter = new vscode.EventEmitter<Readonly<SprintlySessionState>>();

  readonly onDidUpdate = this.updateEmitter.event;

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly now: () => number = Date.now,
  ) {
    const stored = globalState.get<unknown>(SESSION_STATE_KEY)
      ?? globalState.get<unknown>(LEGACY_DAILY_STATE_KEY);
    this.state = parseStoredState(stored);
    this.interruptedSessionId = this.state.session.isActive ? this.state.session.id : null;

    // Extension shutdown is not guaranteed to run. Never carry an active capture
    // window into a later VS Code process, because that would merge two sessions.
    // Close at the last durable observation, not at restart time: offline time
    // between the two processes must not count as session time.
    if (this.state.session.isActive) {
      const lastObserved = this.state.lastObservedAt;
      const endedAt = lastObserved !== null && lastObserved >= (this.state.session.startedAt ?? 0)
        ? Math.min(lastObserved, this.now())
        : this.now();
      closeSession(this.state.session, endedAt);
      this.persist();
    }
  }

  get(): Readonly<SprintlySessionState> {
    return cloneState(this.state);
  }

  getInterruptedSessionId(): string | null {
    return this.interruptedSessionId;
  }

  getAgentFileOffset(filePath: string): number {
    return this.state.agentFileCursors[filePath]?.offset ?? 0;
  }

  startSession(startedAt = this.now(), id = createSessionId(startedAt)): string {
    const timestamp = safeTimestamp(startedAt, this.now());
    const cursors = cloneCursors(this.state.agentFileCursors);
    this.state = createEmptyState(cursors);
    this.state.session = {
      ...emptySession(),
      id,
      startedAt: timestamp,
      isActive: true,
    };
    this.state.lastObservedAt = timestamp;
    this.persistAndEmit();
    return id;
  }

  pauseSession(pausedAt = this.now()): void {
    const session = this.state.session;
    if (!session.isActive || session.isPaused || session.startedAt === null) {
      return;
    }
    const timestamp = Math.max(session.startedAt, safeTimestamp(pausedAt, this.now()));
    session.isPaused = true;
    session.pausedAt = timestamp;
    session.pauses.push({ startedAt: timestamp, endedAt: null });
    this.touch();
    this.persistAndEmit();
  }

  resumeSession(resumedAt = this.now()): void {
    const session = this.state.session;
    if (!session.isActive || !session.isPaused) {
      return;
    }
    closePause(session, safeTimestamp(resumedAt, this.now()));
    this.touch();
    this.persistAndEmit();
  }

  stopSession(endedAt = this.now()): void {
    if (!this.state.session.isActive) {
      return;
    }
    const timestamp = safeTimestamp(endedAt, this.now());
    closeSession(this.state.session, timestamp);
    // The last durable observation can never postdate the session end.
    if (this.state.lastObservedAt === null || this.state.lastObservedAt > timestamp) {
      this.state.lastObservedAt = timestamp;
    }
    this.persistAndEmit();
  }

  resetSession(): void {
    this.state = createEmptyState(cloneCursors(this.state.agentFileCursors));
    this.persistAndEmit();
  }

  /**
   * Erase every persisted field of this store, including agent-log cursors.
   * Unlike resetSession (which keeps cursors to avoid replaying old logs),
   * this is the privacy-complete deletion used by Erase All Data.
   */
  eraseAllData(): void {
    this.state = createEmptyState();
    this.persistAndEmit();
  }

  isCapturing(timestamp = this.now()): boolean {
    return sessionContainsTimestamp(this.state.session, timestamp);
  }

  getSessionIdForTimestamp(timestamp: number): string | null {
    return this.isCapturing(timestamp) ? this.state.session.id : null;
  }

  addSessionDuration(
    category: CodingCategory,
    durationMs: number,
    observedAt = this.now(),
  ): void {
    if (!Number.isFinite(durationMs)
      || durationMs <= 0
      || !this.isCapturing(observedAt)) {
      return;
    }
    this.mutate((state) => {
      if (category === 'hardcode') {
        state.session.hardcodeMs += durationMs;
        state.session.manualMs += durationMs;
      } else if (category === 'vibecode') {
        state.session.vibecodeMs += durationMs;
        state.session.aiAssistedMs += durationMs;
      } else if (category === 'manual') {
        state.session.hardcodeMs += durationMs;
        state.session.manualMs += durationMs;
      } else if (category === 'ai-assisted') {
        state.session.vibecodeMs += durationMs;
        state.session.aiAssistedMs += durationMs;
      } else if (category === 'automation') {
        state.session.automationMs += durationMs;
      } else {
        state.session.unknownBulkMs += durationMs;
      }
    });
  }

  addBuildFailure(category: string, occurredAt = this.now()): void {
    if (!this.isCapturing(occurredAt)) {
      return;
    }
    this.mutate((state) => {
      state.buildFailures.total += 1;
      state.buildFailures.byCategory[category] =
        (state.buildFailures.byCategory[category] ?? 0) + 1;
      state.buildFailures.failureStreak += 1;
      state.buildFailures.maxFailureStreak = Math.max(
        state.buildFailures.maxFailureStreak,
        state.buildFailures.failureStreak,
      );
      state.buildFailures.lastFailureCategory = category;
    });
  }

  addSuccessfulRun(commandCategory: string, occurredAt = this.now()): void {
    if (!this.isCapturing(occurredAt)) {
      return;
    }
    this.mutate((state) => {
      state.buildFailures.successfulRuns += 1;
      if (state.buildFailures.failureStreak > 0) {
        // Recovery requires same-task evidence: the successful execution must
        // belong to the tool family that failed. An unrelated success (for
        // example `ls` after a failed build) breaks the streak but is never
        // counted as a recovery.
        const expectedFailure = RECOVERABLE_FAMILIES[commandCategory];
        if (expectedFailure !== undefined
          && state.buildFailures.lastFailureCategory === expectedFailure) {
          state.buildFailures.recoveredFailures += 1;
        }
        state.buildFailures.failureStreak = 0;
      }
    });
  }

  applyAgentLogBatch(batch: AgentLogBatch): void {
    this.mutate((state) => {
      state.agentFileCursors[batch.filePath] = { offset: Math.max(0, batch.nextOffset) };

      const belongsToSession = batch.sessionId
        ? batch.sessionId === state.session.id
        : sessionContainsTimestamp(state.session, this.now());
      if (!belongsToSession) {
        return;
      }

      if (batch.detected
        && isAgentId(batch.sourceId)
        && !state.detectedAgents.includes(batch.sourceId)) {
        state.detectedAgents.push(batch.sourceId);
      }
      if (batch.sourceId === 'claude-code') {
        state.agentPrompts.claudeCode += batch.promptCount;
        if (batch.claudeUsage) {
          const current = state.tokenStats.claudeCode ?? emptyClaudeTokens();
          state.tokenStats.claudeCode = {
            input: current.input + batch.claudeUsage.input,
            output: current.output + batch.claudeUsage.output,
            cacheRead: current.cacheRead + batch.claudeUsage.cacheRead,
            cacheCreate: current.cacheCreate + batch.claudeUsage.cacheCreate,
          };
        }
      } else if (batch.sourceId === 'codex') {
        state.agentPrompts.codex += batch.promptCount;
        if (batch.codexUsageAvailable) {
          const current = state.tokenStats.codex === 'unavailable'
            ? 0
            : state.tokenStats.codex.total;
          state.tokenStats.codex = { total: current + (batch.codexTokens ?? 0) };
        }
      } else if (batch.sourceId === 'github-copilot') {
        state.agentPrompts.githubCopilot += batch.promptCount;
        if (batch.copilotUsage) {
          const current = state.tokenStats.githubCopilot ?? emptyCopilotTokens();
          state.tokenStats.githubCopilot = {
            input: current.input + batch.copilotUsage.input,
            output: current.output + batch.copilotUsage.output,
            credits: current.credits + batch.copilotUsage.credits,
          };
        }
      }
    });
  }

  dispose(): void {
    this.updateEmitter.dispose();
  }

  private mutate(change: (state: SprintlySessionState) => void): void {
    change(this.state);
    this.touch();
    this.persistAndEmit();
  }

  /** Record a durable observation of live activity for interrupted recovery. */
  private touch(): void {
    const now = this.now();
    if (this.state.lastObservedAt === null || now > this.state.lastObservedAt) {
      this.state.lastObservedAt = now;
    }
  }

  private persistAndEmit(): void {
    this.persist();
    this.updateEmitter.fire(this.get());
  }

  private persist(): void {
    const snapshot = cloneState(this.state);
    this.persistQueue = this.persistQueue
      .then(() => this.globalState.update(SESSION_STATE_KEY, snapshot))
      .then(() => undefined, () => undefined);
  }
}

// Retained for downstream callers until the log watcher is session-window aware.
export function localDayBounds(now = new Date()): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return { start, end };
}

function createEmptyState(
  agentFileCursors: Record<string, AgentFileCursor> = {},
): SprintlySessionState {
  return {
    version: 3,
    detectedAgents: [],
    session: emptySession(),
    agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 0 },
    buildFailures: {
      total: 0,
      byCategory: {},
      successfulRuns: 0,
      recoveredFailures: 0,
      failureStreak: 0,
      maxFailureStreak: 0,
      lastFailureCategory: null,
    },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    agentFileCursors,
    lastObservedAt: null,
  };
}

function emptySession(): SessionSplit {
  return {
    id: null,
    startedAt: null,
    endedAt: null,
    isActive: false,
    isPaused: false,
    pausedAt: null,
    pauses: [],
    hardcodeMs: 0,
    vibecodeMs: 0,
    manualMs: 0,
    aiAssistedMs: 0,
    automationMs: 0,
    unknownBulkMs: 0,
  };
}

function emptyClaudeTokens(): ClaudeTokenStats {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}

function emptyCopilotTokens(): CopilotTokenStats {
  return { input: 0, output: 0, credits: 0 };
}

function parseStoredState(value: unknown): SprintlySessionState {
  if (!isRecord(value)) {
    return createEmptyState();
  }

  const cursors = parseCursors(value.agentFileCursors);
  if (value.version !== 3 || !isRecord(value.session)) {
    // Daily v2 totals cannot be assigned to a specific recording. Preserve only
    // file cursors so migration does not replay historical agent logs.
    return createEmptyState(cursors);
  }

  const session = value.session;
  const prompts = isRecord(value.agentPrompts) ? value.agentPrompts : {};
  const failures = isRecord(value.buildFailures) ? value.buildFailures : {};
  const tokenStats = isRecord(value.tokenStats) ? value.tokenStats : {};
  return {
    version: 3,
    detectedAgents: parseDetectedAgents(value.detectedAgents),
    lastObservedAt: nullableTimestamp(value.lastObservedAt),
    session: {
      id: typeof session.id === 'string' ? session.id : null,
      startedAt: nullableTimestamp(session.startedAt),
      endedAt: nullableTimestamp(session.endedAt),
      isActive: session.isActive === true,
      isPaused: session.isPaused === true,
      pausedAt: nullableTimestamp(session.pausedAt),
      pauses: parsePauses(session.pauses),
      hardcodeMs: safeNumber(session.hardcodeMs) || safeNumber(session.manualMs),
      vibecodeMs: safeNumber(session.vibecodeMs) || safeNumber(session.aiAssistedMs),
      manualMs: safeNumber(session.manualMs) || safeNumber(session.hardcodeMs),
      aiAssistedMs: safeNumber(session.aiAssistedMs) || safeNumber(session.vibecodeMs),
      automationMs: safeNumber(session.automationMs),
      unknownBulkMs: safeNumber(session.unknownBulkMs),
    },
    agentPrompts: {
      claudeCode: safeNumber(prompts.claudeCode),
      codex: safeNumber(prompts.codex),
      githubCopilot: safeNumber(prompts.githubCopilot),
    },
    buildFailures: {
      total: safeNumber(failures.total),
      byCategory: parseNumberRecord(failures.byCategory),
      successfulRuns: safeNumber(failures.successfulRuns),
      recoveredFailures: safeNumber(failures.recoveredFailures),
      failureStreak: safeNumber(failures.failureStreak),
      maxFailureStreak: safeNumber(failures.maxFailureStreak),
      lastFailureCategory: typeof failures.lastFailureCategory === 'string'
        ? failures.lastFailureCategory
        : null,
    },
    tokenStats: {
      claudeCode: parseClaudeTokens(tokenStats.claudeCode),
      codex: parseCodexTokens(tokenStats.codex),
      githubCopilot: parseCopilotTokens(tokenStats.githubCopilot),
    },
    agentFileCursors: cursors,
  };
}

function parseClaudeTokens(value: unknown): ClaudeTokenStats | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    input: safeNumber(value.input),
    output: safeNumber(value.output),
    cacheRead: safeNumber(value.cacheRead),
    cacheCreate: safeNumber(value.cacheCreate),
  };
}

function parseCodexTokens(value: unknown): { total: number } | 'unavailable' {
  return isRecord(value) && typeof value.total === 'number'
    ? { total: safeNumber(value.total) }
    : 'unavailable';
}

function parseCopilotTokens(value: unknown): CopilotTokenStats | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    input: safeNumber(value.input),
    output: safeNumber(value.output),
    credits: safeNumber(value.credits),
  };
}

function parseCursors(value: unknown): Record<string, AgentFileCursor> {
  if (!isRecord(value)) {
    return {};
  }
  const cursors: Record<string, AgentFileCursor> = {};
  for (const [filePath, cursor] of Object.entries(value)) {
    if (isRecord(cursor) && typeof cursor.offset === 'number') {
      cursors[filePath] = { offset: safeNumber(cursor.offset) };
    }
  }
  return cursors;
}

function cloneCursors(
  cursors: Record<string, AgentFileCursor>,
): Record<string, AgentFileCursor> {
  return Object.fromEntries(
    Object.entries(cursors).map(([filePath, cursor]) => [filePath, { ...cursor }]),
  );
}

function parsePauses(value: unknown): SessionPauseInterval[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((pause) => {
    if (!isRecord(pause)) {
      return [];
    }
    const startedAt = nullableTimestamp(pause.startedAt);
    if (startedAt === null) {
      return [];
    }
    return [{ startedAt, endedAt: nullableTimestamp(pause.endedAt) }];
  });
}

function parseNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === 'number') {
      result[key] = safeNumber(count);
    }
  }
  return result;
}

function cloneState(state: SprintlySessionState): SprintlySessionState {
  return {
    version: 3,
    detectedAgents: [...state.detectedAgents],
    lastObservedAt: state.lastObservedAt,
    session: {
      ...state.session,
      manualMs: state.session.manualMs,
      aiAssistedMs: state.session.aiAssistedMs,
      automationMs: state.session.automationMs,
      unknownBulkMs: state.session.unknownBulkMs,
      pauses: state.session.pauses.map((pause) => ({ ...pause })),
    },
    agentPrompts: { ...state.agentPrompts },
    buildFailures: {
      total: state.buildFailures.total,
      byCategory: { ...state.buildFailures.byCategory },
      successfulRuns: state.buildFailures.successfulRuns,
      recoveredFailures: state.buildFailures.recoveredFailures,
      failureStreak: state.buildFailures.failureStreak,
      maxFailureStreak: state.buildFailures.maxFailureStreak,
      lastFailureCategory: state.buildFailures.lastFailureCategory,
    },
    tokenStats: {
      claudeCode: state.tokenStats.claudeCode
        ? { ...state.tokenStats.claudeCode }
        : null,
      codex: state.tokenStats.codex === 'unavailable'
        ? 'unavailable'
        : { ...state.tokenStats.codex },
      githubCopilot: state.tokenStats.githubCopilot
        ? { ...state.tokenStats.githubCopilot }
        : null,
    },
    agentFileCursors: cloneCursors(state.agentFileCursors),
  };
}

function closePause(session: SessionSplit, endedAt: number): void {
  const pause = session.pauses[session.pauses.length - 1];
  if (pause && pause.endedAt === null) {
    pause.endedAt = Math.max(pause.startedAt, endedAt);
  }
  session.isPaused = false;
  session.pausedAt = null;
}

function closeSession(session: SessionSplit, endedAt: number): void {
  if (session.isPaused) {
    closePause(session, endedAt);
  }
  session.isActive = false;
  session.isPaused = false;
  session.endedAt = session.startedAt === null
    ? endedAt
    : Math.max(session.startedAt, endedAt);
}

function sessionContainsTimestamp(session: SessionSplit, timestamp: number): boolean {
  if (!Number.isFinite(timestamp)
    || session.id === null
    || session.startedAt === null
    || timestamp < session.startedAt
    || (session.endedAt !== null && timestamp > session.endedAt)) {
    return false;
  }
  return !session.pauses.some((pause) => timestamp >= pause.startedAt
    && (pause.endedAt === null || timestamp < pause.endedAt));
}

function createSessionId(startedAt: number): string {
  return `${Math.round(startedAt).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function nullableTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDetectedAgents(value: unknown): AgentId[] {
  return Array.isArray(value)
    ? value.filter((agent): agent is AgentId => isAgentId(agent))
    : [];
}

function isAgentId(value: unknown): value is AgentId {
  return value === 'claude-code' || value === 'codex' || value === 'github-copilot';
}
