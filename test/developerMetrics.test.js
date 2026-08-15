const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateDeveloperMetrics,
  deriveDeveloperProfile,
} = require('../out/tracking/developerMetrics');

function input(overrides = {}) {
  return {
    sessionDurationMs: 100_000,
    coding: { manualMs: 60_000, aiAssistedMs: 20_000, automationMs: 0, unknownBulkMs: 0 },
    fileEdits: 10,
    fileSaves: 9,
    fileSwitches: 2,
    terminalCommands: 5,
    terminalCommandsByCategory: { build: 1, test: 2, git: 1, lint: 0 },
    failures: 2,
    recoveredFailures: 2,
    successfulRuns: 3,
    ...overrides,
  };
}

test('developer metrics use reproducible ratios', () => {
  const metrics = calculateDeveloperMetrics(input());
  assert.equal(metrics.focusScore, 80);
  assert.equal(metrics.contextSwitches, 2);
  assert.equal(metrics.aiBalance, 25);
  assert.equal(metrics.recoveryRate, 100);
  assert.equal(metrics.testingDiscipline, 60);
  assert.equal(metrics.cleanRun, false);
});

test('developer profile selects measurable primary archetype and traits', () => {
  const profile = deriveDeveloperProfile(input());
  assert.equal(profile.primary, 'Test Monk');
  assert.ok(profile.traits.includes('High recovery'));
  assert.ok(profile.traits.includes('AI-assisted'));
});

test('clean sessions receive a clean recovery signal without fake failures', () => {
  const metrics = calculateDeveloperMetrics(input({ failures: 0, recoveredFailures: 0 }));
  assert.equal(metrics.cleanRun, true);
  assert.equal(metrics.recoveryRate, 100);
});
