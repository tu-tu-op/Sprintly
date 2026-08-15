import { SessionAggregation } from './sessionAggregation';
import { SessionHistoryRecord } from './sessionHistory';

export const DEVELOPER_SCORE_VERSION = 1;

export interface DeveloperScore {
  version: 1;
  score: number;
  components: {
    focus: number;
    consistency: number;
    shipping: number;
    recovery: number;
    validation: number;
    aiBalance: number;
  };
}

export type BadgeId =
  | 'first-sprint'
  | 'week-streak'
  | 'recovery-pro'
  | 'test-monk'
  | 'terminal-warrior'
  | 'shipping-machine';

export interface DeveloperBadge {
  id: BadgeId;
  label: string;
  description: string;
  earned: boolean;
  progress: number;
}

/**
 * Calculates a transparent local score. It intentionally rewards consistency,
 * validation, recovery, and shipping instead of treating raw hours as status.
 */
export function calculateDeveloperScore(aggregation: SessionAggregation): DeveloperScore {
  const components = {
    focus: aggregation.averageFocusScore,
    consistency: clamp(aggregation.longestStreak * 14, 0, 100),
    shipping: aggregation.averageShippingActivity,
    recovery: aggregation.recoveryRate,
    validation: aggregation.averageTestingDiscipline,
    aiBalance: aggregation.aiBalance > 0 ? Math.max(0, 100 - Math.abs(aggregation.aiBalance - 35) * 2) : 50,
  };
  const score = Math.round(
    components.focus * 0.2
      + components.consistency * 0.15
      + components.shipping * 0.2
      + components.recovery * 0.15
      + components.validation * 0.2
      + components.aiBalance * 0.1,
  );
  return { version: DEVELOPER_SCORE_VERSION, score: clamp(score, 0, 100), components };
}

export function deriveBadges(
  records: readonly SessionHistoryRecord[],
  aggregation: SessionAggregation,
): DeveloperBadge[] {
  const sessionCount = records.length;
  const averageTesting = averageRecords(records, (record) => record.metrics.testingDiscipline);
  const averageShipping = averageRecords(records, (record) => record.metrics.shippingActivity);
  const terminalSessions = records.filter((record) => record.terminalCommands > 0).length;
  const recoveredSessions = records.filter((record) => record.buildFailures.recoveredFailures > 0).length;
  return [
    badge('first-sprint', 'First Sprint', 'Complete your first tracked session.', sessionCount > 0 ? 1 : 0, 1),
    badge('week-streak', 'Seven-day streak', 'Record activity on seven consecutive days.', aggregation.longestStreak, 7),
    badge('recovery-pro', 'Recovery pro', 'Recover from a failed run in three sessions.', recoveredSessions, 3),
    badge('test-monk', 'Test Monk', 'Maintain a 70% validation signal across three sessions.', averageTesting >= 70 ? sessionCount : 0, 3),
    badge('terminal-warrior', 'Terminal Warrior', 'Use categorized terminal work in five sessions.', terminalSessions, 5),
    badge('shipping-machine', 'Shipping Machine', 'Maintain an 80% shipping signal across five sessions.', averageShipping >= 80 ? sessionCount : 0, 5),
  ];
}

function badge(id: BadgeId, label: string, description: string, progress: number, target: number): DeveloperBadge {
  const safeProgress = clamp(Math.floor(progress), 0, target);
  return { id, label, description, earned: safeProgress >= target, progress: safeProgress };
}

function averageRecords(records: readonly SessionHistoryRecord[], selector: (record: SessionHistoryRecord) => number): number {
  return records.length ? records.reduce((sum, record) => sum + selector(record), 0) / records.length : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
