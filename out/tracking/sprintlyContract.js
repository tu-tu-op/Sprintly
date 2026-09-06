"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPRINTLY_SCHEMA_VERSION = exports.SPRINTLY_CONTRACT = void 0;
exports.mapSessionRecord = mapSessionRecord;
exports.createSprintlyExport = createSprintlyExport;
exports.serializeSprintlyExport = serializeSprintlyExport;
exports.validateSprintlyExport = validateSprintlyExport;
exports.validateSprintlySession = validateSprintlySession;
/** The wire contract owned by the Sprintly website. */
exports.SPRINTLY_CONTRACT = 'devstrava.session.v1';
exports.SPRINTLY_SCHEMA_VERSION = 1;
const SESSION_FIELDS = new Set([
    'contract',
    'schemaVersion',
    'sessionId',
    'startedAt',
    'endedAt',
    'activeDurationSeconds',
    'coding',
    'activity',
    'terminal',
    'ai',
    'reliability',
    'scores',
    'archetype',
]);
const CODING_FIELDS = new Set([
    'manualPercent',
    'aiAssistedPercent',
    'automationPercent',
    'unknownBulkEditPercent',
]);
const ACTIVITY_FIELDS = new Set(['edits', 'saves', 'filesTouched', 'linesChangedEstimate']);
const TERMINAL_FIELDS = new Set([
    'totalCommands',
    'build',
    'test',
    'git',
    'packageManager',
    'devServer',
    'lint',
    'other',
]);
const AI_FIELDS = new Set(['claudeCodePrompts', 'codexPrompts', 'copilotPrompts', 'tokenTotals']);
const TOKEN_FIELDS = new Set(['claude', 'codex', 'copilot']);
const RELIABILITY_FIELDS = new Set(['failures', 'recoveredFailures', 'recoveryRate']);
const SCORE_FIELDS = new Set([
    'focus',
    'testingDiscipline',
    'recovery',
    'consistency',
    'aiBalance',
    'devScore',
]);
const ARCHETYPE_FIELDS = new Set(['primary', 'traits']);
/**
 * Map the extension's local aggregate record to the website-owned wire
 * contract. The local record remains the source of truth; this function only
 * creates the privacy-safe, supported HTTP/export view.
 */
