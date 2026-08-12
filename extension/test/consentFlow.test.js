const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

let selectedAction;
let capturedItems;
let capturedOptions;
const configuration = { enabled: true, autoPromptOnStartup: true };

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      QuickPickItemKind: { Separator: -1 },
      workspace: {
        workspaceFolders: [],
        workspaceFile: undefined,
        getConfiguration: () => ({
          get: (key, fallback) => configuration[key] ?? fallback,
        }),
      },
      window: {
        showQuickPick: async (items, options) => {
          capturedItems = items;
          capturedOptions = options;
          return items.find((item) => item.action === selectedAction);
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  requestSessionStart,
  runConsentFlow,
  shouldPromptOnStartup,
  START_SPRINT_LABEL,
} = require('../out/consentFlow');
Module._load = originalLoad;

test('startup prompt uses clear, emoji-free session language', async () => {
  selectedAction = 'dismiss';
  await requestSessionStart();

  assert.equal(START_SPRINT_LABEL, '$(play) Start Sprint');
  assert.equal(capturedOptions.title, 'Sprintly');
  assert.equal(capturedOptions.placeHolder, 'Choose how to begin');
  assert.match(capturedItems.find((item) => item.action === 'start').detail, /Source code/);
  assert.doesNotMatch(JSON.stringify(capturedItems), /[\u{1F300}-\u{1FAFF}]/u);
});

test('startup callback runs only when Start Sprint is selected', async () => {
  let starts = 0;
  selectedAction = 'dismiss';
  await runConsentFlow(() => { starts += 1; });
  selectedAction = 'start';
  await runConsentFlow(() => { starts += 1; });
  assert.equal(starts, 1);
});

test('startup prompt is marked once per extension-host process and workspace', async () => {
  const values = new Map();
  const context = {
    workspaceState: {
      get: (key) => values.get(key),
      update: (key, value) => {
        values.set(key, value);
        return Promise.resolve();
      },
    },
  };

  assert.equal(await shouldPromptOnStartup(context), true);
  assert.equal(await shouldPromptOnStartup(context), false);
});

test('startup settings gate automatic prompting', async () => {
  const values = new Map();
  const context = {
    workspaceState: {
      get: (key) => values.get(key),
      update: (key, value) => {
        values.set(key, value);
        return Promise.resolve();
      },
    },
  };

  configuration.enabled = false;
  assert.equal(await shouldPromptOnStartup(context), false);
  configuration.enabled = true;
  configuration.autoPromptOnStartup = false;
  assert.equal(await shouldPromptOnStartup(context), false);
  configuration.autoPromptOnStartup = true;
});
