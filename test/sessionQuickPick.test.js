const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return { QuickPickItemKind: { Separator: -1 } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { buildPanelItems, buildSessionPanelSummary } = require('../out/panels/sessionQuickPick');
Module._load = originalLoad;

function trackerStats(overrides = {}) {
  return {
    isRecording: false,
    startedAt: null,
    durationSeconds: 0,
    fileEdits: 0,
    fileSaves: 0,
    fileSwitches: 0,
    activeFiles: new Set(),
    linesChanged: 0,
    terminalCommands: 0,
    isPaused: false,
    totalPausedSeconds: 0,
    pausedAt: null,
    ...overrides,
  };
}

function sessionState(overrides = {}) {
  return {
    version: 3,
    detectedAgents: [],
    session: {
      id: null,
      startedAt: null,
      endedAt: null,
      isActive: false,
      isPaused: false,
      pausedAt: null,
      pauses: [],
      hardcodeMs: 0,
      vibecodeMs: 0,
    },
    agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 0 },
    buildFailures: { total: 0, byCategory: {} },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    agentFileCursors: {},
    ...overrides,
  };
}

test('panel summary presents an active sprint with separate agent usage', () => {
  const state = sessionState({
    detectedAgents: ['claude-code', 'codex'],
    session: {
      ...sessionState().session,
      id: 'session-one',
      startedAt: 1_000,
      isActive: true,
      hardcodeMs: 180_000,
      vibecodeMs: 60_000,
    },
    agentPrompts: { claudeCode: 3, codex: 2, githubCopilot: 0 },
    buildFailures: { total: 1, byCategory: { type_error: 1 } },
    tokenStats: {
      claudeCode: { input: 1_000, output: 500, cacheRead: 0, cacheCreate: 0 },
      codex: { total: 750 },
      githubCopilot: null,
    },
  });
  const summary = buildSessionPanelSummary(trackerStats({
    isRecording: true,
    startedAt: new Date(1_000),
    durationSeconds: 125,
  }), state);

  assert.equal(summary.scope, 'Current session');
  assert.equal(summary.status, 'In progress');
  assert.equal(summary.duration, '02:05');
  assert.equal(summary.promptUsage, '5 total · Claude 3 · Codex 2');
  assert.match(summary.tokenUsage, /Claude ~1\.5K · Codex ~750/);
  assert.equal(summary.buildFailures, '1 total · Type Error 1');
});

test('panel summary distinguishes completed and empty states', () => {
  const completed = sessionState({
    session: {
      ...sessionState().session,
      id: 'session-two',
      startedAt: 1_000,
      endedAt: 62_000,
    },
  });
  const latest = buildSessionPanelSummary(trackerStats(), completed);
  const empty = buildSessionPanelSummary(trackerStats(), sessionState());

  assert.equal(latest.scope, 'Last session');
  assert.equal(latest.status, 'Completed');
  assert.equal(latest.duration, '01:01');
  assert.equal(empty.scope, 'No session');
  assert.equal(empty.status, 'Ready');
});

test('panel summary includes GitHub Copilot Chat prompts and tokens', () => {
  const state = sessionState({
    detectedAgents: ['github-copilot'],
    session: {
      ...sessionState().session,
      id: 'copilot-session',
      startedAt: 1_000,
      isActive: true,
    },
    agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 2 },
    tokenStats: {
      claudeCode: null,
      codex: 'unavailable',
      githubCopilot: { input: 1_200, output: 300, credits: 2 },
    },
  });

  const summary = buildSessionPanelSummary(trackerStats(), state);
  assert.equal(summary.promptUsage, '2 total · Claude 0 · Codex 0 · Copilot 2');
  assert.equal(summary.tokenUsage, 'Copilot ~1.5K');
});

test('panel summary hydrates from the finalized record after a reload', () => {
  const state = sessionState({
    session: {
      ...sessionState().session,
      id: 'reloaded-session',
      startedAt: 1_000,
      endedAt: 61_000,
    },
  });
  const record = {
    schemaVersion: 'devstrava.session.v1',
    id: 'reloaded-session',
    startedAt: 1_000,
    endedAt: 31_000,
    activeDurationMs: 30_000,
    coding: { manualMs: 10_000, aiAssistedMs: 0, automationMs: 0, unknownBulkMs: 20_000 },
    edits: 42,
    linesChanged: 7,
    fileSaves: 3,
    fileSwitches: 2,
    filesTouched: 4,
    terminalOpens: 1,
    terminalCommands: 5,
    terminalCommandsByCategory: { build: 1, test: 2 },
    agentPrompts: { claudeCode: 6, codex: 0, githubCopilot: 0 },
    buildFailures: { total: 2, byCategory: { type_error: 2 }, recoveredFailures: 1 },
  };

  const summary = buildSessionPanelSummary(trackerStats(), state, record);
  assert.equal(summary.scope, 'Last session');
  assert.equal(summary.duration, '00:30');
  assert.equal(summary.promptUsage, '6 total · Claude 6 · Codex 0');
  assert.match(summary.buildFailures, /^2 total · Type Error 2/);
});

test('Quick Panel includes report redirect and website sync actions', () => {
  const stats = trackerStats();
  const state = sessionState();
  const items = buildPanelItems(
    {}, stats, state,
    {
      scope: 'No session', status: 'Ready', duration: '00:00', codingSplit: 'Manual 0%',
      archetype: 'Steady Builder', metricSummary: 'Focus 0', promptUsage: '0', tokenUsage: '0', buildFailures: '0',
    },
    undefined,
    null,
    {
      connectionStatus: 'disconnected', apiUrl: 'http://localhost:3000', environment: 'development',
      syncPreference: 'never', localOnly: true, leaderboardOptIn: false,
      pendingCount: 2, failedCount: 1, lastSuccessfulSync: null, lastSyncError: null,
    },
  );
  const labels = items.map((item) => item.label).join('\n');
  assert.match(labels, /View Session Report/);
  assert.match(labels, /Sync Pending Sessions/);
  assert.match(labels, /Website disconnected/);
});
