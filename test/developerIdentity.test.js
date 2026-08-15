const assert = require('node:assert/strict');
const test = require('node:test');

const { deriveDeveloperIdentity } = require('../out/tracking/developerIdentity');

test('developer identity is deterministic and presentation-safe', () => {
  const profile = { primary: 'Terminal Warrior', traits: ['Terminal-heavy', 'Fast exploration'] };
  const first = deriveDeveloperIdentity(profile);
  const second = deriveDeveloperIdentity(profile);
  assert.deepEqual(first, second);
  assert.equal(first.avatarId, 'terminal-flame');
  assert.equal(first.accent, '#059669');
  assert.deepEqual(first.traits, profile.traits);
});
