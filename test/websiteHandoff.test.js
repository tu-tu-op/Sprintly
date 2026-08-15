const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const {
  createLeaderboardPayload,
  createSessionSharePayload,
  isoWeek,
} = require('../out/tracking/websiteHandoff');
Module._load = originalLoad;

function record(id, endedAt) {
  return {
    schemaVersion: 'devstrava.session.v1',
    version: 1,
    id,
    startedAt: endedAt - 60_000,
    endedAt,
    activeDurationMs: 60_000,
    pauses: [],
    coding: { manualMs: 40_000, aiAssistedMs: 20_000, automationMs: 0, unknownBulkMs: 0 },
    edits: 2,
    linesChanged: 4,
    fileSaves: 1,
    fileSwitches: 1,
    filesTouched: 1,
    terminalOpens: 0,
    terminalCommands: 0,
    terminalCommandsByCategory: {
      build: 0, test: 0, 'package-manager': 0, git: 0, 'dev-server': 0,
      lint: 0, formatter: 0, deployment: 0, other: 0,
    },
    agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 0 },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    buildFailures: { total: 0, byCategory: {}, successfulRuns: 0, recoveredFailures: 0, failureStreak: 0, maxFailureStreak: 0 },
    archetype: 'Steady Builder',
    traits: [],
    metrics: { focusScore: 100, contextSwitches: 1, shippingActivity: 0, testingDiscipline: 0, aiBalance: 33, recoveryRate: 100, cleanRun: true },
    scores: { devScoreVersion: 1, focus: 100, consistency: 50, recovery: 100, testingDiscipline: 0, shippingActivity: 0, aiBalance: 33, devScore: 60 },
    completed: true,
  };
}

test('session share payload is versioned and aggregate-only', () => {
  const payload = createSessionSharePayload(record('share-one', Date.parse('2026-08-15T12:00:00Z')));
  assert.equal(payload.schemaVersion, 'devstrava.session.v1');
  assert.equal(payload.payloadType, 'session.share.v1');
  assert.equal(payload.session.sessionId, 'share-one');
  assert.equal(payload.session.startedAt, '2026-08-15T11:59:00.000Z');
  assert.equal('rawCommand' in payload.session, false);
});

test('leaderboard payload contains aggregate fields only and does not infer region', () => {
  const now = Date.parse('2026-08-15T12:00:00Z');
  const payload = createLeaderboardPayload([record('leader-one', now)], null, now);
  assert.equal(payload.schemaVersion, 'devstrava.session.v1');
  assert.equal(payload.payloadType, 'leaderboard.aggregate.v1');
  assert.equal(payload.region, null);
  assert.equal(payload.sessions, 1);
  assert.equal(payload.activeMinutes, 1);
  assert.equal('session' in payload, false);
  assert.match(payload.week, /^2026-W\d{2}$/);
  assert.equal(isoWeek(now), payload.week);
});
