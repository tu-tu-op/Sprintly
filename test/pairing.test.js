const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DelegatingPairingAdapter,
  UnavailablePairingAdapter,
} = require('../out/integration/pairing');

test('default pairing adapter fails clearly until the website protocol exists', async () => {
  await assert.rejects(
    () => new UnavailablePairingAdapter().exchangeCode({ code: 'short-lived-code' }),
    /pairing is not available yet/,
  );
});

test('pairing adapter boundary accepts a future typed device-token exchange', async () => {
  const adapter = new DelegatingPairingAdapter(async (request) => ({
    ok: true,
    deviceToken: `device-for-${request.code}`,
    expiresAt: '2026-08-15T12:00:00.000Z',
  }));
  assert.deepEqual(await adapter.exchangeCode({ code: 'abc123' }), {
    ok: true,
    deviceToken: 'device-for-abc123',
    expiresAt: '2026-08-15T12:00:00.000Z',
  });
});
