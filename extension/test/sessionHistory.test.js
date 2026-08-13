const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const { SessionHistoryStore, createAggregateSyncPayload } = require('../out/tracking/sessionHistory');
const { aggregateSessions, calculateLongestStreak } = require('../out/tracking/sessionAggregation');
Module._load = originalLoad;

class TestMemento {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  get(key) {
    return this.values.get(key);
  }

  update(key, value) {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function record(date, overrides = {}) {
  const timestamp = new Date(`${date}T12:00:00`).getTime();
  return {
    version: 1,
    id: `session-${date}`,
    startedAt: timestamp - 3_600_000,
    endedAt: timestamp,
    activeDurationMs: 3_600_000,
    pauses: [],
    coding: { manualMs: 2_000_000, aiAssistedMs: 1_000_000, automationMs: 0, unknownBulkMs: 0 },
    edits: 10,
    linesChanged: 20,
    fileSaves: 8,
    fileSwitches: 2,
    filesTouched: 3,
    terminalOpens: 1,
    terminalCommands: 4,
    terminalCommandsByCategory: {
      build: 1, test: 1, 'package-manager': 0, git: 1, 'dev-server': 0,
      lint: 0, formatter: 0, deployment: 0, other: 1,
    },
    agentPrompts: { claudeCode: 1, codex: 1, githubCopilot: 1 },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    buildFailures: {
      total: 1, byCategory: { test_failure: 1 }, successfulRuns: 1,
      recoveredFailures: 1, failureStreak: 0, maxFailureStreak: 1,
    },
    archetype: 'Test Monk',
    traits: ['Validation-minded'],
    metrics: {
      focusScore: 80, contextSwitches: 2, shippingActivity: 50,
      testingDiscipline: 50, aiBalance: 33, recoveryRate: 100, cleanRun: false,
    },
    ...overrides,
  };
}

test('history store persists aggregate records and enforces retention', async () => {
  const memento = new TestMemento();
  const store = new SessionHistoryStore(memento, 2);
  store.append(record('2026-08-10'));
  store.append(record('2026-08-11'));
  store.append(record('2026-08-12'));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(store.list().map((item) => item.id), ['session-2026-08-12', 'session-2026-08-11']);
  const reopened = new SessionHistoryStore(memento, 2);
  assert.deepEqual(reopened.list().map((item) => item.id), ['session-2026-08-12', 'session-2026-08-11']);
  reopened.clear();
  assert.equal(reopened.list().length, 0);
});

test('aggregation calculates period totals, recovery, records, and streaks from history', () => {
  const now = new Date('2026-08-13T15:00:00').getTime();
  const records = [
    record('2026-08-13'),
    record('2026-08-12', {
      activeDurationMs: 7_200_000,
      coding: { manualMs: 6_000_000, aiAssistedMs: 1_000_000, automationMs: 0, unknownBulkMs: 0 },
      metrics: { focusScore: 80, contextSwitches: 2, shippingActivity: 80, testingDiscipline: 50, aiBalance: 33, recoveryRate: 100, cleanRun: false },
    }),
    record('2026-08-08'),
  ];
  const week = aggregateSessions(records, 'week', now);
  assert.equal(week.sessions, 2);
  assert.equal(week.aiPrompts, 6);
  assert.equal(week.failures, 2);
  assert.equal(week.recoveryRate, 100);
  assert.equal(week.longestSessionMs, 7_200_000);
  assert.equal(week.bestSessionId, 'session-2026-08-12');
  assert.equal(calculateLongestStreak(records, now), 2);
  assert.equal(aggregateSessions(records, 'today', now).sessions, 1);
  assert.equal(aggregateSessions(records, 'all', now).sessions, 3);
});

test('sync payload is versioned and contains aggregate session data only', () => {
  const source = record('2026-08-13');
  const payload = createAggregateSyncPayload([source], { cloudSyncEnabled: false }, 123);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.generatedAt, 123);
  assert.equal(payload.cloudSyncEnabled, false);
  assert.equal(payload.sessions[0].id, source.id);
  assert.equal('rawCommand' in payload.sessions[0], false);
  payload.sessions[0].coding.manualMs = 0;
  assert.equal(source.coding.manualMs, 2_000_000);
});
