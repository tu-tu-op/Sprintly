const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { LocalSessionStore } = require('../out/tracking/localSessionStore');
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

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function completeRecord(id, timestamp) {
  return {
    schemaVersion: 'devstrava.session.v1',
    version: 1,
    id,
    startedAt: Math.max(0, timestamp - 3_600_000),
    endedAt: timestamp,
    activeDurationMs: 3_000_000,
    pauses: [],
    coding: { manualMs: 1_500_000, aiAssistedMs: 1_000_000, automationMs: 250_000, unknownBulkMs: 250_000 },
    edits: 12,
    linesChanged: 42,
    fileSaves: 5,
    fileSwitches: 3,
    filesTouched: 4,
    terminalOpens: 1,
    terminalCommands: 4,
    terminalCommandsByCategory: {
      build: 1, test: 1, 'package-manager': 1, git: 1,
      'dev-server': 0, lint: 0, formatter: 0, deployment: 0, other: 0,
    },
    agentPrompts: { claudeCode: 2, codex: 1, githubCopilot: 3 },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    buildFailures: {
      total: 1, byCategory: { type_error: 1 }, successfulRuns: 1,
      recoveredFailures: 1, failureStreak: 0, maxFailureStreak: 1,
    },
    archetype: 'Vibe Coder',
    traits: ['Fast exploration'],
    metrics: {
      focusScore: 80, contextSwitches: 3, shippingActivity: 50,
      testingDiscipline: 50, aiBalance: 33, recoveryRate: 100, cleanRun: false,
    },
    scores: {
      devScoreVersion: 1, focus: 80, consistency: 50, recovery: 100,
      testingDiscipline: 50, shippingActivity: 50, aiBalance: 33, devScore: 70,
    },
    completed: true,
  };
}

test('local store creates, updates, completes, reopens, and deduplicates sessions', async () => {
  const memento = new TestMemento();
  const store = new LocalSessionStore(memento, { retention: 5, now: () => 2_000 });
  const id = store.create({ id: 'sess_one', startedAt: 1_000 });
  store.update(id, { edits: 4, coding: { manualMs: 900 } });
  const completed = store.complete(id, { endedAt: 2_000, activeDurationMs: 1_000 });
  assert.equal(completed.id, 'sess_one');
  assert.equal(store.list().length, 1);
  assert.equal(store.complete(id, { endedAt: 3_000 }).endedAt, 2_000);
  await flush();

  const reopened = new LocalSessionStore(memento, { retention: 5 });
  assert.deepEqual(reopened.list().map((record) => record.id), ['sess_one']);
  assert.equal(reopened.get('sess_one').edits, 4);
});

test('export/import is versioned, aggregate-only, and rejects malformed/future data', async () => {
  const source = new LocalSessionStore(new TestMemento(), { now: () => 1_000 });
  source.append(completeRecord('sess_export', 1_000));
  await flush();
  const payload = source.export(1_000);

  assert.equal(payload.schemaVersion, 'devstrava.session.v1');
  assert.equal(payload.exportVersion, 'devstrava.export.v1');
  assert.equal(payload.sessions[0].sessionId, 'sess_export');
  assert.equal('rawCommand' in payload.sessions[0], false);
  assert.equal('promptText' in payload.sessions[0], false);

  const restored = new LocalSessionStore(new TestMemento());
  assert.equal(restored.import(payload), 1);
  assert.equal(restored.list()[0].id, 'sess_export');
  assert.throws(
    () => restored.import({ schemaVersion: 'devstrava.session.v1', sessions: [{}] }),
    /Invalid DevStrava session/,
  );
  assert.throws(
    () => restored.import({ schemaVersion: 'devstrava.session.v2', sessions: [] }),
    /Unsupported future DevStrava schema/,
  );
});

test('history is isolated by the supplied workspace storage', () => {
  const firstWorkspace = new LocalSessionStore(new TestMemento());
  const secondWorkspace = new LocalSessionStore(new TestMemento());
  firstWorkspace.append(completeRecord('workspace-one', 1_000));
  assert.equal(firstWorkspace.list().length, 1);
  assert.equal(secondWorkspace.list().length, 0);
});

test('retention, delete, and clear operate only on local aggregate records', () => {
  const store = new LocalSessionStore(new TestMemento(), 2);
  store.append(completeRecord('one', 1_000));
  store.append(completeRecord('two', 2_000));
  store.append(completeRecord('three', 3_000));
  assert.deepEqual(store.list().map((record) => record.id), ['three', 'two']);
  assert.equal(store.delete('two'), true);
  assert.equal(store.delete('two'), false);
  store.clear();
  assert.equal(store.list().length, 0);
});
