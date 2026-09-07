const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DelegatingPairingAdapter,
  HttpPairingAdapter,
  UnavailablePairingAdapter,
} = require('../out/integration/pairing');

test('explicit unavailable pairing adapters fail clearly', async () => {
  await assert.rejects(
    () => new UnavailablePairingAdapter().exchangeCode({ code: 'short-lived-code' }),
    /pairing is not available/,
  );
});

test('pairing adapter boundary accepts the typed device-token exchange', async () => {
  const adapter = new DelegatingPairingAdapter(async (request) => ({
    ok: true,
    token: `device-for-${request.code}`,
    expiresAt: '2026-08-15T12:00:00.000Z',
  }));
  assert.deepEqual(await adapter.exchangeCode({
    code: 'abc123', deviceId: 'vscode-device-123', deviceName: 'Work laptop', deviceType: 'vscode',
  }), {
    ok: true,
    token: 'device-for-abc123',
    expiresAt: '2026-08-15T12:00:00.000Z',
  });
});

test('HTTP pairing sends the exact one-time exchange body without authorization', async () => {
  const calls = [];
  const adapter = new HttpPairingAdapter({
    baseUrl: 'http://localhost:3000/',
    request: async (request) => {
      calls.push(request);
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({ ok: true, token: 'opaque-device-token', expiresAt: '2026-08-15T12:00:00.000Z' }),
      };
    },
  });
  const response = await adapter.exchangeCode({
    code: 'A1B2C3D4E5F6',
    deviceId: 'vscode-device-123',
    deviceName: 'Work laptop',
    deviceType: 'vscode',
  });
  assert.deepEqual(response, {
    ok: true, token: 'opaque-device-token', expiresAt: '2026-08-15T12:00:00.000Z',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:3000/api/extension/pairing/complete');
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].body), {
    code: 'A1B2C3D4E5F6',
    deviceId: 'vscode-device-123',
    deviceName: 'Work laptop',
    deviceType: 'vscode',
  });
});
