const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

let createdItem;
let tooltipAssignments;

class TestMarkdownString {
  constructor(value = '') {
    this.value = value;
  }

  appendMarkdown(value) {
    this.value += value;
    return this;
  }
}

const vscodeStub = {
  MarkdownString: TestMarkdownString,
  StatusBarAlignment: { Left: 1 },
  window: {
    createStatusBarItem: () => {
      tooltipAssignments = 0;
      let tooltip;
      createdItem = {
        show() {},
        dispose() {},
        get tooltip() { return tooltip; },
        set tooltip(value) {
          tooltipAssignments += 1;
          tooltip = value;
        },
      };
      return createdItem;
    },
  },
};

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, parent, isMain);
};

const { initStatusBar, buildStatusBarPresentation } = require('../out/panels/statusBar');
const { SESSION_PANEL_COMMAND } = require('../out/panels/sessionQuickPick');
Module._load = originalLoad;

function stats() {
  return {
    isRecording: true,
    startedAt: new Date(1_000),
    durationSeconds: 75,
    fileEdits: 4,
    fileSaves: 1,
    fileSwitches: 0,
    activeFiles: new Set(['example.ts']),
    linesChanged: 3,
    terminalCommands: 0,
    isPaused: false,
    totalPausedSeconds: 0,
    pausedAt: null,
  };
}

function state() {
  return {
    version: 3,
    detectedAgents: ['codex'],
    session: {
      id: 'active-session',
      startedAt: 1_000,
      endedAt: null,
      isActive: true,
      isPaused: false,
      pausedAt: null,
      pauses: [],
      hardcodeMs: 60_000,
      vibecodeMs: 0,
    },
    agentPrompts: { claudeCode: 0, codex: 2, githubCopilot: 0 },
    buildFailures: { total: 0, byCategory: {} },
    tokenStats: { claudeCode: null, codex: { total: 300 }, githubCopilot: null },
    agentFileCursors: {},
  };
}

test('status bar and quick panel share the same session presentation', () => {
  const presentation = buildStatusBarPresentation(stats(), state());
  assert.equal(presentation.text, '$(debug-start) Sprintly · 01:15');
  assert.equal(presentation.summary.scope, 'Current session');
  assert.equal(presentation.summary.promptUsage, '2 total · Claude 0 · Codex 2');
  assert.equal(presentation.summary.tokenUsage, 'Codex ~300');
});

test('click and hover link target the canonical Quick Panel command', () => {
  const tracker = {
    get: stats,
    onDidUpdate: { event: () => ({ dispose() {} }) },
  };
  const sessionStore = {
    get: state,
    onDidUpdate: () => ({ dispose() {} }),
  };
  const context = { subscriptions: [] };

  initStatusBar(context, tracker, sessionStore);

  assert.equal(SESSION_PANEL_COMMAND, 'sprintly.showStatusPanel');
  assert.equal(createdItem.command, SESSION_PANEL_COMMAND);
  assert.match(createdItem.tooltip.value, /command:sprintly\.showStatusPanel/);
  assert.match(createdItem.tooltip.value, /Agent prompts: \*\*2 total · Claude 0 · Codex 2\*\*/);
});

test('one-second timer ticks do not recreate the open hover tooltip', () => {
  let currentStats = stats();
  let trackerUpdate;
  const tracker = {
    get: () => currentStats,
    onDidUpdate: {
      event: (listener) => {
        trackerUpdate = listener;
        return { dispose() {} };
      },
    },
  };
  const sessionStore = {
    get: state,
    onDidUpdate: () => ({ dispose() {} }),
  };

  initStatusBar({ subscriptions: [] }, tracker, sessionStore);
  assert.equal(tooltipAssignments, 1);

  currentStats = { ...currentStats, durationSeconds: 76 };
  trackerUpdate(currentStats);

  assert.equal(createdItem.text, '$(debug-start) Sprintly · 01:16');
  assert.equal(tooltipAssignments, 1);
  assert.match(createdItem.tooltip.value, /Live timer shown in the status bar/);
});
