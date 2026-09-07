const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
  SprintlyApiClient,
  SprintlyApiError,
  SPRINTLY_MAX_SESSIONS_PER_REQUEST,
} = require('../out/integration/sprintlyApi');
const { nodeHttpRequest } = require('../out/integration/sprintlyApi');

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
    token: 'must-not-be-sent-to-health',
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
    request: fakeTransport([{ status: 202, headers: {}, body: JSON.stringify({
      ok: true, contract: 'devstrava.session.v1', schemaVersion: 1,
      accepted: [{ sessionId: 'api-session' }],
    }) }], calls),
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
    request: fakeTransport([{ status: 409, headers: {}, body: JSON.stringify({
      ok: true, contract: 'devstrava.session.v1', schemaVersion: 1,
      duplicates: ['api-session'],
    }) }], []),
  });
  const result = await client.uploadSessions([session()]);
  assert.deepEqual(result.duplicateSessionIds, ['api-session']);
  assert.deepEqual(result.rejected, []);
});

test('generic ok responses do not implicitly acknowledge unnamed sessions', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 202, headers: {}, body: JSON.stringify({
      ok: true, contract: 'devstrava.session.v1', schemaVersion: 1,
    }) }], []),
  });
  const result = await client.uploadSessions([session()]);
  assert.deepEqual(result.acceptedSessionIds, []);
  assert.deepEqual(result.duplicateSessionIds, []);
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

test('unknown upload response contracts stop synchronization', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 202, headers: {}, body: JSON.stringify({
      ok: true, contract: 'future.contract', schemaVersion: 2, accepted: ['api-session'],
    }) }], []),
  });
  await assert.rejects(() => client.uploadSessions([session()]), (error) => {
    assert.equal(error.kind, 'contract');
    assert.equal(error.retryable, false);
    return true;
  });
});

test('sync-disabled responses are distinct from transient HTTP failures', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 403, headers: {}, body: JSON.stringify({ code: 'SYNC_DISABLED' }) }], []),
  });
  await assert.rejects(() => client.uploadSessions([session()]), (error) => {
    assert.equal(error.kind, 'sync-disabled');
    assert.equal(error.retryable, false);
    return true;
  });
});

test('successful-looking sync-disabled responses still stop future uploads', async () => {
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([{ status: 200, headers: {}, body: JSON.stringify({
      ok: false, syncDisabled: true,
    }) }], []),
  });
  await assert.rejects(() => client.uploadSessions([session()]), (error) => {
    assert.equal(error.kind, 'sync-disabled');
    return true;
  });
});

test('upload client rejects batches above the website session limit before sending', async () => {
  const calls = [];
  const client = new SprintlyApiClient({
    baseUrl: 'http://localhost:3000',
    token: 'token',
    request: fakeTransport([], calls),
  });
  const sessions = Array.from({ length: SPRINTLY_MAX_SESSIONS_PER_REQUEST + 1 }, (_, index) => session(`api-${index}`));
  await assert.rejects(() => client.uploadSessions(sessions), /at most/);
  assert.equal(calls.length, 0);
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

test('standard-library transport reaches a loopback HTTP server', async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/extension/health') {
        response.end(JSON.stringify({ ok: true, contract: 'devstrava.session.v1', schemaVersion: 1 }));
      } else {
        response.statusCode = 202;
        response.end(JSON.stringify({
          ok: true, contract: 'devstrava.session.v1', schemaVersion: 1,
          accepted: ['api-session'],
        }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const client = new SprintlyApiClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: 'loopback-token',
    request: nodeHttpRequest,
  });
  try {
    await client.health();
    await client.uploadSessions([session()]);
    assert.equal(requests[0].authorization, undefined);
    assert.equal(requests[1].authorization, 'Bearer loopback-token');
    assert.deepEqual(JSON.parse(requests[1].body).sessions, [session()]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
