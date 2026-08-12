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
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  dispose() {
    this.listeners.clear();
  }
}

const changeDocument = new TestEventEmitter();
const saveDocument = new TestEventEmitter();
const changeEditor = new TestEventEmitter();
const changeShellIntegration = new TestEventEmitter();
const closeTerminal = new TestEventEmitter();
const endShellExecution = new TestEventEmitter();
const terminal = { shellIntegration: {} };

const vscodeStub = {
  EventEmitter: TestEventEmitter,
  workspace: {
    onDidChangeTextDocument: changeDocument.event,
    onDidSaveTextDocument: saveDocument.event,
  },
  window: {
    terminals: [terminal],
    onDidChangeActiveTextEditor: changeEditor.event,
    onDidChangeTerminalShellIntegration: changeShellIntegration.event,
    onDidCloseTerminal: closeTerminal.event,
    onDidEndTerminalShellExecution: endShellExecution.event,
  },
};

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { DailyStateStore } = require('../out/tracking/dailyStateStore');
const { SessionActivityTracker, classifyChange } = require('../out/tracking/sessionActivityTracker');
const { BuildFailureTracker } = require('../out/tracking/buildFailureTracker');
Module._load = originalLoad;

class TestMemento {
  get() {
    return undefined;
  }

  update() {
    return Promise.resolve();
  }
}

function document(uri = 'file:///workspace/example.ts') {
  return { uri: { toString: () => uri } };
}

test('activity duration does not bridge pause or stopped periods', () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const store = new DailyStateStore(new TestMemento(), () => now);
    store.startSession(now, 'activity-session');
    const tracker = new SessionActivityTracker(store);
    const activeDocument = document();

    now = 1_100;
    changeDocument.fire({
      document: activeDocument,
      contentChanges: [{ text: 'a', rangeLength: 0 }],
    });
    now = 1_300;
    saveDocument.fire(activeDocument);
    assert.equal(store.get().session.hardcodeMs, 200);

    store.pauseSession(1_400);
    now = 1_800;
    saveDocument.fire(activeDocument);
    store.resumeSession(2_000);
    now = 2_100;
    saveDocument.fire(activeDocument);
    now = 2_300;
    saveDocument.fire(activeDocument);
    assert.equal(store.get().session.hardcodeMs, 400);

    store.stopSession(2_400);
    now = 2_600;
    saveDocument.fire(activeDocument);
    assert.equal(store.get().session.hardcodeMs, 400);
    tracker.dispose();
  } finally {
    Date.now = originalNow;
  }
});

test('short Copilot-style inline edits count as vibecode', () => {
  assert.equal(classifyChange('a', 0), 'hardcode');
  assert.equal(classifyChange('\n', 0), 'hardcode');
  assert.equal(classifyChange('value', 0), 'vibecode');
  assert.equal(classifyChange('x', 4), 'vibecode');
});

test('accepted inline completion increments the session vibe duration', () => {
  const originalNow = Date.now;
  let now = 3_000;
  Date.now = () => now;
  try {
    const store = new DailyStateStore(new TestMemento(), () => now);
    store.startSession(now, 'copilot-session');
    const tracker = new SessionActivityTracker(store);
    const activeDocument = document('file:///workspace/copilot.ts');

    now = 3_100;
    changeDocument.fire({
      document: activeDocument,
      contentChanges: [{ text: 'fixedValue', rangeLength: 3 }],
    });
    now = 3_350;
    saveDocument.fire(activeDocument);

    assert.equal(store.get().session.vibecodeMs, 250);
    assert.equal(store.get().session.hardcodeMs, 0);
    tracker.dispose();
  } finally {
    Date.now = originalNow;
  }
});

test('terminal failures count only when their execution ends inside a session', async () => {
  const originalNow = Date.now;
  let now = 5_000;
  Date.now = () => now;
  try {
    const store = new DailyStateStore(new TestMemento(), () => now);
    store.startSession(now, 'failure-session');
    const tracker = new BuildFailureTracker(store);
    const event = {
      terminal,
      shellIntegration: terminal.shellIntegration,
      exitCode: 1,
      execution: {
        async *read() {
          yield 'src/index.ts(1,1): error TS2322: Type mismatch';
        },
      },
    };

    endShellExecution.fire(event);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.get().buildFailures.total, 1);
    assert.equal(store.get().buildFailures.byCategory.type_error, 1);

    store.stopSession(5_100);
    now = 5_200;
    endShellExecution.fire(event);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.get().buildFailures.total, 1);
    tracker.dispose();
  } finally {
    Date.now = originalNow;
  }
});
