const vscode = require('vscode');
const { createScoreSnapshot } = require('./scoringModel');
const { createEmptyTelemetry, createSessionSummary, cloneTelemetry } = require('./telemetryModel');

const CONSENT_UNKNOWN = 'unknown';
const CONSENT_ACCEPTED = 'accepted';
const CONSENT_DECLINED = 'declined';
const ACTIVE_WINDOW_SECONDS = 120;
const REPEATED_EDIT_WINDOW_MS = 15000;

class SessionManager {
  /**
   * @param {import('../state/sessionStore').SessionStore} store
   */
  constructor(store) {
    this.store = store;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
    this._timer = undefined;
    this._seenFileKeys = new Set();
    this._recentEditTimes = new Map();
    this._lastActiveFileKey = null;
    this.state = {
      sessionId: createSessionId(),
      consentStatus: CONSENT_UNKNOWN,
      storedConsentStatus: CONSENT_UNKNOWN,
      isRecording: false,
      isPaused: false,
      startedAt: null,
      stoppedAt: null,
      lastPromptedAt: null,
      lastDecisionAt: null,
      promptCount: 0,
      panelViewCount: 0,
      elapsedSeconds: 0,
      telemetry: createEmptyTelemetry(),
      scores: createScoreSnapshot(createEmptyTelemetry())
    };
  }

  async initialize() {
    this.state.storedConsentStatus = await this.store.getStoredConsentStatus();
    this._emitChange();
  }

  getSnapshot() {
    return {
      ...this.state,
      telemetry: cloneTelemetry(this.state.telemetry),
      scores: JSON.parse(JSON.stringify(this.state.scores))
    };
  }

  async acceptCurrentSession() {
    const decisionTime = new Date().toISOString();
    const shouldStartFresh = !this.state.isRecording;
    this.state.consentStatus = CONSENT_ACCEPTED;
    this.state.storedConsentStatus = CONSENT_ACCEPTED;
    this.state.isRecording = true;
    this.state.isPaused = false;
    this.state.sessionId = shouldStartFresh ? createSessionId() : this.state.sessionId;
    this.state.startedAt = shouldStartFresh ? decisionTime : this.state.startedAt;
    this.state.stoppedAt = null;
    this.state.lastDecisionAt = decisionTime;
    this.state.elapsedSeconds = shouldStartFresh ? 0 : this.state.elapsedSeconds;
    if (shouldStartFresh) {
      this._resetTelemetry();
    }
    await this.store.setStoredConsentStatus(CONSENT_ACCEPTED);
    this._ensureTimer();
    this._emitChange();
  }

  async declineCurrentSession() {
    const decisionTime = new Date().toISOString();
    this.state.consentStatus = CONSENT_DECLINED;
    this.state.storedConsentStatus = CONSENT_DECLINED;
    this.state.isRecording = false;
    this.state.isPaused = false;
    this.state.startedAt = null;
    this.state.stoppedAt = decisionTime;
    this.state.lastDecisionAt = decisionTime;
    this.state.elapsedSeconds = 0;
    this._resetTelemetry();
    await this.store.setStoredConsentStatus(CONSENT_DECLINED);
    this._disposeTimer();
    this._emitChange();
  }

  async stopRecording() {
    const stoppedAt = new Date().toISOString();
    this.state.isRecording = false;
    this.state.isPaused = false;
    this.state.consentStatus = CONSENT_ACCEPTED;
    this.state.stoppedAt = stoppedAt;
    this.state.lastDecisionAt = stoppedAt;
    await this.store.setStoredConsentStatus(CONSENT_ACCEPTED);
    this._updateElapsedSeconds();
    this._updateScores();
    await this.store.addSessionSummary(createSessionSummary(this.state));
    this._disposeTimer();
    this._emitChange();
  }

  pauseRecording() {
    if (!this.state.isRecording || this.state.isPaused) {
      return;
    }

    this.state.isPaused = true;
    this.state.lastDecisionAt = new Date().toISOString();
    this._updateScores();
    this._emitChange();
  }

  resumeRecording() {
    if (!this.state.isRecording || !this.state.isPaused) {
      return;
    }

    this.state.isPaused = false;
    this.state.lastDecisionAt = new Date().toISOString();
    this._markActivity();
    this._emitChange();
  }

  resetCurrentSession() {
    this.state.sessionId = createSessionId();
    this.state.startedAt = this.state.isRecording ? new Date().toISOString() : null;
    this.state.stoppedAt = null;
    this.state.elapsedSeconds = 0;
    this._resetTelemetry();
    this._emitChange();
  }

  notePromptShown() {
    this.state.promptCount += 1;
    this.state.lastPromptedAt = new Date().toISOString();
    this._emitChange();
  }

  notePanelShown() {
    this.state.panelViewCount += 1;
    this._emitChange();
  }

  getConsentOptions() {
    return {
      consentAccepted: CONSENT_ACCEPTED,
      consentDeclined: CONSENT_DECLINED,
      consentUnknown: CONSENT_UNKNOWN
    };
  }

