const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { SprintlyApiError } = require('../out/integration/sprintlyApi');
const { SprintlySyncService } = require('../out/integration/sprintlySync');
const { DelegatingPairingAdapter } = require('../out/integration/pairing');
const { SprintlyTokenStore } = require('../out/integration/secureTokenStore');
const { SyncOutbox } = require('../out/integration/syncOutbox');
const { SyncStateStore } = require('../out/integration/syncState');
Module._load = originalLoad;

class TestMemento {
  constructor() { this.values = new Map(); }
  get(key) { return this.values.get(key); }
  update(key, value) { this.values.set(key, value); return Promise.resolve(); }
}

function record(id = 'sync-session') {
  return {
    schemaVersion: 'devstrava.session.v1', version: 1, id,
    startedAt: 1_000, endedAt: 301_000, activeDurationMs: 300_000, pauses: [],
    coding: { manualMs: 300_000, aiAssistedMs: 0, automationMs: 0, unknownBulkMs: 0 },
    edits: 2, linesChanged: 2, fileSaves: 1, fileSwitches: 0, filesTouched: 1,
    terminalOpens: 0, terminalCommands: 0,
    terminalCommandsByCategory: {
      build: 0, test: 0, git: 0, 'package-manager': 0, 'dev-server': 0,
      lint: 0, formatter: 0, deployment: 0, other: 0,
    },
    agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 0 },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    buildFailures: {
      total: 0, byCategory: {}, successfulRuns: 0, recoveredFailures: 0,
      failureStreak: 0, maxFailureStreak: 0,
    },
    archetype: 'Steady Builder', traits: [],
    metrics: { focusScore: 1, contextSwitches: 0, shippingActivity: 0, testingDiscipline: 0, aiBalance: 0, recoveryRate: 100, cleanRun: true },
    scores: { devScoreVersion: 1, focus: 1, consistency: 0, recovery: 100, testingDiscipline: 0, shippingActivity: 0, aiBalance: 0, devScore: 1 },
    completed: true,
  };
}

function setup(settings, upload, clock = () => 2_000) {
  const memento = new TestMemento();
  const secrets = {
    values: new Map([['sprintly.extension.developmentToken', 'dev-token']]),
    get: async (key) => secrets.values.get(key),
    store: async (key, value) => secrets.values.set(key, value),
    delete: async (key) => secrets.values.delete(key),
  };
  const outbox = new SyncOutbox(memento, { now: clock, retryBaseMs: 100, retryMaxMs: 500 });
  const stateStore = new SyncStateStore(memento);
  let uploadCalls = 0;
  const client = {
    async health() { return { ok: true, contract: 'devstrava.session.v1', schemaVersion: 1 }; },
    async uploadSessions(sessions) {
      uploadCalls += 1;
      return typeof upload === 'function' ? upload(sessions) : upload;
    },
  };
  const service = new SprintlySyncService({
    tokenStore: new SprintlyTokenStore(secrets), outbox, stateStore,
    readSettings: () => ({
      apiUrl: 'http://localhost:3000', environment: 'development',
      syncPreference: settings.syncPreference ?? 'completed',
      leaderboardOptIn: settings.leaderboardOptIn ?? false,
      developmentToken: '', websiteUrl: 'http://localhost:3000',
    }),
    createClient: () => client,
    now: clock,
  });
  return { service, outbox, stateStore, secrets, get uploadCalls() { return uploadCalls; } };
}

test('valid completed session is queued, uploaded, and marked synced', async () => {
  const setupValue = setup({}, { acceptedSessionIds: ['sync-session'], duplicateSessionIds: [], rejected: [] });
  const result = await setupValue.service.syncCompletedSession(record());
  assert.equal(result.state, 'synced');
  assert.equal(result.syncedCount, 1);
  assert.equal(setupValue.outbox.get('sync-session').state, 'synced');
  assert.equal(setupValue.stateStore.get().lastSuccessfulSync, 2_000);
  assert.equal(setupValue.uploadCalls, 1);
});

test('duplicate session upload is a successful idempotent result', async () => {
  const setupValue = setup({}, { acceptedSessionIds: [], duplicateSessionIds: ['sync-session'], rejected: [] });
  const result = await setupValue.service.syncCurrentSession(record());
  assert.equal(result.state, 'synced');
  assert.equal(result.duplicateCount, 1);
  assert.equal(setupValue.outbox.get('sync-session').state, 'synced');
});

test('local-only mode prevents queueing and network calls', async () => {
  const setupValue = setup({ syncPreference: 'never' }, { acceptedSessionIds: ['sync-session'], duplicateSessionIds: [], rejected: [] });
  const result = await setupValue.service.syncCurrentSession(record());
  assert.equal(result.state, 'skipped');
  assert.equal(setupValue.uploadCalls, 0);
  assert.equal(setupValue.outbox.list().length, 0);
});

