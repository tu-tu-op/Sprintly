const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

class EventEmitter {
  constructor() { this.event = () => ({ dispose() {} }); }
  fire() {}
  dispose() {}
}

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      EventEmitter,
      QuickPickItemKind: { Separator: -1 },
      ThemeIcon: class ThemeIcon { constructor(id) { this.id = id; } },
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { buildPanelItems } = require('../out/panels/sessionQuickPick');
Module._load = originalLoad;

test('Quick Panel includes report redirect and website sync actions', () => {
  const stats = {
    isRecording: false, startedAt: null, durationSeconds: 0, fileEdits: 0,
    fileSaves: 0, fileSwitches: 0, activeFiles: new Set(), linesChanged: 0,
    terminalCommands: 0, terminalOpens: 0,
    terminalCommandsByCategory: { build: 0, test: 0, git: 0, 'package-manager': 0, 'dev-server': 0, lint: 0, formatter: 0, deployment: 0, other: 0 },
    isPaused: false, totalPausedSeconds: 0, pausedAt: null,
  };
  const state = {
    session: { id: null, isActive: false, isPaused: false, startedAt: null, pauses: [] },
    agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 0 },
    tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
    buildFailures: { total: 0, byCategory: {} },
  };
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
