const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

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
const { AgentLogWatcher, isPathInWorkspace } = require('../out/tracking/agentLogWatcher');
const { GITHUB_COPILOT_SOURCE } = require('../out/tracking/agentLogSources');
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

test('workspace path matching accepts only the root and its descendants', () => {
  const root = path.resolve('C:/projects/sprintly');
  assert.equal(isPathInWorkspace(root, root), true);
  assert.equal(isPathInWorkspace(root, path.join(root, 'extension')), true);
  assert.equal(isPathInWorkspace(path.join(root, 'extension'), root), false);
  assert.equal(isPathInWorkspace(root, path.resolve('C:/projects/sprintly-other')), false);
});

test('agent prompts and tokens are assigned only to their Sprintly session window', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sprintly-agent-'));
  const workspacePath = path.join(directory, 'workspace');
  fs.mkdirSync(workspacePath);
  const filePath = path.join(directory, 'rollout-test.jsonl');
  const source = {
    id: 'codex',
    getLogDirs: () => [directory],
    extractWorkspacePath: (line) => typeof line.workspace === 'string' ? line.workspace : null,
    isPromptEntry: (line) => line.kind === 'prompt',
    extractTimestamp: (line) => typeof line.timestamp === 'number' ? line.timestamp : null,
    extractUsage: (line) => typeof line.tokens === 'number'
      ? { kind: 'codex', total: line.tokens }
      : null,
  };

  try {
    appendLines(filePath, [
      JSON.stringify({ kind: 'prompt', timestamp: 900, workspace: workspacePath }),
      '{ malformed json',
    ]);
    const store = new DailyStateStore(new TestMemento(), () => 1_000);
    store.startSession(1_000, 'agent-session');
    const watcher = new AgentLogWatcher(store, [source], [workspacePath]);
    await watcher.start();

    appendLines(filePath, [
      JSON.stringify({ kind: 'prompt', timestamp: 1_100, workspace: workspacePath }),
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

test('agent usage from another workspace is ignored while its cursor still advances', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sprintly-workspaces-'));
  const targetWorkspace = path.join(directory, 'target-project');
  const otherWorkspace = path.join(directory, 'other-project');
  const targetLog = path.join(directory, 'rollout-target.jsonl');
  const otherLog = path.join(directory, 'rollout-other.jsonl');
  fs.mkdirSync(targetWorkspace);
  fs.mkdirSync(otherWorkspace);
  const source = {
    id: 'codex',
    getLogDirs: () => [directory],
    extractWorkspacePath: (line) => typeof line.cwd === 'string' ? line.cwd : null,
    isPromptEntry: (line) => line.kind === 'prompt',
    extractTimestamp: (line) => typeof line.timestamp === 'number' ? line.timestamp : null,
    extractUsage: (line) => typeof line.tokens === 'number'
      ? { kind: 'codex', total: line.tokens }
      : null,
  };

  try {
    const store = new DailyStateStore(new TestMemento(), () => 2_000);
    store.startSession(2_000, 'workspace-session');
    appendLines(targetLog, [
      JSON.stringify({ kind: 'context', timestamp: 2_010, cwd: targetWorkspace }),
      JSON.stringify({ kind: 'prompt', timestamp: 2_020 }),
      JSON.stringify({ kind: 'usage', timestamp: 2_021, tokens: 25 }),
    ]);
    appendLines(otherLog, [
      JSON.stringify({ kind: 'context', timestamp: 2_010, cwd: otherWorkspace }),
      JSON.stringify({ kind: 'prompt', timestamp: 2_020 }),
      JSON.stringify({ kind: 'usage', timestamp: 2_021, tokens: 900 }),
    ]);

    const watcher = new AgentLogWatcher(store, [source], [targetWorkspace]);
    await watcher.start();

    assert.equal(store.get().agentPrompts.codex, 1);
    assert.deepEqual(store.get().tokenStats.codex, { total: 25 });
    assert.equal(store.getAgentFileOffset(targetLog), fs.statSync(targetLog).size);
    assert.equal(store.getAgentFileOffset(otherLog), fs.statSync(otherLog).size);
    watcher.dispose();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('persisted cursors recover workspace identity from the log header', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sprintly-header-'));
  const workspacePath = path.join(directory, 'workspace');
  const filePath = path.join(directory, 'rollout-header.jsonl');
  fs.mkdirSync(workspacePath);
  const source = {
    id: 'codex',
    getLogDirs: () => [directory],
    extractWorkspacePath: (line) => typeof line.cwd === 'string' ? line.cwd : null,
    isPromptEntry: (line) => line.kind === 'prompt',
    extractTimestamp: (line) => typeof line.timestamp === 'number' ? line.timestamp : null,
    extractUsage: () => null,
  };

  try {
    appendLines(filePath, [JSON.stringify({ kind: 'context', timestamp: 2_900, cwd: workspacePath })]);
    const store = new DailyStateStore(new TestMemento(), () => 3_000);
    const firstWatcher = new AgentLogWatcher(store, [source], [workspacePath]);
    await firstWatcher.start();
    firstWatcher.dispose();

    store.startSession(3_000, 'reopened-session');
    appendLines(filePath, [JSON.stringify({ kind: 'prompt', timestamp: 3_100 })]);
    const reopenedWatcher = new AgentLogWatcher(store, [source], [workspacePath]);
    await reopenedWatcher.start();

    assert.equal(store.get().agentPrompts.codex, 1);
    reopenedWatcher.dispose();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('workspace-scoped GitHub Copilot Chat requests and token patches are captured', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sprintly-copilot-'));
  const workspacePath = path.join(directory, 'workspace');
  const appData = path.join(directory, 'appdata');
  const storage = path.join(appData, 'Code', 'User', 'workspaceStorage', 'workspace-id');
  const chatSessions = path.join(storage, 'chatSessions');
  const filePath = path.join(chatSessions, 'copilot-session.jsonl');
  const broadStorage = path.join(appData, 'Code', 'User', 'workspaceStorage', 'parent-workspace-id');
  const broadChatSessions = path.join(broadStorage, 'chatSessions');
  const previousAppData = process.env.APPDATA;

  try {
    fs.mkdirSync(workspacePath);
    fs.mkdirSync(chatSessions, { recursive: true });
    fs.mkdirSync(broadChatSessions, { recursive: true });
    fs.writeFileSync(path.join(storage, 'workspace.json'), JSON.stringify({
      folder: pathToFileURL(workspacePath).href,
    }));
    fs.writeFileSync(path.join(broadStorage, 'workspace.json'), JSON.stringify({
      folder: pathToFileURL(directory).href,
    }));
    appendLines(filePath, [JSON.stringify({ kind: 0, v: { requests: [] } })]);
    appendLines(path.join(broadChatSessions, 'other-project.jsonl'), [JSON.stringify({
      kind: 0,
      v: {
        requests: [{
          timestamp: 1_050,
          agent: { extensionId: { value: 'GitHub.copilot-chat' } },
          modelId: 'copilot/gpt-5',
          message: { text: 'This belongs to a broader workspace' },
        }],
      },
    })]);
    process.env.APPDATA = appData;

    const store = new DailyStateStore(new TestMemento(), () => 1_000);
    store.startSession(1_000, 'copilot-session');
    const watcher = new AgentLogWatcher(store, [GITHUB_COPILOT_SOURCE], [workspacePath]);
    await watcher.start();

    appendLines(filePath, [
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [{
          requestId: 'first',
          timestamp: 1_100,
          agent: { extensionId: { value: 'GitHub.copilot-chat' } },
          modelId: 'copilot/gpt-5',
          message: { text: 'Update the component' },
        }],
      }),
      JSON.stringify({ kind: 1, k: ['requests', 0, 'promptTokens'], v: 10 }),
      JSON.stringify({ kind: 1, k: ['requests', 0, 'completionTokens'], v: 20 }),
      JSON.stringify({ kind: 1, k: ['requests', 0, 'copilotCredits'], v: 1 }),
    ]);
    await watcher.scanNow();
    watcher.dispose();

    const reopened = new AgentLogWatcher(store, [GITHUB_COPILOT_SOURCE], [workspacePath]);
    await reopened.start();
    appendLines(filePath, [
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [{
          requestId: 'second',
          timestamp: 1_200,
          agent: { extensionId: { value: 'github.copilot-chat' } },
          modelId: 'copilot/claude-sonnet',
          message: { text: 'Fix the tests' },
        }],
      }),
      JSON.stringify({ kind: 1, k: ['requests', 1, 'promptTokens'], v: 20 }),
      JSON.stringify({ kind: 1, k: ['requests', 1, 'completionTokens'], v: 40 }),
      JSON.stringify({ kind: 1, k: ['requests', 1, 'copilotCredits'], v: 1 }),
    ]);
    await reopened.scanNow();

    const state = store.get();
    assert.deepEqual(state.detectedAgents, ['github-copilot']);
    assert.equal(state.agentPrompts.githubCopilot, 2);
    assert.deepEqual(state.tokenStats.githubCopilot, { input: 30, output: 60, credits: 2 });
    reopened.dispose();
  } finally {
    if (previousAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = previousAppData;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Copilot chat storage created after Sprintly starts is discovered', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sprintly-copilot-lazy-'));
  const workspacePath = path.join(directory, 'workspace');
  const appData = path.join(directory, 'appdata');
  const storage = path.join(appData, 'Code', 'User', 'workspaceStorage', 'workspace-id');
  const chatSessions = path.join(storage, 'chatSessions');
  const previousAppData = process.env.APPDATA;

  try {
    fs.mkdirSync(workspacePath);
    fs.mkdirSync(storage, { recursive: true });
    fs.writeFileSync(path.join(storage, 'workspace.json'), JSON.stringify({
      folder: pathToFileURL(workspacePath).href,
    }));
    process.env.APPDATA = appData;

    const store = new DailyStateStore(new TestMemento(), () => 2_000);
    store.startSession(2_000, 'lazy-copilot-session');
    const watcher = new AgentLogWatcher(store, [GITHUB_COPILOT_SOURCE], [workspacePath]);
    await watcher.start();

    fs.mkdirSync(chatSessions);
    appendLines(path.join(chatSessions, 'new-session.jsonl'), [JSON.stringify({
      kind: 0,
      v: {
        requests: [{
          timestamp: 2_100,
          agent: { extensionId: { value: 'GitHub.copilot-chat' } },
          modelId: 'copilot/gpt-5',
          message: { text: 'First chat in this workspace' },
        }],
      },
    })]);
    await watcher.scanNow();

    assert.equal(store.get().agentPrompts.githubCopilot, 1);
    watcher.dispose();
  } finally {
    if (previousAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = previousAppData;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
