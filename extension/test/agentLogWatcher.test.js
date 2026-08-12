const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
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
const { AgentLogWatcher } = require('../out/tracking/agentLogWatcher');
Module._load = originalLoad;

class TestMemento {
  get() {
    return undefined;
  }

  update() {
    return Promise.resolve();
  }
}

function appendLines(filePath, lines) {
  fs.appendFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

test('agent prompts and tokens are assigned only to their Sprintly session window', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sprintly-agent-'));
  const filePath = path.join(directory, 'rollout-test.jsonl');
  const source = {
    id: 'codex',
    getLogDirs: () => [directory],
    isPromptEntry: (line) => line.kind === 'prompt',
    extractTimestamp: (line) => typeof line.timestamp === 'number' ? line.timestamp : null,
    extractUsage: (line) => typeof line.tokens === 'number'
      ? { kind: 'codex', total: line.tokens }
      : null,
  };

  try {
    appendLines(filePath, [
      JSON.stringify({ kind: 'prompt', timestamp: 900 }),
      '{ malformed json',
    ]);
    const store = new DailyStateStore(new TestMemento(), () => 1_000);
    store.startSession(1_000, 'agent-session');
    const watcher = new AgentLogWatcher(store, [source]);
    await watcher.start();

    appendLines(filePath, [
      JSON.stringify({ kind: 'prompt', timestamp: 1_100 }),
      JSON.stringify({ kind: 'usage', timestamp: 1_101, tokens: 40 }),
    ]);
    await watcher.scanNow();
    assert.equal(store.get().agentPrompts.codex, 1);
    assert.deepEqual(store.get().tokenStats.codex, { total: 40 });

    store.pauseSession(1_200);
    appendLines(filePath, [
      JSON.stringify({ kind: 'prompt', timestamp: 1_300 }),
      JSON.stringify({ kind: 'usage', timestamp: 1_301, tokens: 500 }),
    ]);
    await watcher.scanNow();
    store.resumeSession(1_400);
    appendLines(filePath, [
      JSON.stringify({ kind: 'prompt', timestamp: 1_500 }),
      JSON.stringify({ kind: 'usage', timestamp: 1_501, tokens: 60 }),
    ]);
    await watcher.scanNow();

    store.stopSession(1_600);
    appendLines(filePath, [
      JSON.stringify({ kind: 'prompt', timestamp: 1_700 }),
      JSON.stringify({ kind: 'usage', timestamp: 1_701, tokens: 900 }),
    ]);
    await watcher.scanNow();

    const state = store.get();
    assert.deepEqual(state.detectedAgents, ['codex']);
    assert.equal(state.agentPrompts.codex, 2);
    assert.deepEqual(state.tokenStats.codex, { total: 100 });
    assert.equal(store.getAgentFileOffset(filePath), fs.statSync(filePath).size);
    watcher.dispose();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
