const assert = require('node:assert/strict');
const test = require('node:test');

const { calculateDeveloperScore, deriveBadges } = require('../out/tracking/gamification');

function aggregation(overrides = {}) {
  return {
    period: 'all', sessions: 5, codingTimeMs: 12_000, averageSessionMs: 2_400,
    averageFocusScore: 80, averageShippingActivity: 90, averageTestingDiscipline: 80,
    aiPrompts: 4, aiBalance: 35, failures: 2, recoveredFailures: 2,
    recoveryRate: 100, bestSessionId: 's1', longestSessionMs: 4_000,
    longestStreak: 7,
    personalRecords: { longestSessionMs: 4_000, highestWeeklyCodingTimeMs: 8_000, bestRecoveryRate: 100, longestStreak: 7 },
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    terminalCommands: 2,
    buildFailures: { recoveredFailures: 1 },
    metrics: { testingDiscipline: 80, shippingActivity: 90 },
    ...overrides,
  };
}

test('developer score is versioned, bounded, and explainable', () => {
  const score = calculateDeveloperScore(aggregation());
  assert.equal(score.version, 1);
  assert.ok(score.score >= 0 && score.score <= 100);
  assert.equal(score.components.consistency, 98);
  assert.equal(score.components.aiBalance, 100);
});

test('badges expose progress from local session history', () => {
  const badges = deriveBadges(Array.from({ length: 5 }, () => record()), aggregation());
  assert.equal(badges.find((badge) => badge.id === 'first-sprint').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'week-streak').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'recovery-pro').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'shipping-machine').earned, true);
});
