const vscode = require('vscode');

const START_RECORDING = 'Start Recording';
const NOT_NOW = 'Not Now';
const STOP_RECORDING = 'Stop Recording';
const PAUSE_RECORDING = 'Pause';
const RESUME_RECORDING = 'Resume';
const RESET_SESSION = 'Reset Session';
const VIEW_STATS = 'View Stats';

/**
 * @param {import('../session/sessionManager').SessionManager} sessionManager
 * @param {import('./sessionPanel').SessionPanel} sessionPanel
 * @param {{ source?: string }} [options]
 */
async function showConsentPrompt(sessionManager, sessionPanel, options = {}) {
  sessionManager.notePromptShown();
  const snapshot = sessionManager.getSnapshot();
  const detail = buildMessage(snapshot, options.source);

  const actions = snapshot.isRecording
    ? [snapshot.isPaused ? RESUME_RECORDING : PAUSE_RECORDING, STOP_RECORDING, RESET_SESSION, VIEW_STATS]
    : [START_RECORDING, NOT_NOW, VIEW_STATS];
  const items = actions.map((action) => ({
    label: action,
    description: getActionDescription(action)
  }));

  const selection = await vscode.window.showQuickPick(items, {
    title: 'DevStrava',
    placeHolder: detail,
    ignoreFocusOut: false
  });
  const selectedAction = selection ? selection.label : undefined;

  if (selectedAction === START_RECORDING) {
    await sessionManager.acceptCurrentSession();
    return;
  }

  if (selectedAction === STOP_RECORDING) {
    await sessionManager.stopRecording();
    return;
  }

  if (selectedAction === PAUSE_RECORDING) {
    sessionManager.pauseRecording();
    return;
  }

  if (selectedAction === RESUME_RECORDING) {
    sessionManager.resumeRecording();
    return;
  }

  if (selectedAction === RESET_SESSION) {
    sessionManager.resetCurrentSession();
    return;
  }

  if (selectedAction === VIEW_STATS) {
    sessionPanel.show();
    return;
  }

  if (selectedAction === NOT_NOW) {
    await sessionManager.declineCurrentSession();
  }
}

function getActionDescription(action) {
  if (action === START_RECORDING) {
    return 'Begin recording this coding session';
  }

  if (action === NOT_NOW) {
    return 'Keep DevStrava idle';
  }

  if (action === VIEW_STATS) {
    return 'Reveal the compact panel';
  }

  if (action === PAUSE_RECORDING) {
    return 'Pause activity tracking';
  }

  if (action === RESUME_RECORDING) {
    return 'Continue activity tracking';
  }

  if (action === STOP_RECORDING) {
    return 'End this session';
  }

  if (action === RESET_SESSION) {
    return 'Clear current counters';
  }

  return '';
}

function buildMessage(snapshot, source) {
  if (snapshot.isRecording) {
    return snapshot.isPaused
      ? 'DevStrava is paused. Resume, reset, stop, or open the session panel.'
      : 'DevStrava is recording aggregated coding-session stats. Pause, reset, stop, or open the session panel.';
  }

  if (source === 'startup' && snapshot.storedConsentStatus === 'declined') {
    return 'DevStrava is off. Your last local choice was "Not Now". Start recording this coding session?';
  }

  if (source === 'startup' && snapshot.storedConsentStatus === 'accepted') {
    return 'DevStrava does not auto-record. You approved recording previously, but this new coding session still needs explicit consent. Start now?';
  }

  return 'DevStrava is off by default. Start recording the current coding session?';
}

module.exports = {
  showConsentPrompt
};
