/**
 * Public, aggregate-only contract shared by the extension and DevStrava web
 * handoff.  Keep this contract deliberately boring: it contains no source
 * code, prompt text, command text, terminal output, paths, or secrets.
 */
export const DEVSTRAVA_SESSION_SCHEMA_VERSION = 'devstrava.session.v1' as const;
export const DEVSTRAVA_EXPORT_SCHEMA_VERSION = 'devstrava.export.v1' as const;

export type DevStravaSessionSchemaVersion = typeof DEVSTRAVA_SESSION_SCHEMA_VERSION;

export interface DevStravaSessionContract {
  schemaVersion: DevStravaSessionSchemaVersion;
  /** Deprecated alias retained for older local consumers; use sessionId. */
  id?: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  activeDurationSeconds: number;
  pauseDurationSeconds: number;
  coding: {
    manualPercent: number;
    aiAssistedPercent: number;
    automationPercent: number;
    unknownBulkEditPercent: number;
    manualSeconds: number;
    aiAssistedSeconds: number;
    automationSeconds: number;
    unknownBulkEditSeconds: number;
  };
  activity: {
    edits: number;
    saves: number;
    filesTouched: number;
    fileSwitches: number;
    linesChangedEstimate: number;
  };
  terminal: {
    totalCommands: number;
    terminalOpens: number;
    build: number;
    test: number;
    git: number;
    packageManager: number;
    devServer: number;
    lint: number;
    formatter: number;
    deployment: number;
    other: number;
  };
  ai: {
    claudeCodePrompts: number;
    codexPrompts: number;
    copilotPrompts: number;
    tokenTotals: {
      claude: number | null;
      codex: number | null;
      copilot: number | null;
    };
  };
  reliability: {
    failures: number;
    recoveredFailures: number;
    recoveryRate: number;
    failureStreak: number;
    cleanSession: boolean;
    byCategory: Record<string, number>;
    successfulRuns?: number;
    maxFailureStreak?: number;
  };
  scores: {
    devScoreVersion: 1;
    focus: number;
    consistency: number;
    recovery: number;
    testingDiscipline: number;
    shippingActivity: number;
    aiBalance: number;
    devScore: number;
  };
  archetype: {
    primaryArchetype: string;
    secondaryTraits: string[];
  };
}

export interface DevStravaAggregateMetadata {
  period: 'today' | 'week' | 'month' | 'all';
  sessions: number;
  codingTimeSeconds: number;
  activeTimeSeconds: number;
  averageSessionSeconds: number;
  averageAiBalance: number;
  failures: number;
  recoveredFailures: number;
  recoveryRate: number;
  currentStreak: number;
  longestStreak: number;
  bestSessionId: string | null;
  longestSessionId: string | null;
  devScoreVersion: 1;
  devScore: number;
}

export interface DevStravaExportPayload {
  schemaVersion: DevStravaSessionSchemaVersion;
  exportVersion: typeof DEVSTRAVA_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  sessions: DevStravaSessionContract[];
  aggregates: Record<'today' | 'week' | 'month' | 'all', DevStravaAggregateMetadata>;
  scoring: {
    devScoreVersion: 1;
  };
  settings: {
    localHistoryEnabled: boolean;
    historyRetention: number;
    telemetryCategories: {
      codingActivity: boolean;
      agentUsage: boolean;
      buildFailures: boolean;
    };
    aiTracking: boolean;
  };
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validate a website/import session without coercing malformed values.  The
 * local legacy migration path is separate so an invalid import can never be
 * silently turned into a zero-filled session.
 */
export function validateSessionContract(value: unknown): ValidationResult<DevStravaSessionContract> {
  if (!isRecord(value)) {
    return failure('session must be an object');
  }
  if (value.schemaVersion !== DEVSTRAVA_SESSION_SCHEMA_VERSION) {
    return failure(`unsupported session schema: ${String(value.schemaVersion ?? 'missing')}`);
  }

  const errors: string[] = [];
  const sessionId = requireString(value.sessionId, 'sessionId', errors);
  const startedAt = requireIsoDate(value.startedAt, 'startedAt', errors);
  const endedAt = requireIsoDate(value.endedAt, 'endedAt', errors);
  if (startedAt && endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
    errors.push('endedAt must not be before startedAt');
  }
  const activeDurationSeconds = requireNonNegative(value.activeDurationSeconds, 'activeDurationSeconds', errors);
  const pauseDurationSeconds = requireNonNegative(value.pauseDurationSeconds, 'pauseDurationSeconds', errors);
  const coding = validateCoding(value.coding, errors);
  const activity = validateActivity(value.activity, errors);
  const terminal = validateTerminal(value.terminal, errors);
  const ai = validateAi(value.ai, errors);
  const reliability = validateReliability(value.reliability, errors);
  const scores = validateScores(value.scores, errors);
  const archetype = validateArchetype(value.archetype, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
      sessionId,
      startedAt,
      endedAt,
      activeDurationSeconds,
      pauseDurationSeconds,
      coding,
      activity,
      terminal,
      ai,
      reliability,
      scores,
      archetype,
    },
  };
}

