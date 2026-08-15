const assert = require('node:assert/strict');
const test = require('node:test');

const { LocalSessionPacketSigner } = require('../out/tracking/sessionVerification');

function payload() {
  return {
    schemaVersion: 'devstrava.session.v1',
    sessionId: 'sess_signed',
    startedAt: '2026-08-15T11:00:00.000Z',
    endedAt: '2026-08-15T12:00:00.000Z',
    activeDurationSeconds: 3_000,
    pauseDurationSeconds: 120,
    coding: {
      manualPercent: 60, aiAssistedPercent: 30, automationPercent: 5, unknownBulkEditPercent: 5,
      manualSeconds: 1_800, aiAssistedSeconds: 900, automationSeconds: 150, unknownBulkEditSeconds: 150,
    },
    activity: { edits: 10, saves: 2, filesTouched: 3, fileSwitches: 1, linesChangedEstimate: 20 },
    terminal: {
      totalCommands: 2, terminalOpens: 1, build: 1, test: 1, git: 0,
      packageManager: 0, devServer: 0, lint: 0, formatter: 0, deployment: 0, other: 0,
    },
    ai: {
      claudeCodePrompts: 1, codexPrompts: 1, copilotPrompts: 1,
      tokenTotals: { claude: null, codex: null, copilot: null },
    },
    reliability: {
      failures: 0, recoveredFailures: 0, recoveryRate: 100, failureStreak: 0,
      cleanSession: true, byCategory: {},
    },
    scores: {
      devScoreVersion: 1, focus: 80, consistency: 90, recovery: 100,
      testingDiscipline: 50, shippingActivity: 20, aiBalance: 30, devScore: 70,
    },
    archetype: { primaryArchetype: 'Steady Builder', secondaryTraits: [] },
  };
}

test('optional local session signer signs and verifies aggregate packets', async () => {
  const values = new Map();
  const secrets = {
    get: async (key) => values.get(key),
    store: async (key, value) => values.set(key, value),
  };
  const signer = new LocalSessionPacketSigner(secrets);
  const packet = await signer.sign(payload());
  assert.equal(await signer.verify(packet), true);
  packet.payload.activity.edits += 1;
  assert.equal(await signer.verify(packet), false);
});
