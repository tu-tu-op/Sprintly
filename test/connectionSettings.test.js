const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

let configuration = {};
const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({ get: (key, fallback) => configuration[key] ?? fallback }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { DEFAULT_SPRINTLY_API_URL, environmentLabel, getSprintlyConnectionSettings } = require('../out/integration/connectionSettings');
Module._load = originalLoad;

test('connection settings default to local API and local-only sync', () => {
  configuration = {};
  const settings = getSprintlyConnectionSettings();
  assert.equal(settings.apiUrl, DEFAULT_SPRINTLY_API_URL);
  assert.equal(settings.environment, 'development');
  assert.equal(settings.syncPreference, 'never');
  assert.equal(settings.syncEnabled, false);
  assert.equal(settings.leaderboardOptIn, false);
});

test('connection settings support remote extension hosts and production selection', () => {
  configuration = {
    apiUrl: 'http://192.168.1.40:3000',
    apiEnvironment: 'production',
    syncEnabled: true,
    syncPreference: 'selected',
    leaderboardOptIn: true,
    developmentToken: 'configured-token',
  };
  const settings = getSprintlyConnectionSettings();
  assert.equal(settings.apiUrl, 'http://192.168.1.40:3000');
  assert.equal(settings.environment, 'production');
  assert.equal(settings.syncPreference, 'selected');
  assert.equal(settings.syncEnabled, true);
  assert.equal(settings.leaderboardOptIn, true);
  assert.equal(environmentLabel(settings.environment), 'Production');
});