export function isSupportedSessionSchema(value: unknown): boolean {
  return value === DEVSTRAVA_SESSION_SCHEMA_VERSION || value === 1;
}

export function isoDate(timestamp: number): string {
  const safe = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
  return new Date(safe).toISOString();
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function validateCoding(value: unknown, errors: string[]): DevStravaSessionContract['coding'] {
  const record = requireRecord(value, 'coding', errors);
  return {
    manualPercent: requirePercent(record.manualPercent, 'coding.manualPercent', errors),
    aiAssistedPercent: requirePercent(record.aiAssistedPercent, 'coding.aiAssistedPercent', errors),
    automationPercent: requirePercent(record.automationPercent, 'coding.automationPercent', errors),
    unknownBulkEditPercent: requirePercent(record.unknownBulkEditPercent, 'coding.unknownBulkEditPercent', errors),
    manualSeconds: requireNonNegative(record.manualSeconds, 'coding.manualSeconds', errors),
    aiAssistedSeconds: requireNonNegative(record.aiAssistedSeconds, 'coding.aiAssistedSeconds', errors),
    automationSeconds: requireNonNegative(record.automationSeconds, 'coding.automationSeconds', errors),
    unknownBulkEditSeconds: requireNonNegative(record.unknownBulkEditSeconds, 'coding.unknownBulkEditSeconds', errors),
  };
}

function validateActivity(value: unknown, errors: string[]): DevStravaSessionContract['activity'] {
  const record = requireRecord(value, 'activity', errors);
  return {
    edits: requireNonNegative(record.edits, 'activity.edits', errors),
    saves: requireNonNegative(record.saves, 'activity.saves', errors),
    filesTouched: requireNonNegative(record.filesTouched, 'activity.filesTouched', errors),
    fileSwitches: requireNonNegative(record.fileSwitches, 'activity.fileSwitches', errors),
    linesChangedEstimate: requireNonNegative(record.linesChangedEstimate, 'activity.linesChangedEstimate', errors),
  };
}

function validateTerminal(value: unknown, errors: string[]): DevStravaSessionContract['terminal'] {
  const record = requireRecord(value, 'terminal', errors);
  return {
    totalCommands: requireNonNegative(record.totalCommands, 'terminal.totalCommands', errors),
    terminalOpens: requireNonNegative(record.terminalOpens, 'terminal.terminalOpens', errors),
    build: requireNonNegative(record.build, 'terminal.build', errors),
    test: requireNonNegative(record.test, 'terminal.test', errors),
    git: requireNonNegative(record.git, 'terminal.git', errors),
    packageManager: requireNonNegative(record.packageManager, 'terminal.packageManager', errors),
    devServer: requireNonNegative(record.devServer, 'terminal.devServer', errors),
    lint: requireNonNegative(record.lint, 'terminal.lint', errors),
    formatter: requireNonNegative(record.formatter, 'terminal.formatter', errors),
    deployment: requireNonNegative(record.deployment, 'terminal.deployment', errors),
    other: requireNonNegative(record.other, 'terminal.other', errors),
  };
}

function validateAi(value: unknown, errors: string[]): DevStravaSessionContract['ai'] {
  const record = requireRecord(value, 'ai', errors);
  const tokens = requireRecord(record.tokenTotals, 'ai.tokenTotals', errors);
  return {
    claudeCodePrompts: requireNonNegative(record.claudeCodePrompts, 'ai.claudeCodePrompts', errors),
    codexPrompts: requireNonNegative(record.codexPrompts, 'ai.codexPrompts', errors),
    copilotPrompts: requireNonNegative(record.copilotPrompts, 'ai.copilotPrompts', errors),
    tokenTotals: {
      claude: requireNullableNonNegative(tokens.claude, 'ai.tokenTotals.claude', errors),
      codex: requireNullableNonNegative(tokens.codex, 'ai.tokenTotals.codex', errors),
      copilot: requireNullableNonNegative(tokens.copilot, 'ai.tokenTotals.copilot', errors),
    },
  };
}

function validateReliability(value: unknown, errors: string[]): DevStravaSessionContract['reliability'] {
  const record = requireRecord(value, 'reliability', errors);
  const byCategoryValue = record.byCategory;
  const byCategory: Record<string, number> = {};
  if (!isRecord(byCategoryValue)) {
    errors.push('reliability.byCategory must be an object');
  } else {
    for (const [key, count] of Object.entries(byCategoryValue)) {
      byCategory[key] = requireNonNegative(count, `reliability.byCategory.${key}`, errors);
    }
  }
  return {
    failures: requireNonNegative(record.failures, 'reliability.failures', errors),
    recoveredFailures: requireNonNegative(record.recoveredFailures, 'reliability.recoveredFailures', errors),
    recoveryRate: requirePercent(record.recoveryRate, 'reliability.recoveryRate', errors),
    failureStreak: requireNonNegative(record.failureStreak, 'reliability.failureStreak', errors),
    cleanSession: requireBoolean(record.cleanSession, 'reliability.cleanSession', errors),
    byCategory,
    successfulRuns: optionalNonNegative(record.successfulRuns, 'reliability.successfulRuns', errors),
    maxFailureStreak: optionalNonNegative(record.maxFailureStreak, 'reliability.maxFailureStreak', errors),
  };
}

function validateScores(value: unknown, errors: string[]): DevStravaSessionContract['scores'] {
  const record = requireRecord(value, 'scores', errors);
  if (record.devScoreVersion !== 1) {
    errors.push('scores.devScoreVersion must be 1');
  }
  return {
    devScoreVersion: 1,
    focus: requirePercent(record.focus, 'scores.focus', errors),
    consistency: requirePercent(record.consistency, 'scores.consistency', errors),
    recovery: requirePercent(record.recovery, 'scores.recovery', errors),
    testingDiscipline: requirePercent(record.testingDiscipline, 'scores.testingDiscipline', errors),
    shippingActivity: requirePercent(record.shippingActivity, 'scores.shippingActivity', errors),
    aiBalance: requirePercent(record.aiBalance, 'scores.aiBalance', errors),
    devScore: requirePercent(record.devScore, 'scores.devScore', errors),
  };
}

function validateArchetype(value: unknown, errors: string[]): DevStravaSessionContract['archetype'] {
  const record = requireRecord(value, 'archetype', errors);
  const primaryArchetype = requireString(record.primaryArchetype, 'archetype.primaryArchetype', errors);
  const secondaryTraits = Array.isArray(record.secondaryTraits)
    ? record.secondaryTraits.filter((trait): trait is string => typeof trait === 'string')
    : [];
  if (!Array.isArray(record.secondaryTraits)) {
    errors.push('archetype.secondaryTraits must be an array');
  }
  return { primaryArchetype, secondaryTraits };
}

function requireRecord(value: unknown, label: string, errors: string[]): Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return {};
  }
  return value;
}

function requireString(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${label} must be a non-empty string`);
    return '';
  }
  return value;
}

function requireIsoDate(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    errors.push(`${label} must be an ISO date`);
    return '';
  }
  return new Date(value).toISOString();
}

function requireNonNegative(value: unknown, label: string, errors: string[]): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${label} must be a non-negative number`);
    return 0;
  }
  return value;
}

function optionalNonNegative(value: unknown, label: string, errors: string[]): number | undefined {
  if (value === undefined) return undefined;
  return requireNonNegative(value, label, errors);
}

function requireNullableNonNegative(value: unknown, label: string, errors: string[]): number | null {
  if (value === null) return null;
  return requireNonNegative(value, label, errors);
}

function requirePercent(value: unknown, label: string, errors: string[]): number {
  const number = requireNonNegative(value, label, errors);
  if (number > 100) {
    errors.push(`${label} must be between 0 and 100`);
  }
  return number;
}

function requireBoolean(value: unknown, label: string, errors: string[]): boolean {
  if (typeof value !== 'boolean') {
    errors.push(`${label} must be a boolean`);
    return false;
  }
  return value;
}

function failure(message: string): ValidationFailure {
  return { ok: false, errors: [message] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
