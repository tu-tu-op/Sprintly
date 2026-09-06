const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SPRINTLY_DEVELOPMENT_TOKEN_SECRET,
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
  assert.equal(await store.get('development', ''), null);
  assert.equal(await store.get('production'), null);
});

test('development configuration is a read-only fallback and production requires a stored device token', async () => {
  const store = new SprintlyTokenStore(secrets());
  assert.equal(await store.get('development', 'configured-token'), 'configured-token');
  assert.equal(await store.get('production', 'configured-token'), null);
  await assert.rejects(() => store.storeDevelopmentToken('  '), /required/);
});
