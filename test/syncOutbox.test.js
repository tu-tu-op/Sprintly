const assert = require('node:assert/strict');
const test = require('node:test');

const { SyncOutbox } = require('../out/integration/syncOutbox');

function session(id = 'queued-session') {
  return {
    contract: 'devstrava.session.v1', schemaVersion: 1, sessionId: id,
    startedAt: '2026-08-15T11:00:00.000Z', endedAt: '2026-08-15T12:00:00.000Z', activeDurationSeconds: 300,
    coding: { manualPercent: 100, aiAssistedPercent: 0, automationPercent: 0, unknownBulkEditPercent: 0 },
    activity: { edits: 1, saves: 1, filesTouched: 1, linesChangedEstimate: 1 },
    terminal: { totalCommands: 0, build: 0, test: 0, git: 0, packageManager: 0, devServer: 0, lint: 0, other: 0 },
    ai: { claudeCodePrompts: 0, codexPrompts: 0, copilotPrompts: 0, tokenTotals: { claude: 0, codex: 0, copilot: 0 } },
    reliability: { failures: 0, recoveredFailures: 0, recoveryRate: 100 },
    scores: { focus: 1, testingDiscipline: 0, recovery: 100, consistency: 0, aiBalance: 0, devScore: 1 },
    archetype: { primary: 'Steady Builder', traits: [] },
  };
}

class TestMemento {
  constructor(initial) { this.values = new Map(initial ? Object.entries(initial) : []); }
  get(key) { return this.values.get(key); }
  update(key, value) { this.values.set(key, value); return Promise.resolve(); }
}

test('outbox persists queue records and recovers interrupted syncing entries', async () => {
  const memento = new TestMemento();
  const first = new SyncOutbox(memento, { now: () => 1_000 });
  first.enqueue(session());
  first.begin('queued-session', 1_000);
  await first.flush();

  const reopened = new SyncOutbox(memento, { now: () => 2_000 });
  assert.equal(reopened.get('queued-session').state, 'pending');
  assert.equal(reopened.pendingCount(), 1);
  assert.equal(reopened.get('queued-session').payload.sessionId, 'queued-session');
});

test('temporary failures use bounded exponential retry timing', async () => {
  let now = 10_000;
  const outbox = new SyncOutbox(new TestMemento(), {
    now: () => now,
    retryBaseMs: 100,
    retryMaxMs: 500,
  });
  outbox.enqueue(session());
  outbox.begin('queued-session', now);
  outbox.markFailed('queued-session', 'offline', true, now);
  assert.equal(outbox.get('queued-session').state, 'pending');
  assert.equal(outbox.get('queued-session').nextRetryTime, 10_100);
  assert.equal(outbox.due(10_099).length, 0);
  assert.equal(outbox.due(10_100).length, 1);
  outbox.begin('queued-session', 10_100);
  outbox.markFailed('queued-session', 'offline', true, 10_100);
  assert.equal(outbox.get('queued-session').nextRetryTime, 10_300);
  now = 10_300;
  assert.equal(outbox.due().length, 1);
});

test('permanent validation failures remain for manual retry and do not retry forever', async () => {
  const memento = new TestMemento();
  const outbox = new SyncOutbox(memento);
  outbox.enqueue(session());
  outbox.begin('queued-session', 2_000);
  outbox.markFailed('queued-session', 'invalid active duration', false, 2_000);
  assert.equal(outbox.get('queued-session').state, 'failed');
  assert.equal(outbox.get('queued-session').nextRetryTime, null);
  assert.equal(outbox.failedCount(), 1);
  assert.equal(outbox.due(9_999_999).length, 0);
  assert.equal(outbox.retryFailed(), 1);
  assert.equal(outbox.get('queued-session').state, 'pending');
  await outbox.flush();
  const reopened = new SyncOutbox(memento);
  assert.equal(reopened.get('queued-session').state, 'pending');
});

test('only an explicit synced acknowledgement changes a queued record to synced', () => {
  const outbox = new SyncOutbox(new TestMemento());
  outbox.enqueue(session());
  assert.equal(outbox.get('queued-session').state, 'pending');
  outbox.markSynced('queued-session');
  assert.equal(outbox.get('queued-session').state, 'synced');
  assert.equal(outbox.pendingCount(), 0);
  assert.equal(outbox.failedCount(), 0);
});
