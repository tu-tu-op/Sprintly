function createEmptyTelemetry() {
  return {
    schemaVersion: 1,
    counters: {
      edits: 0,
      saves: 0,
      fileSwitches: 0,
      uniqueFiles: 0,
      terminalCommands: 0,
      terminalFailures: 0,
      failedRuns: 0,
      testFailures: 0,
      debugSessions: 0,
      undoRedoEvents: 0,
      quickRevisions: 0,
      repeatedEdits: 0
    },
    timing: {
      activeSeconds: 0,
      idleSeconds: 0,
      lastActivityAt: null
    },
    languageBuckets: {},
    privacy: {
      rawCodeCaptured: false,
      rawCommandsCaptured: false,
      filePathsCaptured: false,
      syncReadySummaryOnly: true
    }
  };
}

function createSessionSummary(state) {
  return {
    schemaVersion: 1,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt || new Date().toISOString(),
    elapsedSeconds: state.elapsedSeconds,
    telemetry: cloneTelemetry(state.telemetry),
    scores: state.scores,
    share: {
      title: state.scores.archetype.label,
      line: state.scores.shareLine,
      publicByDefault: false
    }
  };
}

function cloneTelemetry(telemetry) {
  return JSON.parse(JSON.stringify(telemetry));
}

module.exports = {
  createEmptyTelemetry,
  createSessionSummary,
  cloneTelemetry
};
