import { calculateDeveloperScore } from './gamification';
import type { SessionHistoryRecord } from './sessionHistory';

export type AggregationPeriod = 'today' | 'week' | 'month' | 'all';

export interface SessionAggregation {
  period: AggregationPeriod;
  sessions: number;
  codingTimeMs: number;
  activeTimeMs: number;
  averageSessionMs: number;
  averageCodingTimeMs: number;
  averageFocusScore: number;
  averageShippingActivity: number;
  averageTestingDiscipline: number;
  aiPrompts: number;
  aiBalance: number;
  failures: number;
  recoveredFailures: number;
  recoveryRate: number;
  currentStreak: number;
  longestStreak: number;
  bestSessionId: string | null;
  longestSessionId: string | null;
  longestSessionMs: number;
  devScore: number;
  personalRecords: {
    longestSessionMs: number;
    longestSessionId: string | null;
    highestWeeklyCodingTimeMs: number;
    bestRecoveryRate: number;
    longestStreak: number;
  };
}

export function aggregateSessions(
  records: readonly SessionHistoryRecord[],
  period: AggregationPeriod,
  now = Date.now(),
): SessionAggregation {
  const filtered = records
    // Records created by the pre-v1 local wrapper did not have `completed`.
    .filter((record) => record.completed !== false && inPeriod(record.endedAt, period, now))
    .sort(compareRecords);
  const codingTimeMs = filtered.reduce((total, record) => total + codingDuration(record), 0);
  const activeTimeMs = filtered.reduce((total, record) => total + record.activeDurationMs, 0);
  const failures = filtered.reduce((total, record) => total + record.buildFailures.total, 0);
  const recoveredFailures = filtered.reduce((total, record) => total + record.buildFailures.recoveredFailures, 0);
  const longest = filtered.reduce<SessionHistoryRecord | null>((best, record) => (
    !best || record.activeDurationMs > best.activeDurationMs ? record : best
  ), null);
  const best = filtered.reduce<SessionHistoryRecord | null>((bestRecord, record) => (
    !bestRecord || bestSessionSort(record, bestRecord) < 0 ? record : bestRecord
  ), null);
  const aiTime = filtered.reduce((total, record) => total + record.coding.aiAssistedMs, 0);
  const promptTotal = filtered.reduce((total, record) => total
    + record.agentPrompts.claudeCode
    + record.agentPrompts.codex
    + record.agentPrompts.githubCopilot, 0);
  const recoveryRate = failures === 0 ? (filtered.length ? 100 : 0) : percentage(recoveredFailures, failures);
  const currentStreak = calculateCurrentStreak(records, now);
  const longestStreak = calculateLongestStreak(records, now);
  const averageMetric = (selector: (record: SessionHistoryRecord) => number): number => filtered.length
    ? Math.round(filtered.reduce((total, record) => total + selector(record), 0) / filtered.length)
    : 0;
  const base: SessionAggregation = {
    period,
    sessions: filtered.length,
    codingTimeMs,
    activeTimeMs,
    averageSessionMs: filtered.length ? activeTimeMs / filtered.length : 0,
    averageCodingTimeMs: filtered.length ? codingTimeMs / filtered.length : 0,
    averageFocusScore: averageMetric((record) => record.metrics.focusScore),
    averageShippingActivity: averageMetric((record) => record.metrics.shippingActivity),
    averageTestingDiscipline: averageMetric((record) => record.metrics.testingDiscipline),
    aiPrompts: promptTotal,
    aiBalance: percentage(aiTime, codingTimeMs),
    failures,
    recoveredFailures,
    recoveryRate,
    currentStreak,
    longestStreak,
    bestSessionId: best?.id ?? null,
    longestSessionId: longest?.id ?? null,
    longestSessionMs: longest?.activeDurationMs ?? 0,
    devScore: 0,
    personalRecords: {
      longestSessionMs: maxRecord(records, (record) => record.activeDurationMs),
      longestSessionId: longestRecordId(records, (record) => record.activeDurationMs),
      highestWeeklyCodingTimeMs: highestWeeklyCodingTime(records),
      bestRecoveryRate: records.reduce((bestRate, record) => Math.max(bestRate, record.metrics.recoveryRate), 0),
      longestStreak,
    },
  };
  base.devScore = filtered.length ? calculateDeveloperScore(base).score : 0;
  return base;
}

export function calculateLongestStreak(records: readonly SessionHistoryRecord[], _now = Date.now()): number {
  const days = sortedDayKeys(records);
  let best = 0;
  let run = 0;
  let previous: Date | undefined;
  for (const key of days) {
    const current = dateFromDayKey(key);
    if (previous && dayDifference(previous, current) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    previous = current;
  }
  return best;
}

export function calculateCurrentStreak(records: readonly SessionHistoryRecord[], now = Date.now()): number {
  const days = new Set(records.map((record) => localDay(record.endedAt)));
  const cursor = startOfDay(new Date(now));
  let streak = 0;
  for (let index = 0; index < 3660; index += 1) {
    if (!days.has(localDay(cursor.getTime()))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function inPeriod(timestamp: number, period: AggregationPeriod, now: number): boolean {
  if (period === 'all') return true;
  const current = new Date(now);
  const start = startOfDay(new Date(now));
  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === 'month') {
    start.setDate(1);
  }
  return timestamp >= start.getTime() && timestamp <= current.getTime();
}

function highestWeeklyCodingTime(records: readonly SessionHistoryRecord[]): number {
  const buckets = new Map<string, number>();
  for (const record of records) {
    const date = startOfDay(new Date(record.endedAt));
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = localDay(date.getTime());
    buckets.set(key, (buckets.get(key) ?? 0) + codingDuration(record));
  }
  return Math.max(0, ...buckets.values());
}

function codingDuration(record: SessionHistoryRecord): number {
  return record.coding.manualMs + record.coding.aiAssistedMs
    + record.coding.automationMs + record.coding.unknownBulkMs;
}

function maxRecord(records: readonly SessionHistoryRecord[], selector: (record: SessionHistoryRecord) => number): number {
  return Math.max(0, ...records.map(selector));
}

function longestRecordId(records: readonly SessionHistoryRecord[], selector: (record: SessionHistoryRecord) => number): string | null {
  return records.reduce<SessionHistoryRecord | null>((best, record) => (
    !best || selector(record) > selector(best) ? record : best
  ), null)?.id ?? null;
}

function bestSessionSort(left: SessionHistoryRecord, right: SessionHistoryRecord): number {
  const leftScore = left.scores?.devScore ?? 0;
  const rightScore = right.scores?.devScore ?? 0;
  return rightScore - leftScore
    || (right.metrics.focusScore - left.metrics.focusScore)
    || (right.metrics.shippingActivity - left.metrics.shippingActivity)
    || (right.endedAt - left.endedAt)
    || left.id.localeCompare(right.id);
}

function compareRecords(left: SessionHistoryRecord, right: SessionHistoryRecord): number {
  return right.endedAt - left.endedAt || left.id.localeCompare(right.id);
}

function percentage(value: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
}

function sortedDayKeys(records: readonly SessionHistoryRecord[]): string[] {
  return [...new Set(records.map((record) => localDay(record.endedAt)))].sort();
}

function dateFromDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayDifference(left: Date, right: Date): number {
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}

function startOfDay(date: Date): Date {
  date.setHours(0, 0, 0, 0);
  return date;
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
