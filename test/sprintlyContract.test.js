const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SPRINTLY_CONTRACT,
  SPRINTLY_SCHEMA_VERSION,
  createSprintlyExport,
  mapSessionRecord,
  serializeSprintlyExport,
  validateSprintlySession,
} = require('../out/tracking/sprintlyContract');

function record(overrides = {}) {
  return {
    id: 'contract-session',
    startedAt: Date.parse('2026-08-15T11:00:00.000Z'),
    endedAt: Date.parse('2026-08-15T12:00:00.000Z'),
    activeDurationMs: 3_000_000,
    coding: { manualMs: 1_800_000, aiAssistedMs: 900_000, automationMs: 150_000, unknownBulkMs: 150_000 },
    edits: 10,
    fileSaves: 2,
    filesTouched: 3,
    linesChanged: 20,
    terminalOpens: 1,
    terminalCommands: 3,
    terminalCommandsByCategory: {
      build: 1, test: 1, git: 0, 'package-manager': 0, 'dev-server': 0,
      lint: 0, formatter: 0, deployment: 0, other: 1,
    },
    agentPrompts: { claudeCode: 1, codex: 2, githubCopilot: 3 },
    tokenStats: {
      claudeCode: { input: 10, output: 20, cacheRead: 0, cacheCreate: 0 },
      codex: { total: 30 },
      githubCopilot: { input: 40, output: 50, credits: 1 },
    },
    buildFailures: {
      total: 1, recoveredFailures: 1, byCategory: { type_error: 1 },
      successfulRuns: 1, failureStreak: 0, maxFailureStreak: 1,
    },
    scores: {
      devScoreVersion: 1, focus: 80, consistency: 70, recovery: 100,
      testingDiscipline: 50, shippingActivity: 20, aiBalance: 30, devScore: 70,
    },
    archetype: 'Steady Builder',
    traits: ['Validation-minded'],
    ...overrides,
  };
}

test('serializes the exact website contract and preserves required aggregates', () => {
  const mapped = mapSessionRecord(record());
  assert.equal(mapped.payload.contract, SPRINTLY_CONTRACT);
  assert.equal(mapped.payload.schemaVersion, SPRINTLY_SCHEMA_VERSION);
  assert.equal(mapped.payload.sessionId, 'contract-session');
  assert.equal(mapped.payload.coding.manualPercent
    + mapped.payload.coding.aiAssistedPercent
    + mapped.payload.coding.automationPercent
    + mapped.payload.coding.unknownBulkEditPercent, 100);
  assert.equal(mapped.payload.terminal.totalCommands, 3);
  assert.equal(mapped.payload.ai.tokenTotals.codex, 30);
  assert.equal(mapped.payload.archetype.primary, 'Steady Builder');
  assert.equal(validateSprintlySession(mapped.payload).ok, true);
  assert.equal('rawCommand' in mapped.payload, false);
  assert.equal('promptText' in mapped.payload, false);
});

test('rejects an invalid contract instead of coercing malformed values', () => {
  const payload = mapSessionRecord(record()).payload;
  const invalid = { ...payload, schemaVersion: 2, coding: { ...payload.coding, manualPercent: -1 } };
  const validation = validateSprintlySession(invalid);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /schemaVersion|manualPercent/);
});

test('accepts the website score range while keeping percentage dimensions bounded', () => {
  const payload = mapSessionRecord(record()).payload;
  const scorePayload = { ...payload, scores: { ...payload.scores, devScore: 900 } };
  assert.equal(validateSprintlySession(scorePayload).ok, true);
  const invalid = { ...payload, scores: { ...payload.scores, focus: 101 } };
  assert.equal(validateSprintlySession(invalid).ok, false);
});

test('requires explicit RFC 3339 timezones and consistent recovery aggregates', () => {
  const payload = mapSessionRecord(record()).payload;
  const timezoneLess = { ...payload, startedAt: '2026-08-15T11:00:00' };
  assert.equal(validateSprintlySession(timezoneLess).ok, false);

  const submittedWithoutTimezone = { ...payload, submittedAt: '2026-08-15T12:00:00' };
  assert.equal(validateSprintlySession(submittedWithoutTimezone).ok, false);

  const inconsistentRecovery = {
    ...payload,
    reliability: { ...payload.reliability, failures: 3, recoveredFailures: 1, recoveryRate: 100 },
  };
  assert.equal(validateSprintlySession(inconsistentRecovery).ok, false);
});

test('rejects aggregate strings, arrays, and counts outside canonical bounds', () => {
  const payload = mapSessionRecord(record()).payload;
  const tooManyTraits = {
    ...payload,
    archetype: { ...payload.archetype, traits: ['a', 'b', 'c', 'd'] },
  };
  assert.equal(validateSprintlySession(tooManyTraits).ok, false);

  const oversizedCount = {
    ...payload,
    activity: { ...payload.activity, edits: 1_000_000_001 },
  };
  assert.equal(validateSprintlySession(oversizedCount).ok, false);

  const oversizedId = { ...payload, sessionId: 'x'.repeat(201) };
  assert.equal(validateSprintlySession(oversizedId).ok, false);
});

test('reports unsupported fields and never serializes them', () => {
  const payload = mapSessionRecord(record()).payload;
  const unsupported = { ...payload, sourceCode: 'should never cross the boundary' };
  const validation = validateSprintlySession(unsupported);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /sourceCode is not supported/);

  const exported = createSprintlyExport([record()], new Date('2026-08-15T12:00:00.000Z'));
  const serialized = serializeSprintlyExport(exported.payload);
  assert.equal(serialized.includes('sourceCode'), false);
  assert.equal(serialized.includes('promptText'), false);
});

test('compatibility mapping makes website omissions explicit as warnings', () => {
  const mapped = mapSessionRecord(record({
    terminalOpens: 2,
    terminalCommandsByCategory: {
      build: 0, test: 0, git: 0, 'package-manager': 0, 'dev-server': 0,
      lint: 0, formatter: 1, deployment: 1, other: 0,
    },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
  }));
  assert.match(mapped.warnings.map((warning) => warning.field).join(','), /terminal\.formatter/);
  assert.match(mapped.warnings.map((warning) => warning.field).join(','), /ai\.tokenTotals\.codex/);
  assert.equal(mapped.payload.terminal.other, 2);
});
