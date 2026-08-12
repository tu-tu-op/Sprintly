import * as vscode from 'vscode';

export type CodingCategory = 'hardcode' | 'vibecode';
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
}

export interface AgentPromptStats {
  claudeCode: number;
  codex: number;
  githubCopilot: number;
}

export interface BuildFailureStats {
  total: number;
  byCategory: Record<string, number>;
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

export class DailyStateStore implements vscode.Disposable {
  private state: SprintlySessionState;
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

    // Extension shutdown is not guaranteed to run. Never carry an active capture
    // window into a later VS Code process, because that would merge two sessions.
    if (this.state.session.isActive) {
      closeSession(this.state.session, this.now());
      this.persist();
    }
  }

  get(): Readonly<SprintlySessionState> {
    return cloneState(this.state);
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
    this.persistAndEmit();
  }

  resumeSession(resumedAt = this.now()): void {
    const session = this.state.session;
    if (!session.isActive || !session.isPaused) {
      return;
    }
    closePause(session, safeTimestamp(resumedAt, this.now()));
    this.persistAndEmit();
  }

  stopSession(endedAt = this.now()): void {
    if (!this.state.session.isActive) {
      return;
    }
    closeSession(this.state.session, safeTimestamp(endedAt, this.now()));
    this.persistAndEmit();
  }

  resetSession(): void {
    this.state = createEmptyState(cloneCursors(this.state.agentFileCursors));
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
      } else {
        state.session.vibecodeMs += durationMs;
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
    this.persistAndEmit();
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
    buildFailures: { total: 0, byCategory: {} },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    agentFileCursors,
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
    session: {
      id: typeof session.id === 'string' ? session.id : null,
      startedAt: nullableTimestamp(session.startedAt),
      endedAt: nullableTimestamp(session.endedAt),
      isActive: session.isActive === true,
      isPaused: session.isPaused === true,
      pausedAt: nullableTimestamp(session.pausedAt),
      pauses: parsePauses(session.pauses),
      hardcodeMs: safeNumber(session.hardcodeMs),
      vibecodeMs: safeNumber(session.vibecodeMs),
    },
    agentPrompts: {
      claudeCode: safeNumber(prompts.claudeCode),
      codex: safeNumber(prompts.codex),
      githubCopilot: safeNumber(prompts.githubCopilot),
    },
    buildFailures: {
      total: safeNumber(failures.total),
      byCategory: parseNumberRecord(failures.byCategory),
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
    session: {
      ...state.session,
      pauses: state.session.pauses.map((pause) => ({ ...pause })),
    },
    agentPrompts: { ...state.agentPrompts },
    buildFailures: {
      total: state.buildFailures.total,
      byCategory: { ...state.buildFailures.byCategory },
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
