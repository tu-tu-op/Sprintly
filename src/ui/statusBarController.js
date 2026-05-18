const vscode = require('vscode');

class StatusBarController {
  /**
   * @param {import('../session/sessionManager').SessionManager} sessionManager
   */
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.sessionControlItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.changeSubscription = this.sessionManager.onDidChange((state) => {
      this._render(state);
    });

    this.sessionControlItem.command = 'sprintly.toggleStats';

    this.sessionControlItem.show();
    this._render(this.sessionManager.getSnapshot());
  }

  _render(state) {
    this.sessionControlItem.text = state.isRecording && !state.isPaused
      ? '$(radio-tower) Sprintly'
      : '$(circle-large-outline) Sprintly';
    this.sessionControlItem.name = 'Sprintly Control Panel';
    this.sessionControlItem.tooltip = getRecordingTooltip(state);
  }

  dispose() {
    if (this.changeSubscription) {
      this.changeSubscription.dispose();
    }

    this.sessionControlItem.dispose();
  }
}

function getRecordingTooltip(state) {
  if (state.isRecording && state.isPaused) {
    return 'Sprintly recording is paused. Click to open the compact control panel.';
  }

  if (state.isRecording) {
    return `Open Sprintly controls. ${state.scores.archetype.label}: ${state.scores.scores.hardcore}% hardcore.`;
  }

  return 'Sprintly is idle. Click to open the compact control panel.';
}

module.exports = {
  StatusBarController
};
