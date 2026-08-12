const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

class TestEventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
  }

  fire(value) {
    for (const listener of this.listeners) {
      listener(value);
    }
  }

  dispose() {
    this.listeners.clear();
  }
}

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return { EventEmitter: TestEventEmitter };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { DailyStateStore } = require('../out/tracking/dailyStateStore');
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

test('a new Sprintly session resets metrics but retains log cursors', () => {
  let now = 1_000;
  const store = new DailyStateStore(new TestMemento(), () => now);

  store.applyAgentLogBatch({
    sourceId: 'codex',
    detected: true,
    filePath: 'codex.jsonl',
    nextOffset: 42,
    promptCount: 99,
  });
  store.startSession(now, 'session-one');
  store.addBuildFailure('type_error', now + 10);
  store.applyAgentLogBatch({
    sourceId: 'codex',
    detected: true,
    filePath: 'codex.jsonl',
    nextOffset: 84,
    promptCount: 2,
    codexTokens: 120,
    codexUsageAvailable: true,
    sessionId: 'session-one',
  });

  now = 2_000;
  store.startSession(now, 'session-two');
  const state = store.get();
  assert.equal(state.session.id, 'session-two');
  assert.equal(state.buildFailures.total, 0);
  assert.deepEqual(state.agentPrompts, { claudeCode: 0, codex: 0 });
  assert.equal(state.tokenStats.codex, 'unavailable');
  assert.equal(store.getAgentFileOffset('codex.jsonl'), 84);
});

test('pause and stop boundaries exclude out-of-session activity', () => {
  let now = 10_000;
  const store = new DailyStateStore(new TestMemento(), () => now);
  store.startSession(now, 'bounded-session');

  assert.equal(store.isCapturing(10_001), true);
  store.pauseSession(11_000);
  assert.equal(store.isCapturing(11_500), false);
  store.addBuildFailure('syntax_error', 11_500);

  store.resumeSession(12_000);
  assert.equal(store.isCapturing(12_000), true);
  store.addBuildFailure('syntax_error', 12_500);
  store.stopSession(13_000);

  assert.equal(store.isCapturing(12_999), true);
  assert.equal(store.isCapturing(13_001), false);
  store.addBuildFailure('syntax_error', 13_001);
  assert.equal(store.get().buildFailures.total, 1);
});

test('inactive scans advance cursors without adding usage', () => {
  const store = new DailyStateStore(new TestMemento(), () => 5_000);
  store.applyAgentLogBatch({
    sourceId: 'claude-code',
    detected: true,
    filePath: 'claude.jsonl',
    nextOffset: 50,
    promptCount: 3,
    claudeUsage: { input: 10, output: 20, cacheRead: 0, cacheCreate: 0 },
  });

  const state = store.get();
  assert.equal(store.getAgentFileOffset('claude.jsonl'), 50);
  assert.deepEqual(state.agentPrompts, { claudeCode: 0, codex: 0 });
  assert.equal(state.tokenStats.claudeCode, null);
  assert.deepEqual(state.detectedAgents, []);
});

test('a persisted active session is closed when Sprintly reopens', () => {
  const memento = new TestMemento();
  const first = new DailyStateStore(memento, () => 100);
  first.startSession(100, 'interrupted-session');

  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    const reopened = new DailyStateStore(memento, () => 250);
    const state = reopened.get();
    assert.equal(state.session.id, 'interrupted-session');
    assert.equal(state.session.isActive, false);
    assert.equal(state.session.endedAt, 250);
  });
});
