const assert = require('node:assert/strict');
const test = require('node:test');

const { parseSprintlyPairingIntent } = require('../out/integration/connectionUri');

test('automatic pairing URI accepts only a short-lived code and website API origin', () => {
  assert.deepEqual(parseSprintlyPairingIntent({
    scheme: 'vscode',
    authority: 'tu-tu-op.sprintly',
    path: '/connect',
    query: 'code=A1B2C3D4E5F6&api=http%3A%2F%2Flocalhost%3A3000',
  }), {
    code: 'A1B2C3D4E5F6',
    apiUrl: 'http://localhost:3000',
  });
});

test('automatic pairing URI follows the VS Code edition that owns the handler', () => {
  assert.deepEqual(parseSprintlyPairingIntent({
    scheme: 'vscode-insiders',
    authority: 'tu-tu-op.sprintly',
    path: '/connect',
    query: 'code=A1B2C3D4E5F6',
  }), { code: 'A1B2C3D4E5F6' });
});

test('automatic pairing URI rejects malformed links and never accepts a token field', () => {
  assert.equal(parseSprintlyPairingIntent({
    scheme: 'https', authority: 'tu-tu-op.sprintly', path: '/connect', query: 'code=A1B2C3D4E5F6',
  }), null);
  assert.equal(parseSprintlyPairingIntent({
    scheme: 'vscode', authority: 'sprintly', path: '/connect', query: 'code=A1B2C3D4E5F6',
  }), null);
  assert.equal(parseSprintlyPairingIntent({
    scheme: 'vscode', authority: 'tu-tu-op.sprintly', path: '/other', query: 'code=A1B2C3D4E5F6',
  }), null);
  assert.deepEqual(parseSprintlyPairingIntent({
    scheme: 'vscode', authority: 'tu-tu-op.sprintly', path: '/connect', query: 'code=A1B2C3D4E5F6&token=secret',
  }), { code: 'A1B2C3D4E5F6' });
});
