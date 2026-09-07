const assert = require('node:assert/strict');
const test = require('node:test');

const manifest = require('../package.json');

test('manifest exposes the complete website connection command set', () => {
  const commands = new Map(manifest.contributes.commands.map((command) => [command.command, command.title]));
  for (const command of [
    'sprintly.connectExtension',
    'sprintly.enterPairingCode',
    'sprintly.connect',
    'sprintly.setDevelopmentToken',
    'sprintly.testConnection',
    'sprintly.syncCurrentSession',
    'sprintly.syncPendingSessions',
    'sprintly.syncNow',
    'sprintly.migrateLocalSessions',
    'sprintly.clearSyncQueue',
    'sprintly.viewSyncStatus',
    'sprintly.disconnect',
    'sprintly.exportData',
  ]) {
    assert.equal(typeof commands.get(command), 'string', `missing ${command}`);
  }
});

test('manifest keeps local API and privacy-preserving defaults configurable', () => {
  const properties = manifest.contributes.configuration.properties;
  assert.equal(properties['sprintly.apiUrl'].default, 'http://localhost:3000');
  assert.deepEqual(properties['sprintly.apiEnvironment'].enum, ['development', 'production']);
  assert.deepEqual(properties['sprintly.syncPreference'].enum, ['never', 'selected', 'completed', 'leaderboard']);
  assert.equal(properties['sprintly.syncPreference'].default, 'never');
  assert.equal(properties['sprintly.syncEnabled'].default, false);
  assert.equal(properties['sprintly.telemetry.trackTerminalActivity'].default, true);
  assert.equal(properties['sprintly.leaderboardOptIn'].default, false);
  assert.equal(properties['sprintly.developmentToken'], undefined);
});
