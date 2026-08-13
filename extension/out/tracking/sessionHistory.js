"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionHistoryStore = void 0;
exports.buildSessionHistoryRecord = buildSessionHistoryRecord;
const vscode = require("vscode");
const HISTORY_KEY = 'sprintly.sessionHistory.v1';
const DEFAULT_RETENTION = 100;
class SessionHistoryStore {
    constructor(globalState, retention = readRetention()) {
        this.globalState = globalState;
        this.retention = retention;
        this.persistQueue = Promise.resolve();
        this.records = parseHistory(globalState.get(HISTORY_KEY));
    }
    list() {
        return this.records.map(cloneRecord);
    }
    append(record) {
        this.records = [record, ...this.records.filter((existing) => existing.id !== record.id)]
            .slice(0, this.retention);
        this.persist();
    }
    clear() {
        this.records = [];
        this.persist();
    }
    dispose() { }
    persist() {
        const snapshot = this.list();
        this.persistQueue = this.persistQueue
            .then(() => this.globalState.update(HISTORY_KEY, snapshot))
            .then(() => undefined, () => undefined);
    }
}
exports.SessionHistoryStore = SessionHistoryStore;
function buildSessionHistoryRecord(state, trackerStats, archetype, traits, metrics, endedAt) {
    const session = state.session;
    if (!session.id || session.startedAt === null) {
        return null;
    }
    return {
        version: 1,
        id: session.id,
        startedAt: session.startedAt,
        endedAt: Math.max(session.startedAt, endedAt),
        activeDurationMs: Math.max(0, trackerStats.durationSeconds * 1000),
        pauses: session.pauses.map((pause) => ({ ...pause })),
        coding: {
            manualMs: session.manualMs ?? session.hardcodeMs,
            aiAssistedMs: session.aiAssistedMs ?? session.vibecodeMs,
            automationMs: session.automationMs ?? 0,
            unknownBulkMs: session.unknownBulkMs ?? 0,
        },
        edits: trackerStats.fileEdits,
        linesChanged: trackerStats.linesChanged,
        fileSaves: trackerStats.fileSaves,
        fileSwitches: trackerStats.fileSwitches,
        filesTouched: trackerStats.activeFiles.size,
        terminalOpens: trackerStats.terminalOpens ?? 0,
        terminalCommands: trackerStats.terminalCommands ?? 0,
        terminalCommandsByCategory: {
            ...trackerStats.terminalCommandsByCategory,
        },
        agentPrompts: { ...state.agentPrompts },
        tokenStats: cloneTokenStats(state.tokenStats),
        buildFailures: {
            total: state.buildFailures.total,
            byCategory: { ...state.buildFailures.byCategory },
            successfulRuns: state.buildFailures.successfulRuns,
            recoveredFailures: state.buildFailures.recoveredFailures,
            failureStreak: state.buildFailures.failureStreak,
            maxFailureStreak: state.buildFailures.maxFailureStreak,
        },
        archetype,
        traits: [...traits],
        metrics: { ...metrics },
    };
}
function parseHistory(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((entry) => isRecord(entry) ? [parseRecord(entry)] : []);
}
function parseRecord(value) {
    const session = isRecord(value.coding) ? value.coding : {};
    const failures = isRecord(value.buildFailures) ? value.buildFailures : {};
    const metrics = isRecord(value.metrics) ? value.metrics : {};
    return {
        version: 1,
        id: stringValue(value.id, `session-${Date.now()}`),
        startedAt: numberValue(value.startedAt),
        endedAt: numberValue(value.endedAt),
        activeDurationMs: numberValue(value.activeDurationMs),
        pauses: parsePauses(value.pauses),
        coding: {
            manualMs: numberValue(session.manualMs),
            aiAssistedMs: numberValue(session.aiAssistedMs),
            automationMs: numberValue(session.automationMs),
            unknownBulkMs: numberValue(session.unknownBulkMs),
        },
        edits: numberValue(value.edits),
        linesChanged: numberValue(value.linesChanged),
        fileSaves: numberValue(value.fileSaves),
        fileSwitches: numberValue(value.fileSwitches),
        filesTouched: numberValue(value.filesTouched),
        terminalOpens: numberValue(value.terminalOpens),
        terminalCommands: numberValue(value.terminalCommands),
        terminalCommandsByCategory: parseTerminalCounts(value.terminalCommandsByCategory),
        agentPrompts: parsePromptStats(value.agentPrompts),
        tokenStats: parseTokenStats(value.tokenStats),
        buildFailures: {
            total: numberValue(failures.total),
            byCategory: parseNumberRecord(failures.byCategory),
            successfulRuns: numberValue(failures.successfulRuns),
            recoveredFailures: numberValue(failures.recoveredFailures),
            failureStreak: numberValue(failures.failureStreak),
            maxFailureStreak: numberValue(failures.maxFailureStreak),
        },
        archetype: stringValue(value.archetype, 'Steady Builder'),
        traits: Array.isArray(value.traits) ? value.traits.filter((item) => typeof item === 'string') : [],
        metrics: {
            focusScore: numberValue(metrics.focusScore),
            contextSwitches: numberValue(metrics.contextSwitches),
            shippingActivity: numberValue(metrics.shippingActivity),
            testingDiscipline: numberValue(metrics.testingDiscipline),
            aiBalance: numberValue(metrics.aiBalance),
            recoveryRate: numberValue(metrics.recoveryRate),
            cleanRun: metrics.cleanRun === true,
        },
    };
}
function cloneRecord(record) {
    return {
        ...record,
        pauses: record.pauses.map((pause) => ({ ...pause })),
        coding: { ...record.coding },
        terminalCommandsByCategory: { ...record.terminalCommandsByCategory },
        agentPrompts: { ...record.agentPrompts },
        tokenStats: cloneTokenStats(record.tokenStats),
        buildFailures: {
            ...record.buildFailures,
            byCategory: { ...record.buildFailures.byCategory },
        },
        traits: [...record.traits],
        metrics: { ...record.metrics },
    };
}
function cloneTokenStats(stats) {
    return {
        claudeCode: stats.claudeCode ? { ...stats.claudeCode } : null,
        codex: stats.codex === 'unavailable' ? 'unavailable' : { ...stats.codex },
        githubCopilot: stats.githubCopilot ? { ...stats.githubCopilot } : null,
    };
}
function parsePromptStats(value) {
    const record = isRecord(value) ? value : {};
    return {
        claudeCode: numberValue(record.claudeCode),
        codex: numberValue(record.codex),
        githubCopilot: numberValue(record.githubCopilot),
    };
}
function parseTokenStats(value) {
    const record = isRecord(value) ? value : {};
    const claude = isRecord(record.claudeCode) ? record.claudeCode : null;
    const codex = isRecord(record.codex) ? { total: numberValue(record.codex.total) } : 'unavailable';
    const copilot = isRecord(record.githubCopilot) ? {
        input: numberValue(record.githubCopilot.input),
        output: numberValue(record.githubCopilot.output),
        credits: numberValue(record.githubCopilot.credits),
    } : null;
    return {
        claudeCode: claude ? {
            input: numberValue(claude.input),
            output: numberValue(claude.output),
            cacheRead: numberValue(claude.cacheRead),
            cacheCreate: numberValue(claude.cacheCreate),
        } : null,
        codex,
        githubCopilot: copilot,
    };
}
function parseTerminalCounts(value) {
    const record = isRecord(value) ? value : {};
    return {
        build: numberValue(record.build),
        test: numberValue(record.test),
        'package-manager': numberValue(record['package-manager']),
        git: numberValue(record.git),
        'dev-server': numberValue(record['dev-server']),
        lint: numberValue(record.lint),
        formatter: numberValue(record.formatter),
        deployment: numberValue(record.deployment),
        other: numberValue(record.other),
    };
}
function parsePauses(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((entry) => {
        if (!isRecord(entry))
            return [];
        return [{ startedAt: numberValue(entry.startedAt), endedAt: entry.endedAt === null ? null : numberValue(entry.endedAt) }];
    });
}
function parseNumberRecord(value) {
    if (!isRecord(value))
        return {};
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numberValue(item)]));
}
function readRetention() {
    const value = vscode.workspace?.getConfiguration?.('sprintly').get('historyRetention', DEFAULT_RETENTION);
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULT_RETENTION;
}
function numberValue(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
function stringValue(value, fallback) {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=sessionHistory.js.map