const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SPRINTLY_DEVELOPMENT_TOKEN_SECRET,
  SPRINTLY_DEVICE_ID_SECRET,
  SPRINTLY_DEVICE_TOKEN_SECRET,
  SprintlyTokenStore,
} = require('../out/integration/secureTokenStore');

function secrets() {
  const values = new Map();
  return {
    values,
    get: async (key) => values.get(key),
    store: async (key, value) => values.set(key, value),
    delete: async (key) => values.delete(key),
  };
}

test('secure token storage uses SecretStorage and never serializes token state', async () => {
  const backing = secrets();
  const store = new SprintlyTokenStore(backing);
  await store.storeDevelopmentToken('  dev-secret  ');
  assert.equal(await store.get('development'), 'dev-secret');
  assert.equal(backing.values.get(SPRINTLY_DEVELOPMENT_TOKEN_SECRET), 'dev-secret');
  assert.equal(backing.values.has('token'), false);

  await store.storeDeviceToken('device-secret');
  assert.equal(await store.get('production'), 'device-secret');
  assert.equal(backing.values.get(SPRINTLY_DEVICE_TOKEN_SECRET), 'device-secret');
  await store.clear();
  assert.equal(await store.get('development'), null);
  assert.equal(await store.get('production'), null);
});

test('development credentials require SecretStorage and production requires a stored device token', async () => {
  const store = new SprintlyTokenStore(secrets());
  assert.equal(await store.get('development'), null);
  assert.equal(await store.get('production'), null);
  await assert.rejects(() => store.storeDevelopmentToken('  '), /required/);
});

test('installation device ID is generated once and survives token disconnects', async () => {
  const backing = secrets();
  const store = new SprintlyTokenStore(backing);
  const first = await store.getOrCreateDeviceId(() => 'stable-test-id');
  const second = await store.getOrCreateDeviceId(() => 'different-id');
  assert.equal(first, 'vscode-stable-test-id');
  assert.equal(second, first);
  assert.equal(backing.values.get(SPRINTLY_DEVICE_ID_SECRET), first);
  await store.storeDeviceToken('device-secret');
  await store.clear();
  assert.equal(await store.getOrCreateDeviceId(() => 'new-id'), first);
});