  recordEditorEdit({ fileKey, languageId, changeCount, isUndoRedo }) {
    if (!this._canTrack()) {
      return;
    }

    const now = Date.now();
    const previousEditTime = this._recentEditTimes.get(fileKey);
    this.state.telemetry.counters.edits += Math.max(1, changeCount);
    this._trackFile(fileKey, languageId);

    if (previousEditTime && now - previousEditTime <= REPEATED_EDIT_WINDOW_MS) {
      this.state.telemetry.counters.repeatedEdits += 1;
    }

    if (isUndoRedo) {
      this.state.telemetry.counters.undoRedoEvents += 1;
      this.state.telemetry.counters.quickRevisions += 1;
    }

    this._recentEditTimes.set(fileKey, now);
    this._markActivity();
    this._updateScores();
    this._emitChange();
  }

  recordSave({ fileKey, languageId }) {
    if (!this._canTrack()) {
      return;
    }

    this.state.telemetry.counters.saves += 1;
    this._trackFile(fileKey, languageId);
    this._markActivity();
    this._updateScores();
    this._emitChange();
  }

  recordFileSwitch({ fileKey, languageId }) {
    if (!this._canTrack()) {
      return;
    }

    if (this._lastActiveFileKey && this._lastActiveFileKey !== fileKey) {
      this.state.telemetry.counters.fileSwitches += 1;
    }

    this._lastActiveFileKey = fileKey;
    this._trackFile(fileKey, languageId);
    this._markActivity();
    this._updateScores();
    this._emitChange();
  }

  recordTerminalCommand() {
    if (!this._canTrack()) {
      return;
    }

    this.state.telemetry.counters.terminalCommands += 1;
    this._markActivity();
    this._updateScores();
    this._emitChange();
  }

  recordTerminalFailure() {
    if (!this._canTrack()) {
      return;
    }

    this.state.telemetry.counters.terminalFailures += 1;
    this.state.telemetry.counters.failedRuns += 1;
    this._markActivity();
    this._updateScores();
    this._emitChange();
  }

  recordFailedRun({ isTestFailure }) {
    if (!this._canTrack()) {
      return;
    }

    this.state.telemetry.counters.failedRuns += 1;
    if (isTestFailure) {
      this.state.telemetry.counters.testFailures += 1;
    }

    this._markActivity();
    this._updateScores();
    this._emitChange();
  }

  recordDebugSession() {
    if (!this._canTrack()) {
      return;
    }

    this.state.telemetry.counters.debugSessions += 1;
    this._markActivity();
    this._updateScores();
    this._emitChange();
  }

  _ensureTimer() {
    if (this._timer) {
      return;
    }

    this._timer = setInterval(() => {
      this._updateElapsedSeconds();
      this._updateActivityTime();
      this._updateScores();
      this._emitChange();
    }, 1000);
  }

  _updateElapsedSeconds() {
    if (!this.state.startedAt) {
      this.state.elapsedSeconds = 0;
      return;
    }

    const startedAtMs = new Date(this.state.startedAt).getTime();
    this.state.elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  }

  _updateActivityTime() {
    if (!this.state.isRecording || this.state.isPaused) {
      return;
    }

    const lastActivityAt = this.state.telemetry.timing.lastActivityAt
      ? new Date(this.state.telemetry.timing.lastActivityAt).getTime()
      : 0;

    if (lastActivityAt && Date.now() - lastActivityAt <= ACTIVE_WINDOW_SECONDS * 1000) {
      this.state.telemetry.timing.activeSeconds += 1;
    } else {
      this.state.telemetry.timing.idleSeconds += 1;
    }
  }

  _canTrack() {
    return this.state.isRecording && !this.state.isPaused;
  }

  _markActivity() {
    this.state.telemetry.timing.lastActivityAt = new Date().toISOString();
  }

  _trackFile(fileKey, languageId) {
    if (!this._seenFileKeys.has(fileKey)) {
      this._seenFileKeys.add(fileKey);
      this.state.telemetry.counters.uniqueFiles = this._seenFileKeys.size;
    }

    const bucket = languageId || 'unknown';
    this.state.telemetry.languageBuckets[bucket] = (this.state.telemetry.languageBuckets[bucket] || 0) + 1;
  }

  _resetTelemetry() {
    this._seenFileKeys = new Set();
    this._recentEditTimes = new Map();
    this._lastActiveFileKey = null;
    this.state.telemetry = createEmptyTelemetry();
    this._updateScores();
  }

  _updateScores() {
    this.state.scores = createScoreSnapshot(this.state.telemetry);
  }

  _disposeTimer() {
    if (!this._timer) {
      return;
    }

    clearInterval(this._timer);
    this._timer = undefined;
  }

  _emitChange() {
    this._onDidChange.fire(this.getSnapshot());
  }

  dispose() {
    this._disposeTimer();
    this._onDidChange.dispose();
  }
}

function createSessionId() {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  SessionManager,
  CONSENT_ACCEPTED,
  CONSENT_DECLINED,
  CONSENT_UNKNOWN
};
