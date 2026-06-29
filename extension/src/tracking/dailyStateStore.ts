import * as vscode from 'vscode';

export type CodingCategory = 'hardcode' | 'vibecode';
export type AgentId = 'claude-code' | 'codex';

export interface SessionSplit {
  hardcodeMs: number;
  vibecodeMs: number;
}

export interface AgentPromptStats {
  claudeCode: number;
  codex: number;
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

export interface TokenStats {
  claudeCode: ClaudeTokenStats | null;
  codex: { total: number } | 'unavailable';
}

export interface AgentFileCursor {
  offset: number;
}

export interface DailySprintlyState {
  dateKey: string;
  detectedAgents: AgentId[];
  session: SessionSplit;
  agentPrompts: AgentPromptStats;
  buildFailures: BuildFailureStats;
  tokenStats: TokenStats;
  agentFileCursors: Record<string, AgentFileCursor>;
}

export interface AgentLogBatch {
  sourceId: string;
  detected: boolean;
  filePath: string;
  nextOffset: number;
  promptCount: number;
  claudeUsage?: ClaudeTokenStats;
  codexTokens?: number;
  codexUsageAvailable?: boolean;
}

const DAILY_STATE_KEY = 'sprintly.dailyTracking.v2';

export class DailyStateStore implements vscode.Disposable {
  private state: DailySprintlyState;
  private persistQueue: Promise<void> = Promise.resolve();
  private midnightTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly updateEmitter = new vscode.EventEmitter<Readonly<DailySprintlyState>>();

  readonly onDidUpdate = this.updateEmitter.event;

  constructor(private readonly globalState: vscode.Memento) {
    this.state = parseStoredState(globalState.get<unknown>(DAILY_STATE_KEY));
    if (this.state.dateKey !== localDateKey()) {
      this.state = createEmptyState();
      this.persist();
    }
    this.scheduleMidnightReset();
  }

  get(): Readonly<DailySprintlyState> {
    this.ensureCurrentDay();
    return cloneState(this.state);
  }

  getAgentFileOffset(filePath: string): number {
    this.ensureCurrentDay();
    return this.state.agentFileCursors[filePath]?.offset ?? 0;
  }

  addSessionDuration(category: CodingCategory, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
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

  addBuildFailure(category: string): void {
    this.mutate((state) => {
      state.buildFailures.total += 1;
      state.buildFailures.byCategory[category] =
        (state.buildFailures.byCategory[category] ?? 0) + 1;
    });
  }

  applyAgentLogBatch(batch: AgentLogBatch): void {
    this.mutate((state) => {
      state.agentFileCursors[batch.filePath] = { offset: Math.max(0, batch.nextOffset) };
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
      }
    });
  }

  dispose(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }
    this.updateEmitter.dispose();
  }

  private mutate(change: (state: DailySprintlyState) => void): void {
    this.ensureCurrentDay();
    change(this.state);
    this.persist();
    this.updateEmitter.fire(this.get());
  }

  private ensureCurrentDay(): void {
    if (this.state.dateKey === localDateKey()) {
      return;
    }
    this.state = createEmptyState();
    this.persist();
    this.updateEmitter.fire(cloneState(this.state));
    this.scheduleMidnightReset();
  }

  private scheduleMidnightReset(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0, 0, 0, 25,
    );
    this.midnightTimer = setTimeout(() => {
      this.ensureCurrentDay();
    }, Math.max(1, nextMidnight.getTime() - now.getTime()));
  }

  private persist(): void {
    const snapshot = cloneState(this.state);
    this.persistQueue = this.persistQueue
      .then(() => this.globalState.update(DAILY_STATE_KEY, snapshot))
      .then(() => undefined, () => undefined);
  }
}

export function localDayBounds(now = new Date()): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return { start, end };
}

function localDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createEmptyState(): DailySprintlyState {
  return {
    dateKey: localDateKey(),
    detectedAgents: [],
    session: { hardcodeMs: 0, vibecodeMs: 0 },
    agentPrompts: { claudeCode: 0, codex: 0 },
    buildFailures: { total: 0, byCategory: {} },
    tokenStats: { claudeCode: null, codex: 'unavailable' },
    agentFileCursors: {},
  };
}

function emptyClaudeTokens(): ClaudeTokenStats {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}

function parseStoredState(value: unknown): DailySprintlyState {
  if (!isRecord(value) || typeof value.dateKey !== 'string') {
    return createEmptyState();
  }
  const session = isRecord(value.session) ? value.session : {};
  const prompts = isRecord(value.agentPrompts) ? value.agentPrompts : {};
  const failures = isRecord(value.buildFailures) ? value.buildFailures : {};
  const tokenStats = isRecord(value.tokenStats) ? value.tokenStats : {};
  return {
    dateKey: value.dateKey,
    detectedAgents: parseDetectedAgents(
      value.detectedAgents,
      prompts,
      tokenStats,
    ),
    session: {
      hardcodeMs: safeNumber(session.hardcodeMs),
      vibecodeMs: safeNumber(session.vibecodeMs),
    },
    agentPrompts: {
      claudeCode: safeNumber(prompts.claudeCode),
      codex: safeNumber(prompts.codex),
    },
    buildFailures: {
      total: safeNumber(failures.total),
      byCategory: parseNumberRecord(failures.byCategory),
    },
    tokenStats: {
      claudeCode: parseClaudeTokens(tokenStats.claudeCode),
      codex: parseCodexTokens(tokenStats.codex),
    },
    agentFileCursors: parseCursors(value.agentFileCursors),
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

function cloneState(state: DailySprintlyState): DailySprintlyState {
  return {
    dateKey: state.dateKey,
    detectedAgents: [...state.detectedAgents],
    session: { ...state.session },
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
    },
    agentFileCursors: Object.fromEntries(
      Object.entries(state.agentFileCursors).map(([filePath, cursor]) => [
        filePath,
        { ...cursor },
      ]),
    ),
  };
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDetectedAgents(
  value: unknown,
  prompts: Record<string, unknown>,
  tokenStats: Record<string, unknown>,
): AgentId[] {
  if (Array.isArray(value)) {
    return value.filter((agent): agent is AgentId => isAgentId(agent));
  }

  const detected: AgentId[] = [];
  if (safeNumber(prompts.claudeCode) > 0 || parseClaudeTokens(tokenStats.claudeCode)) {
    detected.push('claude-code');
  }
  if (safeNumber(prompts.codex) > 0 || parseCodexTokens(tokenStats.codex) !== 'unavailable') {
    detected.push('codex');
  }
  return detected;
}

function isAgentId(value: unknown): value is AgentId {
  return value === 'claude-code' || value === 'codex';
}
