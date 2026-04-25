function createScoreSnapshot(telemetry) {
  const activeMinutes = Math.max(1, telemetry.timing.activeSeconds / 60);
  const editRate = telemetry.counters.edits / activeMinutes;
  const saveRate = telemetry.counters.saves / activeMinutes;
  const switchRate = telemetry.counters.fileSwitches / activeMinutes;
  const terminalRate = telemetry.counters.terminalCommands / activeMinutes;
  const recoverySignals = telemetry.counters.undoRedoEvents + telemetry.counters.quickRevisions + telemetry.counters.repeatedEdits;
  const failureSignals = telemetry.counters.failedRuns + telemetry.counters.testFailures + telemetry.counters.terminalFailures;

  const scores = {
    vibecoding: clamp(Math.round((switchRate * 18) + (telemetry.counters.terminalCommands * 3) + (telemetry.counters.uniqueFiles * 4))),
    hardcore: clamp(Math.round((editRate * 12) + (saveRate * 10) + (telemetry.timing.activeSeconds / 45))),
    debugging: clamp(Math.round((failureSignals * 14) + (recoverySignals * 7) + (telemetry.counters.debugSessions * 18))),
    rhythm: clamp(Math.round((saveRate * 18) + (telemetry.counters.saves > 0 ? 24 : 0) - (telemetry.timing.idleSeconds / 120)))
  };

  const archetype = pickArchetype(scores, telemetry);

  return {
    schemaVersion: 1,
    scores,
    archetype,
    shareLine: buildShareLine(scores, archetype),
    generatedAt: new Date().toISOString()
  };
}

function pickArchetype(scores, telemetry) {
  if (scores.debugging >= 65) {
    return {
      id: 'bug-hunter',
      label: 'Bug Hunter',
      description: 'High recovery energy with plenty of debugging pressure.'
    };
  }

  if (scores.hardcore >= 70 && telemetry.counters.saves >= 5) {
    return {
      id: 'deep-work',
      label: 'Deep Work Sprinter',
      description: 'Focused edits, regular saves, and sustained active time.'
    };
  }

  if (scores.vibecoding >= 65) {
    return {
      id: 'vibecoder',
      label: 'Vibecoder',
      description: 'Fast exploration across files, terminals, and ideas.'
    };
  }

  if (scores.rhythm >= 60) {
    return {
      id: 'steady-builder',
      label: 'Steady Builder',
      description: 'Consistent movement with a clean save rhythm.'
    };
  }

  return {
    id: 'warming-up',
    label: 'Warming Up',
    description: 'A light session with room for a stronger signal.'
  };
}

function buildShareLine(scores, archetype) {
  return `${archetype.label}: ${scores.hardcore}% hardcore, ${scores.vibecoding}% vibecoding, ${scores.debugging}% debugging`;
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

module.exports = {
  createScoreSnapshot
};
