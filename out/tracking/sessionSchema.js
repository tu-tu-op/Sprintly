"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEVSTRAVA_EXPORT_SCHEMA_VERSION = exports.DEVSTRAVA_SESSION_SCHEMA_VERSION = void 0;
exports.validateSessionContract = validateSessionContract;
exports.isSupportedSessionSchema = isSupportedSessionSchema;
exports.isoDate = isoDate;
exports.clampPercent = clampPercent;
/**
 * Public, aggregate-only contract shared by the extension and DevStrava web
 * handoff.  Keep this contract deliberately boring: it contains no source
 * code, prompt text, command text, terminal output, paths, or secrets.
 */
exports.DEVSTRAVA_SESSION_SCHEMA_VERSION = 'devstrava.session.v1';
exports.DEVSTRAVA_EXPORT_SCHEMA_VERSION = 'devstrava.export.v1';
/**
 * Validate a website/import session without coercing malformed values.  The
 * local legacy migration path is separate so an invalid import can never be
 * silently turned into a zero-filled session.
 */
function validateSessionContract(value) {
    if (!isRecord(value)) {
        return failure('session must be an object');
    }
    if (value.schemaVersion !== exports.DEVSTRAVA_SESSION_SCHEMA_VERSION) {
        return failure(`unsupported session schema: ${String(value.schemaVersion ?? 'missing')}`);
    }
    const errors = [];
    const sessionId = requireString(value.sessionId, 'sessionId', errors);
    const startedAt = requireIsoDate(value.startedAt, 'startedAt', errors);
    const endedAt = requireIsoDate(value.endedAt, 'endedAt', errors);
    if (startedAt && endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
        errors.push('endedAt must not be before startedAt');
    }
    const activeDurationSeconds = requireNonNegative(value.activeDurationSeconds, 'activeDurationSeconds', errors);
    const pauseDurationSeconds = requireNonNegative(value.pauseDurationSeconds, 'pauseDurationSeconds', errors);
    const coding = validateCoding(value.coding, errors);
    const activity = validateActivity(value.activity, errors);
    const terminal = validateTerminal(value.terminal, errors);
    const ai = validateAi(value.ai, errors);
    const reliability = validateReliability(value.reliability, errors);
    const scores = validateScores(value.scores, errors);
    const archetype = validateArchetype(value.archetype, errors);
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        value: {
            schemaVersion: exports.DEVSTRAVA_SESSION_SCHEMA_VERSION,
            sessionId,
            startedAt,
            endedAt,
            activeDurationSeconds,
            pauseDurationSeconds,
            coding,
            activity,
            terminal,
            ai,
            reliability,
            scores,
            archetype,
        },
    };
}
function isSupportedSessionSchema(value) {
    return value === exports.DEVSTRAVA_SESSION_SCHEMA_VERSION || value === 1;
}
function isoDate(timestamp) {
    const safe = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
    return new Date(safe).toISOString();
}
function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
function validateCoding(value, errors) {
    const record = requireRecord(value, 'coding', errors);
    return {
        manualPercent: requirePercent(record.manualPercent, 'coding.manualPercent', errors),
        aiAssistedPercent: requirePercent(record.aiAssistedPercent, 'coding.aiAssistedPercent', errors),
        automationPercent: requirePercent(record.automationPercent, 'coding.automationPercent', errors),
        unknownBulkEditPercent: requirePercent(record.unknownBulkEditPercent, 'coding.unknownBulkEditPercent', errors),
        manualSeconds: requireNonNegative(record.manualSeconds, 'coding.manualSeconds', errors),
        aiAssistedSeconds: requireNonNegative(record.aiAssistedSeconds, 'coding.aiAssistedSeconds', errors),
        automationSeconds: requireNonNegative(record.automationSeconds, 'coding.automationSeconds', errors),
        unknownBulkEditSeconds: requireNonNegative(record.unknownBulkEditSeconds, 'coding.unknownBulkEditSeconds', errors),
    };
}
function validateActivity(value, errors) {
    const record = requireRecord(value, 'activity', errors);
    return {
        edits: requireNonNegative(record.edits, 'activity.edits', errors),
        saves: requireNonNegative(record.saves, 'activity.saves', errors),
        filesTouched: requireNonNegative(record.filesTouched, 'activity.filesTouched', errors),
        fileSwitches: requireNonNegative(record.fileSwitches, 'activity.fileSwitches', errors),
        linesChangedEstimate: requireNonNegative(record.linesChangedEstimate, 'activity.linesChangedEstimate', errors),
    };
}
function validateTerminal(value, errors) {
    const record = requireRecord(value, 'terminal', errors);
    return {
        totalCommands: requireNonNegative(record.totalCommands, 'terminal.totalCommands', errors),
        terminalOpens: requireNonNegative(record.terminalOpens, 'terminal.terminalOpens', errors),
        build: requireNonNegative(record.build, 'terminal.build', errors),
        test: requireNonNegative(record.test, 'terminal.test', errors),
        git: requireNonNegative(record.git, 'terminal.git', errors),
        packageManager: requireNonNegative(record.packageManager, 'terminal.packageManager', errors),
        devServer: requireNonNegative(record.devServer, 'terminal.devServer', errors),
        lint: requireNonNegative(record.lint, 'terminal.lint', errors),
        formatter: requireNonNegative(record.formatter, 'terminal.formatter', errors),
        deployment: requireNonNegative(record.deployment, 'terminal.deployment', errors),
        other: requireNonNegative(record.other, 'terminal.other', errors),
    };
}
function validateAi(value, errors) {
    const record = requireRecord(value, 'ai', errors);
    const tokens = requireRecord(record.tokenTotals, 'ai.tokenTotals', errors);
    return {
        claudeCodePrompts: requireNonNegative(record.claudeCodePrompts, 'ai.claudeCodePrompts', errors),
        codexPrompts: requireNonNegative(record.codexPrompts, 'ai.codexPrompts', errors),
        copilotPrompts: requireNonNegative(record.copilotPrompts, 'ai.copilotPrompts', errors),
        tokenTotals: {
            claude: requireNullableNonNegative(tokens.claude, 'ai.tokenTotals.claude', errors),
            codex: requireNullableNonNegative(tokens.codex, 'ai.tokenTotals.codex', errors),
            copilot: requireNullableNonNegative(tokens.copilot, 'ai.tokenTotals.copilot', errors),
        },
    };
}
function validateReliability(value, errors) {
    const record = requireRecord(value, 'reliability', errors);
    const byCategoryValue = record.byCategory;
    const byCategory = {};
    if (!isRecord(byCategoryValue)) {
        errors.push('reliability.byCategory must be an object');
    }
    else {
        for (const [key, count] of Object.entries(byCategoryValue)) {
            byCategory[key] = requireNonNegative(count, `reliability.byCategory.${key}`, errors);
        }
    }
    return {
        failures: requireNonNegative(record.failures, 'reliability.failures', errors),
        recoveredFailures: requireNonNegative(record.recoveredFailures, 'reliability.recoveredFailures', errors),
        recoveryRate: requirePercent(record.recoveryRate, 'reliability.recoveryRate', errors),
        failureStreak: requireNonNegative(record.failureStreak, 'reliability.failureStreak', errors),
        cleanSession: requireBoolean(record.cleanSession, 'reliability.cleanSession', errors),
        byCategory,
        successfulRuns: optionalNonNegative(record.successfulRuns, 'reliability.successfulRuns', errors),
        maxFailureStreak: optionalNonNegative(record.maxFailureStreak, 'reliability.maxFailureStreak', errors),
    };
}
function validateScores(value, errors) {
    const record = requireRecord(value, 'scores', errors);
    if (record.devScoreVersion !== 1) {
        errors.push('scores.devScoreVersion must be 1');
    }
    return {
        devScoreVersion: 1,
        focus: requirePercent(record.focus, 'scores.focus', errors),
        consistency: requirePercent(record.consistency, 'scores.consistency', errors),
        recovery: requirePercent(record.recovery, 'scores.recovery', errors),
        testingDiscipline: requirePercent(record.testingDiscipline, 'scores.testingDiscipline', errors),
        shippingActivity: requirePercent(record.shippingActivity, 'scores.shippingActivity', errors),
        aiBalance: requirePercent(record.aiBalance, 'scores.aiBalance', errors),
        devScore: requirePercent(record.devScore, 'scores.devScore', errors),
    };
}
function validateArchetype(value, errors) {
    const record = requireRecord(value, 'archetype', errors);
    const primaryArchetype = requireString(record.primaryArchetype, 'archetype.primaryArchetype', errors);
    const secondaryTraits = Array.isArray(record.secondaryTraits)
        ? record.secondaryTraits.filter((trait) => typeof trait === 'string')
        : [];
    if (!Array.isArray(record.secondaryTraits)) {
        errors.push('archetype.secondaryTraits must be an array');
    }
    return { primaryArchetype, secondaryTraits };
}
function requireRecord(value, label, errors) {
    if (!isRecord(value)) {
        errors.push(`${label} must be an object`);
        return {};
    }
    return value;
}
function requireString(value, label, errors) {
    if (typeof value !== 'string' || value.length === 0) {
        errors.push(`${label} must be a non-empty string`);
        return '';
    }
    return value;
}
function requireIsoDate(value, label, errors) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
        errors.push(`${label} must be an ISO date`);
        return '';
    }
    return new Date(value).toISOString();
}
function requireNonNegative(value, label, errors) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        errors.push(`${label} must be a non-negative number`);
        return 0;
    }
    return value;
}
function optionalNonNegative(value, label, errors) {
    if (value === undefined)
        return undefined;
    return requireNonNegative(value, label, errors);
}
function requireNullableNonNegative(value, label, errors) {
    if (value === null)
        return null;
    return requireNonNegative(value, label, errors);
}
function requirePercent(value, label, errors) {
    const number = requireNonNegative(value, label, errors);
    if (number > 100) {
        errors.push(`${label} must be between 0 and 100`);
    }
    return number;
}
function requireBoolean(value, label, errors) {
    if (typeof value !== 'boolean') {
        errors.push(`${label} must be a boolean`);
        return false;
    }
    return value;
}
function failure(message) {
    return { ok: false, errors: [message] };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=sessionSchema.js.map