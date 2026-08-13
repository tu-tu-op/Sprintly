const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

let configuration = {};
const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({
          get: (key, fallback) => configuration[key] ?? fallback,
        }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { getPrivacySettings, isTelemetryCategoryEnabled } = require('../out/tracking/privacySettings');
Module._load = originalLoad;

test('privacy settings default to local aggregate collection', () => {
  configuration = {};
  const settings = getPrivacySettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.trackCodingActivity, true);
  assert.equal(settings.trackAgentUsage, true);
  assert.equal(settings.trackBuildFailures, true);
  assert.equal(settings.cloudSyncEnabled, false);
  assert.equal(isTelemetryCategoryEnabled('codingActivity'), true);
});

test('privacy controls disable only the selected collection boundaries', () => {
  configuration = {
    'telemetry.trackCodingActivity': false,
    'telemetry.trackAgentUsage': false,
    cloudSyncEnabled: true,
  };
  const settings = getPrivacySettings();
  assert.equal(settings.trackCodingActivity, false);
  assert.equal(settings.trackAgentUsage, false);
  assert.equal(settings.trackBuildFailures, true);
  assert.equal(settings.cloudSyncEnabled, true);
  assert.equal(isTelemetryCategoryEnabled('codingActivity'), false);
  assert.equal(isTelemetryCategoryEnabled('agentUsage'), false);
  assert.equal(isTelemetryCategoryEnabled('buildFailures'), true);
});

test('the master setting disables every telemetry category', () => {
  configuration = { enabled: false };
  assert.equal(isTelemetryCategoryEnabled('codingActivity'), false);
  assert.equal(isTelemetryCategoryEnabled('agentUsage'), false);
  assert.equal(isTelemetryCategoryEnabled('buildFailures'), false);
});
