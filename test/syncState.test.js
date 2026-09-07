const assert = require('node:assert/strict');
const test = require('node:test');

const { SyncStateStore } = require('../out/integration/syncState');

class TestMemento {
  constructor() { this.values = new Map(); }
  get(key) { return this.values.get(key); }
  update(key, value) { this.values.set(key, value); return Promise.resolve(); }
}

test('sync state persists connection, success, and error status', async () => {
  const memento = new TestMemento();
  const store = new SyncStateStore(memento);
  let changes = 0;
  store.onDidChange(() => { changes += 1; });
  store.markConnected();
  store.markSyncSucceeded(1234);
  await store.flush();
  assert.equal(store.get().connectionStatus, 'connected');
  assert.equal(store.get().lastSuccessfulSync, 1234);
  assert.equal(store.get().lastSyncError, null);
  store.markSyncFailed('Bearer secret-token was rejected');
  assert.equal(store.get().lastSyncError.includes('secret-token'), false);
  assert.equal(changes, 3);
  await store.flush();
  const reopened = new SyncStateStore(memento);
  assert.equal(reopened.get().connectionStatus, 'disconnected');
  assert.match(reopened.get().lastSyncError, /Bearer \[redacted\]/);
});

test('revoked state is explicit and recoverable by reconnecting', () => {
  const store = new SyncStateStore(new TestMemento());
  store.markRevoked();
  assert.equal(store.get().connectionStatus, 'revoked');
  store.markConnected();
  assert.equal(store.get().connectionStatus, 'connected');
  assert.equal(store.get().lastSyncError, null);
});

test('authorization-required state survives restart until an explicit reconnect', async () => {
  const memento = new TestMemento();
  const store = new SyncStateStore(memento);
  store.markAuthorizationRequired('The token was rejected');
  await store.flush();
  const reopened = new SyncStateStore(memento);
  assert.equal(reopened.get().authRequired, true);
  assert.equal(reopened.get().connectionStatus, 'disconnected');
  reopened.markConnected();
  assert.equal(reopened.get().authRequired, false);
});

test('website-disabled state persists until a manual sync clears it', async () => {
  const memento = new TestMemento();
  const store = new SyncStateStore(memento);
  store.markSyncDisabled('Website sync is disabled');
  await store.flush();
  const reopened = new SyncStateStore(memento);
  assert.equal(reopened.get().syncDisabled, true);
  assert.match(reopened.get().syncDisabledReason, /disabled/);
  reopened.clearSyncDisabled();
  assert.equal(reopened.get().syncDisabled, false);
});