test('selected mode uploads only an explicitly selected session', async () => {
  const setupValue = setup({ syncPreference: 'selected' }, { acceptedSessionIds: ['sync-session'], duplicateSessionIds: [], rejected: [] });
  const automatic = await setupValue.service.syncCompletedSession(record());
  assert.equal(automatic.state, 'skipped');
  assert.equal(setupValue.uploadCalls, 0);
  const explicit = await setupValue.service.syncCurrentSession(record());
  assert.equal(explicit.state, 'synced');
  assert.equal(setupValue.uploadCalls, 1);
});

test('temporary upload errors remain queued and can retry later', async () => {
  let attempt = 0;
  let now = 2_000;
  const setupValue = setup({}, () => {
    attempt += 1;
    if (attempt === 1) throw new SprintlyApiError('offline', { kind: 'network', retryable: true });
    return { acceptedSessionIds: ['sync-session'], duplicateSessionIds: [], rejected: [] };
  }, () => now);
  const first = await setupValue.service.syncCompletedSession(record());
  assert.equal(first.state, 'failed');
  assert.equal(setupValue.outbox.get('sync-session').state, 'pending');
  assert.equal(setupValue.outbox.get('sync-session').nextRetryTime, 2_100);
  const beforeDue = await setupValue.service.resume();
  assert.equal(beforeDue.state, 'queued');
  assert.equal(setupValue.uploadCalls, 1);
  now = 2_100;
  const retry = await setupValue.service.resume();
  assert.equal(retry.state, 'synced');
  assert.equal(setupValue.uploadCalls, 2);
});

test('permanent validation error is retained as a failed record', async () => {
  const setupValue = setup({}, () => {
    throw new SprintlyApiError('invalid payload', {
      kind: 'validation', retryable: false,
      rejected: [{ sessionId: 'sync-session', reason: 'bad score' }],
    });
  });
  const result = await setupValue.service.syncCompletedSession(record());
  assert.equal(result.state, 'failed');
  assert.equal(setupValue.outbox.get('sync-session').state, 'failed');
  assert.deepEqual(result.rejected, [{ sessionId: 'sync-session', reason: 'bad score' }]);
});

test('manual pending sync retries a previously permanent failure', async () => {
  let attempt = 0;
  const setupValue = setup({}, () => {
    attempt += 1;
    if (attempt === 1) {
      throw new SprintlyApiError('invalid payload', {
        kind: 'validation', retryable: false,
        rejected: [{ sessionId: 'sync-session', reason: 'temporary website rule' }],
      });
    }
    return { acceptedSessionIds: ['sync-session'], duplicateSessionIds: [], rejected: [] };
  });
  await setupValue.service.syncCompletedSession(record());
  assert.equal(setupValue.outbox.get('sync-session').state, 'failed');
  const retry = await setupValue.service.syncPendingSessions(true);
  assert.equal(retry.state, 'synced');
  assert.equal(setupValue.outbox.get('sync-session').state, 'synced');
  assert.equal(setupValue.uploadCalls, 2);
});

test('revoked device clears credentials without deleting the local queue', async () => {
  const setupValue = setup({}, () => {
    throw new SprintlyApiError('device revoked', { kind: 'revoked-device', retryable: false });
  });
  await setupValue.service.syncCompletedSession(record());
  assert.equal(setupValue.stateStore.get().connectionStatus, 'revoked');
  assert.equal(await setupValue.secrets.get('sprintly.extension.developmentToken'), undefined);
  assert.equal(setupValue.outbox.get('sync-session').state, 'failed');
});

test('production pairing stores a device token and uses it for the next upload', async () => {
  const memento = new TestMemento();
  const secrets = {
    values: new Map(),
    get: async (key) => secrets.values.get(key),
    store: async (key, value) => secrets.values.set(key, value),
    delete: async (key) => secrets.values.delete(key),
  };
  const outbox = new SyncOutbox(memento);
  const stateStore = new SyncStateStore(memento);
  const usedTokens = [];
  const service = new SprintlySyncService({
    tokenStore: new SprintlyTokenStore(secrets), outbox, stateStore,
    readSettings: () => ({
      apiUrl: 'https://sprintly.example', environment: 'production', syncPreference: 'completed',
      leaderboardOptIn: false, developmentToken: '', websiteUrl: 'https://sprintly.example/connect',
    }),
    pairingAdapter: new DelegatingPairingAdapter(async ({ code }) => ({ ok: true, deviceToken: `device-${code}` })),
    createClient: (_settings, token) => {
      usedTokens.push(token);
      return {
        async health() { return { ok: true, contract: 'devstrava.session.v1', schemaVersion: 1 }; },
        async uploadSessions(sessions) {
          return { acceptedSessionIds: sessions.map((entry) => entry.sessionId), duplicateSessionIds: [], rejected: [] };
        },
      };
    },
  });
  await service.connectWithPairingCode('pair-code');
  assert.equal(await secrets.get('sprintly.extension.deviceToken'), 'device-pair-code');
  const result = await service.syncCompletedSession(record());
  assert.equal(result.state, 'synced');
  assert.deepEqual(usedTokens, ['device-pair-code', 'device-pair-code']);
});
