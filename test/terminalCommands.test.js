const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifyTerminalCommand,
  emptyTerminalCommandCounts,
} = require('../out/tracking/terminalCommands');

test('terminal commands are classified into privacy-safe aggregate categories', () => {
  assert.equal(classifyTerminalCommand('npm run build'), 'build');
  assert.equal(classifyTerminalCommand('pnpm test'), 'test');
  assert.equal(classifyTerminalCommand('git status'), 'git');
  assert.equal(classifyTerminalCommand('npm install'), 'package-manager');
  assert.equal(classifyTerminalCommand('npm run dev'), 'dev-server');
  assert.equal(classifyTerminalCommand('npx eslint src'), 'lint');
  assert.equal(classifyTerminalCommand('prettier --write src'), 'formatter');
  assert.equal(classifyTerminalCommand('vercel deploy'), 'deployment');
  assert.equal(classifyTerminalCommand('echo $SECRET'), 'other');
});

test('terminal category counters start at zero for every supported category', () => {
  assert.deepEqual(emptyTerminalCommandCounts(), {
    build: 0,
    test: 0,
    'package-manager': 0,
    git: 0,
    'dev-server': 0,
    lint: 0,
    formatter: 0,
    deployment: 0,
    other: 0,
  });
});
