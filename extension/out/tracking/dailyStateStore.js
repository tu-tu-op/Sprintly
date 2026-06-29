"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyStateStore = void 0;
exports.localDayBounds = localDayBounds;
const vscode = require("vscode");
const DAILY_STATE_KEY = 'sprintly.dailyTracking.v2';
class DailyStateStore {
    constructor(globalState) {
        this.globalState = globalState;
        this.persistQueue = Promise.resolve();
        this.updateEmitter = new vscode.EventEmitter();
        this.onDidUpdate = this.updateEmitter.event;
        this.state = parseStoredState(globalState.get(DAILY_STATE_KEY));
        if (this.state.dateKey !== localDateKey()) {
            this.state = createEmptyState();
            this.persist();
        }
        this.scheduleMidnightReset();
    }
    get() {
        this.ensureCurrentDay();
        return cloneState(this.state);
    }
    getAgentFileOffset(filePath) {
        this.ensureCurrentDay();
        return this.state.agentFileCursors[filePath]?.offset ?? 0;
    }
    addSessionDuration(category, durationMs) {
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            return;
        }
        this.mutate((state) => {
            if (category === 'hardcode') {
                state.session.hardcodeMs += durationMs;
            }
            else {
                state.session.vibecodeMs += durationMs;
            }
        });
    }
    addBuildFailure(category) {
        this.mutate((state) => {
            state.buildFailures.total += 1;
            state.buildFailures.byCategory[category] =
                (state.buildFailures.byCategory[category] ?? 0) + 1;
        });
    }
    applyAgentLogBatch(batch) {
        this.mutate((state) => {
            state.agentFileCursors[batch.filePath] = { offset: Math.max(0, batch.nextOffset) };
            if (batch.sourceId === 'claude-code') {
                state.agentPrompts.claudeCode += batch.promptCount;
                if (batch.claudeUsage) {
                    const current = state.tokenStats.claudeCode ?? emptyClaudeTokens();
                    state.tokenStats.claudeCode = {
                        input: current.input + batch.claudeUsage.input,
                        output: current.output + batch.claudeUsage.output,
                        cacheRead: current.cacheRead + batch.claudeUsage.cacheRead,
                        cacheCreate: current.cacheCreate + batch.claudeUsage.cacheCreate,
                    };
                }
            }
            else if (batch.sourceId === 'codex') {
                state.agentPrompts.codex += batch.promptCount;
                if (batch.codexUsageAvailable) {
                    const current = state.tokenStats.codex === 'unavailable'
                        ? 0
                        : state.tokenStats.codex.total;
                    state.tokenStats.codex = { total: current + (batch.codexTokens ?? 0) };
                }
            }
        });
    }
    dispose() {
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
        }
        this.updateEmitter.dispose();
    }
    mutate(change) {
        this.ensureCurrentDay();
        change(this.state);
        this.persist();
        this.updateEmitter.fire(this.get());
    }
    ensureCurrentDay() {
        if (this.state.dateKey === localDateKey()) {
            return;
        }
        this.state = createEmptyState();
        this.persist();
        this.updateEmitter.fire(cloneState(this.state));
        this.scheduleMidnightReset();
    }
    scheduleMidnightReset() {
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
        }
        const now = new Date();
        const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 25);
        this.midnightTimer = setTimeout(() => {
            this.ensureCurrentDay();
        }, Math.max(1, nextMidnight.getTime() - now.getTime()));
    }
    persist() {
        const snapshot = cloneState(this.state);
        this.persistQueue = this.persistQueue
            .then(() => this.globalState.update(DAILY_STATE_KEY, snapshot))
            .then(() => undefined, () => undefined);
    }
}
exports.DailyStateStore = DailyStateStore;
function localDayBounds(now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    return { start, end };
}
function localDateKey(now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function createEmptyState() {
    return {
        dateKey: localDateKey(),
        session: { hardcodeMs: 0, vibecodeMs: 0 },
        agentPrompts: { claudeCode: 0, codex: 0 },
        buildFailures: { total: 0, byCategory: {} },
        tokenStats: { claudeCode: null, codex: 'unavailable' },
        agentFileCursors: {},
    };
}
function emptyClaudeTokens() {
    return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}
function parseStoredState(value) {
    if (!isRecord(value) || typeof value.dateKey !== 'string') {
        return createEmptyState();
    }
    const session = isRecord(value.session) ? value.session : {};
    const prompts = isRecord(value.agentPrompts) ? value.agentPrompts : {};
    const failures = isRecord(value.buildFailures) ? value.buildFailures : {};
    const tokenStats = isRecord(value.tokenStats) ? value.tokenStats : {};
    return {
        dateKey: value.dateKey,
        session: {
            hardcodeMs: safeNumber(session.hardcodeMs),
            vibecodeMs: safeNumber(session.vibecodeMs),
        },
        agentPrompts: {
            claudeCode: safeNumber(prompts.claudeCode),
            codex: safeNumber(prompts.codex),
        },
        buildFailures: {
            total: safeNumber(failures.total),
            byCategory: parseNumberRecord(failures.byCategory),
        },
        tokenStats: {
            claudeCode: parseClaudeTokens(tokenStats.claudeCode),
            codex: parseCodexTokens(tokenStats.codex),
        },
        agentFileCursors: parseCursors(value.agentFileCursors),
    };
}
function parseClaudeTokens(value) {
    if (!isRecord(value)) {
        return null;
    }
    return {
        input: safeNumber(value.input),
        output: safeNumber(value.output),
        cacheRead: safeNumber(value.cacheRead),
        cacheCreate: safeNumber(value.cacheCreate),
    };
}
function parseCodexTokens(value) {
    return isRecord(value) && typeof value.total === 'number'
        ? { total: safeNumber(value.total) }
        : 'unavailable';
}
function parseCursors(value) {
    if (!isRecord(value)) {
        return {};
    }
    const cursors = {};
    for (const [filePath, cursor] of Object.entries(value)) {
        if (isRecord(cursor) && typeof cursor.offset === 'number') {
            cursors[filePath] = { offset: safeNumber(cursor.offset) };
        }
    }
    return cursors;
}
function parseNumberRecord(value) {
    if (!isRecord(value)) {
        return {};
    }
    const result = {};
    for (const [key, count] of Object.entries(value)) {
        if (typeof count === 'number') {
            result[key] = safeNumber(count);
        }
    }
    return result;
}
function cloneState(state) {
    return {
        dateKey: state.dateKey,
        session: { ...state.session },
        agentPrompts: { ...state.agentPrompts },
        buildFailures: {
            total: state.buildFailures.total,
            byCategory: { ...state.buildFailures.byCategory },
        },
        tokenStats: {
            claudeCode: state.tokenStats.claudeCode
                ? { ...state.tokenStats.claudeCode }
                : null,
            codex: state.tokenStats.codex === 'unavailable'
                ? 'unavailable'
                : { ...state.tokenStats.codex },
        },
        agentFileCursors: Object.fromEntries(Object.entries(state.agentFileCursors).map(([filePath, cursor]) => [
            filePath,
            { ...cursor },
        ])),
    };
}
function safeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=dailyStateStore.js.map