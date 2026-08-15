const assert = require('node:assert/strict');
const test = require('node:test');

const { CLAUDE_CODE_SOURCE, CODEX_SOURCE } = require('../out/tracking/agentLogSources');

test('Claude Code and Codex sources expose their logged workspace paths', () => {
  assert.equal(
    CLAUDE_CODE_SOURCE.extractWorkspacePath({ type: 'user', cwd: 'C:\\work\\claude' }),
    'C:\\work\\claude',
  );
  assert.equal(
    CODEX_SOURCE.extractWorkspacePath({ type: 'session_meta', payload: { cwd: 'C:\\work\\codex' } }),
    'C:\\work\\codex',
  );
});
