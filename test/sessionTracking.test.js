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
const { estimateChangedLines } = require('../out/sessionTracker');
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
    // After the lifecycle boundary there is no classified edit evidence, so
    // these saves are neutral anchors and attribute no duration.
    now = 2_100;
    saveDocument.fire(activeDocument);
    now = 2_300;
    saveDocument.fire(activeDocument);
    assert.equal(store.get().session.hardcodeMs, 200);
    assert.equal(store.get().session.unknownBulkMs, 0);

    store.stopSession(2_400);
    now = 2_600;
    saveDocument.fire(activeDocument);
    assert.equal(store.get().session.hardcodeMs, 200);
    tracker.dispose();
  } finally {
    Date.now = originalNow;
  }
});

test('document changes distinguish manual typing from unattributed bulk edits', () => {
  assert.equal(classifyChange('a', 0), 'manual');
  assert.equal(classifyChange('\n', 0), 'manual');
  assert.equal(classifyChange('value', 0), 'unknown-bulk');
  assert.equal(classifyChange('x', 4), 'unknown-bulk');
  assert.equal(classifyChange('generated', 0, 'ai-assisted'), 'ai-assisted');
  assert.equal(classifyChange('formatted', 0, 'automation'), 'automation');
});

test('lines changed counts inserted and deleted lines, not just newline characters', () => {
  // Same-line single-character edit: no line count change.
  assert.equal(estimateChangedLines('a', 3, 3), 0);
  // Multi-line paste: inserted breaks counted.
  assert.equal(estimateChangedLines('a\nb\nc', 0, 0), 2);
  // Deletion collapsing five lines: now visible.
  assert.equal(estimateChangedLines('', 10, 15), 5);
  // Replacement of two lines with three: two inserted breaks plus two
  // removed structural lines (git-style insertion+deletion estimate).
  assert.equal(estimateChangedLines('x\ny\nz', 1, 3), 4);
});

test('bulk multi-character edits stay unattributed (no live AI producer)', () => {
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

    // No provider-attribution integration exists, so this time must land in
    // unknown-bulk - never in an AI/vibe bucket that was not observed.
    assert.equal(store.get().session.unknownBulkMs, 250);
    assert.equal(store.get().session.hardcodeMs, 0);
    assert.equal(store.get().session.aiAssistedMs, 0);
    assert.equal(store.get().session.vibecodeMs, 0);
    tracker.dispose();
  } finally {
    Date.now = originalNow;
  }
});

test('engaged-time credit stops at the active gap boundary and never bridges idle time', () => {
  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  try {
    const store = new DailyStateStore(new TestMemento(), () => now);
    store.startSession(now, 'idle-session');
    const tracker = new SessionActivityTracker(store);
    const activeDocument = document('file:///workspace/idle.ts');

    // First keystroke establishes the manual category.
    now = 10_100;
    changeDocument.fire({
      document: activeDocument,
      contentChanges: [{ text: 'a', rangeLength: 0 }],
    });

    // Continuous typing resumes exactly at the credit boundary (4 minutes).
    now = 10_100 + 240_000;
    changeDocument.fire({
      document: activeDocument,
      contentChanges: [{ text: 'b', rangeLength: 0 }],
    });
    assert.equal(store.get().session.hardcodeMs, 240_000);

    // A long idle period (15 more minutes) is followed by one keystroke.
    now += 900_000;
    changeDocument.fire({
      document: activeDocument,
      contentChanges: [{ text: 'c', rangeLength: 0 }],
    });
    // Idle time contributes nothing beyond the already-credited window.
    assert.equal(store.get().session.hardcodeMs, 240_000);

    tracker.dispose();
  } finally {
    Date.now = originalNow;
  }
});

test('a save without classified edits is not claimed as manual work', () => {
  const originalNow = Date.now;
  let now = 40_000;
  Date.now = () => now;
  try {
    const store = new DailyStateStore(new TestMemento(), () => now);
    store.startSession(now, 'save-only-session');
    const tracker = new SessionActivityTracker(store);
    const untouchedDocument = document('file:///workspace/untouched.ts');

    now = 41_000;
    saveDocument.fire(untouchedDocument);
    now = 42_000;
    changeEditor.fire({ document: untouchedDocument });

    // No duration may be invented for a document with no observed edits.
    assert.equal(store.get().session.hardcodeMs, 0);
    assert.equal(store.get().session.unknownBulkMs, 0);
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

test('recovery requires a same-family successful execution, not any success', async () => {
  const originalNow = Date.now;
  let now = 6_000;
  Date.now = () => now;
  try {
    const store = new DailyStateStore(new TestMemento(), () => now);
    store.startSession(now, 'recovery-session');
    const tracker = new BuildFailureTracker(store);
    const failureEvent = {
      terminal,
      shellIntegration: terminal.shellIntegration,
      exitCode: 1,
      execution: {
        commandLine: { value: 'npm test' },
        async *read() {
          yield 'tests failed';
        },
      },
    };

    endShellExecution.fire(failureEvent);
    await new Promise((resolve) => setImmediate(resolve));
    now = 6_100;
    // An unrelated successful command breaks the streak but recovers nothing.
    endShellExecution.fire({
      ...failureEvent,
      exitCode: 0,
      execution: { commandLine: { value: 'ls -la' }, async *read() {} },
    });
    await new Promise((resolve) => setImmediate(resolve));

    let failures = store.get().buildFailures;
    assert.equal(failures.total, 1);
    assert.equal(failures.recoveredFailures, 0);
    assert.equal(failures.failureStreak, 0);
    assert.equal(failures.successfulRuns, 1);

    // A retry in the same tool family is legitimate recovery evidence.
    endShellExecution.fire(failureEvent);
    await new Promise((resolve) => setImmediate(resolve));
    now = 6_200;
    endShellExecution.fire({
      ...failureEvent,
      exitCode: 0,
      execution: { commandLine: { value: 'npm test' }, async *read() {} },
    });
    await new Promise((resolve) => setImmediate(resolve));

    failures = store.get().buildFailures;
    assert.equal(failures.total, 2);
    assert.equal(failures.recoveredFailures, 1);
    assert.equal(failures.maxFailureStreak, 1);
    tracker.dispose();
  } finally {
    Date.now = originalNow;
  }
});