function mapSessionRecord(record) {
    const warnings = [];
    const coding = record.coding;
    const codingTotal = coding.manualMs + coding.aiAssistedMs + coding.automationMs + coding.unknownBulkMs;
    const codingPercent = percentageSplit([
        coding.manualMs,
        coding.aiAssistedMs,
        coding.automationMs,
        coding.unknownBulkMs,
    ]);
    if (codingTotal <= 0) {
        warnings.push({
            sessionId: record.id,
            field: 'coding',
            message: 'No attributed coding duration was observed; the wire contract records 100% as unknown bulk activity.',
        });
    }
    const durationSeconds = roundSeconds(record.activeDurationMs);
    if (durationSeconds < 1) {
        throw new Error(`Session ${record.id} has no active duration and cannot satisfy the Sprintly contract.`);
    }
    const formatterAndDeployment = record.terminalCommandsByCategory.formatter
        + record.terminalCommandsByCategory.deployment;
    if (record.terminalCommandsByCategory.formatter > 0) {
        warnings.push({
            sessionId: record.id,
            field: 'terminal.formatter',
            message: 'The website contract has no formatter bucket; formatter commands are included in terminal.other.',
        });
    }
    if (record.terminalCommandsByCategory.deployment > 0) {
        warnings.push({
            sessionId: record.id,
            field: 'terminal.deployment',
            message: 'The website contract has no deployment bucket; deployment commands are included in terminal.other.',
        });
    }
    if (record.terminalOpens > 0) {
        warnings.push({
            sessionId: record.id,
            field: 'terminal.terminalOpens',
            message: 'Terminal opens are local activity metadata and are not part of the website wire contract.',
        });
    }
    warnings.push(...['manualSeconds', 'aiAssistedSeconds', 'automationSeconds', 'unknownBulkEditSeconds'].map((field) => ({
        sessionId: record.id,
        field: `coding.${field}`,
        message: 'The website contract carries coding percentages; the local duration detail remains local-only.',
    })));
    if (record.scores.shippingActivity > 0) {
        warnings.push({
            sessionId: record.id,
            field: 'scores.shippingActivity',
            message: 'Shipping activity is not a standalone website score field and remains local-only.',
        });
    }
    const claudeTokens = totalClaudeTokens(record);
    const codexTokens = record.tokenStats.codex === 'unavailable' ? null : record.tokenStats.codex.total;
    const copilotTokens = record.tokenStats.githubCopilot
        ? record.tokenStats.githubCopilot.input + record.tokenStats.githubCopilot.output
        : null;
    for (const [field, value] of [
        ['ai.tokenTotals.claude', claudeTokens],
        ['ai.tokenTotals.codex', codexTokens],
        ['ai.tokenTotals.copilot', copilotTokens],
    ]) {
        if (value === null) {
            warnings.push({
                sessionId: record.id,
                field,
                message: 'Token usage was unavailable locally; the website numeric contract receives 0 without exposing prompt content.',
            });
        }
    }
    const terminalCategories = record.terminalCommandsByCategory;
    const categorizedCommands = terminalCategories.build
        + terminalCategories.test
        + terminalCategories.git
        + terminalCategories['package-manager']
        + terminalCategories['dev-server']
        + terminalCategories.lint
        + terminalCategories.other
        + formatterAndDeployment;
    const totalCommands = Math.max(record.terminalCommands, categorizedCommands);
    if (totalCommands !== record.terminalCommands) {
        warnings.push({
            sessionId: record.id,
            field: 'terminal.totalCommands',
            message: 'The local category total exceeded the recorded total; the wire total was raised to preserve category counts.',
        });
    }
    const scores = record.scores;
    const payload = {
        contract: exports.SPRINTLY_CONTRACT,
        schemaVersion: exports.SPRINTLY_SCHEMA_VERSION,
        sessionId: record.id,
        startedAt: new Date(record.startedAt).toISOString(),
        endedAt: new Date(record.endedAt).toISOString(),
        activeDurationSeconds: durationSeconds,
        coding: {
            manualPercent: codingPercent[0],
            aiAssistedPercent: codingPercent[1],
            automationPercent: codingPercent[2],
            unknownBulkEditPercent: codingPercent[3],
        },
        activity: {
            edits: nonNegativeInteger(record.edits),
            saves: nonNegativeInteger(record.fileSaves),
            filesTouched: nonNegativeInteger(record.filesTouched),
            linesChangedEstimate: nonNegativeInteger(record.linesChanged),
        },
        terminal: {
            totalCommands,
            build: nonNegativeInteger(terminalCategories.build),
            test: nonNegativeInteger(terminalCategories.test),
            git: nonNegativeInteger(terminalCategories.git),
            packageManager: nonNegativeInteger(terminalCategories['package-manager']),
            devServer: nonNegativeInteger(terminalCategories['dev-server']),
            lint: nonNegativeInteger(terminalCategories.lint),
            other: nonNegativeInteger(terminalCategories.other + formatterAndDeployment),
        },
        ai: {
            claudeCodePrompts: nonNegativeInteger(record.agentPrompts.claudeCode),
            codexPrompts: nonNegativeInteger(record.agentPrompts.codex),
            copilotPrompts: nonNegativeInteger(record.agentPrompts.githubCopilot),
            tokenTotals: {
                claude: claudeTokens ?? 0,
                codex: codexTokens ?? 0,
                copilot: copilotTokens ?? 0,
            },
        },
        reliability: {
            failures: nonNegativeInteger(record.buildFailures.total),
            recoveredFailures: nonNegativeInteger(record.buildFailures.recoveredFailures),
            recoveryRate: clampPercent(record.buildFailures.total === 0
                ? 100
                : (record.buildFailures.recoveredFailures / record.buildFailures.total) * 100),
        },
        scores: {
            // The server must validate/recalculate competitive scores. These values
            // are reported client aggregates, not trusted authorization data.
            focus: clampPercent(scores.focus),
            testingDiscipline: clampPercent(scores.testingDiscipline),
            recovery: clampPercent(scores.recovery),
            consistency: clampPercent(scores.consistency),
            aiBalance: clampPercent(scores.aiBalance),
            devScore: clampPercent(scores.devScore),
        },
        archetype: {
            primary: record.archetype || 'Steady Builder',
            traits: record.traits.filter((trait) => typeof trait === 'string').slice(0, 3),
        },
    };
    return { payload, warnings };
}
function createSprintlyExport(records, exportedAt = new Date()) {
    const mapped = records.map(mapSessionRecord);
    const payload = {
        contract: exports.SPRINTLY_CONTRACT,
        schemaVersion: exports.SPRINTLY_SCHEMA_VERSION,
        exportedAt: exportedAt.toISOString(),
        sessions: mapped.map((entry) => entry.payload),
    };
    const validation = validateSprintlyExport(payload);
    if (!validation.ok) {
        throw new Error(`Sprintly export rejected: ${validation.errors.join('; ')}`);
    }
    return {
        payload: validation.value,
        warnings: mapped.flatMap((entry) => entry.warnings),
    };
}
function serializeSprintlyExport(payload) {
    const validation = validateSprintlyExport(payload);
    if (!validation.ok) {
        throw new Error(`Sprintly export rejected: ${validation.errors.join('; ')}`);
    }
    return JSON.stringify(validation.value, null, 2);
}
function validateSprintlyExport(value) {
    if (!isRecord(value))
        return failure('export must be an object');
    const errors = unsupportedFields(value, new Set(['contract', 'schemaVersion', 'exportedAt', 'sessions']), 'export');
    if (value.contract !== exports.SPRINTLY_CONTRACT)
        errors.push('export.contract must be devstrava.session.v1');
    if (value.schemaVersion !== exports.SPRINTLY_SCHEMA_VERSION)
        errors.push('export.schemaVersion must be 1');
    if (!isIsoDate(value.exportedAt))
        errors.push('export.exportedAt must be an ISO date');
    if (!Array.isArray(value.sessions)) {
        errors.push('export.sessions must be an array');
    }
    else {
        value.sessions.forEach((session, index) => {
            const result = validateSprintlySession(session);
            if (!result.ok)
                errors.push(...result.errors.map((error) => `sessions[${index}].${error}`));
        });
    }
    if (errors.length)
        return { ok: false, errors };
    return { ok: true, value: value };
}
function validateSprintlySession(value) {
    if (!isRecord(value))
        return failure('session must be an object');
    const errors = unsupportedFields(value, SESSION_FIELDS, 'session');
    if (value.contract !== exports.SPRINTLY_CONTRACT)
        errors.push('contract must be devstrava.session.v1');
    if (value.schemaVersion !== exports.SPRINTLY_SCHEMA_VERSION)
        errors.push('schemaVersion must be 1');
    requireNonEmptyString(value.sessionId, 'sessionId', errors);
    if (!isIsoDate(value.startedAt))
        errors.push('startedAt must be an ISO date');
    if (!isIsoDate(value.endedAt))
        errors.push('endedAt must be an ISO date');
    const startedAt = typeof value.startedAt === 'string' ? Date.parse(value.startedAt) : NaN;
    const endedAt = typeof value.endedAt === 'string' ? Date.parse(value.endedAt) : NaN;
    if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt < startedAt) {
        errors.push('endedAt must not be before startedAt');
    }
    const activeDurationSeconds = requireNonNegativeInteger(value.activeDurationSeconds, 'activeDurationSeconds', errors);
    if (activeDurationSeconds < 1)
        errors.push('activeDurationSeconds must be at least 1');
    validateCoding(value.coding, errors);
    validateNumericFields(value.activity, ACTIVITY_FIELDS, 'activity', errors);
    validateTerminal(value.terminal, errors);
    validateAi(value.ai, errors);
    validateReliability(value.reliability, errors);
    validateScores(value.scores, errors);
    validateArchetype(value.archetype, errors);
    if (errors.length)
        return { ok: false, errors };
    return { ok: true, value: value };
}
function validateCoding(value, errors) {
    if (!isRecord(value)) {
        errors.push('coding must be an object');
        return;
    }
    errors.push(...unsupportedFields(value, CODING_FIELDS, 'coding'));
    validatePercentFields(value, CODING_FIELDS, 'coding', errors);
    const sum = [...CODING_FIELDS].reduce((total, key) => total + numberValue(value[key]), 0);
    if (sum !== 100)
        errors.push('coding percentages must sum to 100');
}
function validateTerminal(value, errors) {
    if (!isRecord(value)) {
        errors.push('terminal must be an object');
        return;
    }
    errors.push(...unsupportedFields(value, TERMINAL_FIELDS, 'terminal'));
    validateNonNegativeFields(value, TERMINAL_FIELDS, 'terminal', errors);
    const total = numberValue(value.totalCommands);
    const categories = ['build', 'test', 'git', 'packageManager', 'devServer', 'lint', 'other'];
    if (categories.every((key) => typeof value[key] === 'number')
        && categories.reduce((sum, key) => sum + numberValue(value[key]), 0) > total) {
        errors.push('terminal category counts must not exceed totalCommands');
    }
}
function validateAi(value, errors) {
    if (!isRecord(value)) {
        errors.push('ai must be an object');
        return;
    }
    errors.push(...unsupportedFields(value, AI_FIELDS, 'ai'));
    validateNonNegativeFields(value, new Set(['claudeCodePrompts', 'codexPrompts', 'copilotPrompts']), 'ai', errors);
    if (!isRecord(value.tokenTotals)) {
        errors.push('ai.tokenTotals must be an object');
        return;
    }
    errors.push(...unsupportedFields(value.tokenTotals, TOKEN_FIELDS, 'ai.tokenTotals'));
    validateNonNegativeFields(value.tokenTotals, TOKEN_FIELDS, 'ai.tokenTotals', errors);
}
function validateReliability(value, errors) {
    if (!isRecord(value)) {
        errors.push('reliability must be an object');
        return;
    }
    errors.push(...unsupportedFields(value, RELIABILITY_FIELDS, 'reliability'));
    validateNonNegativeFields(value, RELIABILITY_FIELDS, 'reliability', errors);
    if (numberValue(value.recoveredFailures) > numberValue(value.failures)) {
        errors.push('reliability.recoveredFailures must not exceed failures');
    }
    if (numberValue(value.recoveryRate) > 100)
        errors.push('reliability.recoveryRate must be at most 100');
}
function validateScores(value, errors) {
    if (!isRecord(value)) {
        errors.push('scores must be an object');
        return;
    }
    errors.push(...unsupportedFields(value, SCORE_FIELDS, 'scores'));
    validatePercentFields(value, SCORE_FIELDS, 'scores', errors);
}
function validateArchetype(value, errors) {
    if (!isRecord(value)) {
        errors.push('archetype must be an object');
        return;
    }
    errors.push(...unsupportedFields(value, ARCHETYPE_FIELDS, 'archetype'));
    requireNonEmptyString(value.primary, 'archetype.primary', errors);
    if (!Array.isArray(value.traits) || value.traits.some((trait) => typeof trait !== 'string')) {
        errors.push('archetype.traits must be an array of strings');
    }
}
function validateNumericFields(value, fields, label, errors) {
    if (!isRecord(value)) {
        errors.push(`${label} must be an object`);
        return;
    }
    errors.push(...unsupportedFields(value, fields, label));
    validateNonNegativeFields(value, fields, label, errors);
}
function validateNonNegativeFields(value, fields, label, errors) {
    for (const field of fields) {
        if (!Number.isFinite(value[field]) || value[field] < 0 || !Number.isInteger(value[field])) {
            errors.push(`${label}.${field} must be a non-negative integer`);
        }
    }
}
function validatePercentFields(value, fields, label, errors) {
    validateNonNegativeFields(value, fields, label, errors);
    for (const field of fields) {
        if (typeof value[field] === 'number' && value[field] > 100) {
            errors.push(`${label}.${field} must be at most 100`);
        }
    }
}
function unsupportedFields(value, supported, label) {
    return Object.keys(value)
        .filter((field) => !supported.has(field))
        .map((field) => `${label}.${field} is not supported by devstrava.session.v1`);
}
function percentageSplit(values) {
    const safeValues = values.map(nonNegativeNumber);
    const total = safeValues.reduce((sum, value) => sum + value, 0);
    if (total <= 0)
        return [0, 0, 0, 100];
    const raw = safeValues.map((value) => (value * 100) / total);
    const whole = raw.map(Math.floor);
    let remainder = 100 - whole.reduce((sum, value) => sum + value, 0);
    const order = raw.map((value, index) => ({ index, fraction: value - whole[index] }))
        .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
    for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
        whole[order[index].index] += 1;
    }
    return whole;
}
function totalClaudeTokens(record) {
    const tokens = record.tokenStats.claudeCode;
    return tokens ? tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreate : null;
}
function roundSeconds(value) {
    return Math.max(0, Math.round(nonNegativeNumber(value) / 1000));
}
function nonNegativeInteger(value) {
    return Math.max(0, Math.round(nonNegativeNumber(value)));
}
function nonNegativeNumber(value) {
    return Number.isFinite(value) && value >= 0 ? value : 0;
}
function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(nonNegativeNumber(value))));
}
function requireNonEmptyString(value, label, errors) {
    if (typeof value !== 'string' || value.length === 0)
        errors.push(`${label} must be a non-empty string`);
}
function requireNonNegativeInteger(value, label, errors) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        errors.push(`${label} must be a non-negative integer`);
        return 0;
    }
    return value;
}
function numberValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function isIsoDate(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function failure(message) {
    return { ok: false, errors: [message] };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=sprintlyContract.js.map