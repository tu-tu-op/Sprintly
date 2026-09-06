const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SprintlyApiClient,
  SprintlyApiError,
} = require('../out/integration/sprintlyApi');

function session(id = 'api-session') {
  return {
    contract: 'devstrava.session.v1',
    schemaVersion: 1,
    sessionId: id,
    startedAt: '2026-08-15T11:00:00.000Z',
    endedAt: '2026-08-15T12:00:00.000Z',
    activeDurationSeconds: 300,
    coding: { manualPercent: 100, aiAssistedPercent: 0, automationPercent: 0, unknownBulkEditPercent: 0 },
    activity: { edits: 1, saves: 1, filesTouched: 1, linesChangedEstimate: 1 },
    terminal: { totalCommands: 0, build: 0, test: 0, git: 0, packageManager: 0, devServer: 0, lint: 0, other: 0 },
    ai: { claudeCodePrompts: 0, codexPrompts: 0, copilotPrompts: 0, tokenTotals: { claude: 0, codex: 0, copilot: 0 } },
    reliability: { failures: 0, recoveredFailures: 0, recoveryRate: 100 },
    scores: { focus: 1, testingDiscipline: 0, recovery: 100, consistency: 0, aiBalance: 0, devScore: 1 },
    archetype: { primary: 'Steady Builder', traits: [] },
  };
}

function fakeTransport(responses, calls) {
  return async (request) => {
    calls.push(request);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  };
}

test('health endpoint accepts the exact contract response', async () => {
  const calls = [];
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    request: fakeTransport([{ status: 200, headers: {}, body: JSON.stringify({ ok: true, contract: 'devstrava.session.v1', schemaVersion: 1 }) }], calls),
  });
  assert.deepEqual(await client.health(), { ok: true, contract: 'devstrava.session.v1', schemaVersion: 1 });
  assert.equal(calls[0].url, 'http://localhost:3000/api/extension/health');
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('valid session upload sends the required JSON body and bearer token', async () => {
  const calls = [];
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000/',
    token: 'development-token',
    request: fakeTransport([{ status: 202, headers: {}, body: JSON.stringify({ accepted: [{ sessionId: 'api-session' }] }) }], calls),
  });
  const result = await client.uploadSessions([session()]);
  assert.deepEqual(result.acceptedSessionIds, ['api-session']);
  assert.equal(calls[0].url, 'http://localhost:3000/api/extension/sessions');
  assert.equal(calls[0].headers.Authorization, 'Bearer development-token');
  assert.deepEqual(JSON.parse(calls[0].body), {
    contract: 'devstrava.session.v1',
    schemaVersion: 1,
    sessions: [session()],
  });
});

test('duplicate responses are treated as idempotent success', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 409, headers: {}, body: JSON.stringify({ duplicates: ['api-session'] }) }], []),
  });
  const result = await client.uploadSessions([session()]);
  assert.deepEqual(result.duplicateSessionIds, ['api-session']);
  assert.deepEqual(result.rejected, []);
});

test('unauthorized and revoked-device responses are distinct safe errors', async () => {
  const unauthorized = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 401, headers: {}, body: JSON.stringify({ error: 'UNAUTHORIZED' }) }], []),
  });
  await assert.rejects(() => unauthorized.uploadSessions([session()]), (error) => {
    assert.ok(error instanceof SprintlyApiError);
    assert.equal(error.kind, 'unauthorized');
    assert.equal(error.retryable, false);
    assert.equal(error.message.includes('token'), false);
    return true;
  });

  const revoked = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 401, headers: {}, body: JSON.stringify({ code: 'revoked_device' }) }], []),
  });
  await assert.rejects(() => revoked.uploadSessions([session()]), (error) => {
    assert.equal(error.kind, 'revoked-device');
    return true;
  });
});

test('400 validation responses expose rejected records and reasons', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 400, headers: {}, body: JSON.stringify({ rejected: [{ sessionId: 'api-session', reason: 'invalid active duration' }] }) }], []),
  });
  await assert.rejects(() => client.uploadSessions([session()]), (error) => {
    assert.equal(error.kind, 'validation');
    assert.deepEqual(error.rejected, [{ sessionId: 'api-session', reason: 'invalid active duration' }]);
    return true;
  });
});

test('validation error maps can identify rejected session reasons', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 400, headers: {}, body: JSON.stringify({ errors: { 'api-session': 'invalid archetype' } }) }], []),
  });
  await assert.rejects(() => client.uploadSessions([session()]), (error) => {
    assert.deepEqual(error.rejected, [{ sessionId: 'api-session', reason: 'invalid archetype' }]);
    return true;
  });
});

test('network failures are marked retryable without leaking credentials', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'secret-token',
    request: fakeTransport([new Error('offline')], []),
  });
  await assert.rejects(() => client.uploadSessions([session()]), (error) => {
    assert.equal(error.kind, 'network');
    assert.equal(error.retryable, true);
    assert.equal(error.message.includes('secret-token'), false);
    return true;
  });
});
