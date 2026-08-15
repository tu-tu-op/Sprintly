"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyStateStore = void 0;
exports.localDayBounds = localDayBounds;
const vscode = require("vscode");
const SESSION_STATE_KEY = 'sprintly.sessionTracking.v3';
const LEGACY_DAILY_STATE_KEY = 'sprintly.dailyTracking.v2';
class DailyStateStore {
    constructor(globalState, now = Date.now) {
        this.globalState = globalState;
        this.now = now;
        this.persistQueue = Promise.resolve();
        this.updateEmitter = new vscode.EventEmitter();
        this.onDidUpdate = this.updateEmitter.event;
        const stored = globalState.get(SESSION_STATE_KEY)
            ?? globalState.get(LEGACY_DAILY_STATE_KEY);
        this.state = parseStoredState(stored);
        this.interruptedSessionId = this.state.session.isActive ? this.state.session.id : null;
        // Extension shutdown is not guaranteed to run. Never carry an active capture
        // window into a later VS Code process, because that would merge two sessions.
        if (this.state.session.isActive) {
            closeSession(this.state.session, this.now());
            this.persist();
        }
    }
    get() {
        return cloneState(this.state);
    }
    getInterruptedSessionId() {
        return this.interruptedSessionId;
    }
    getAgentFileOffset(filePath) {
        return this.state.agentFileCursors[filePath]?.offset ?? 0;
    }
    startSession(startedAt = this.now(), id = createSessionId(startedAt)) {
        const timestamp = safeTimestamp(startedAt, this.now());
        const cursors = cloneCursors(this.state.agentFileCursors);
        this.state = createEmptyState(cursors);
        this.state.session = {
            ...emptySession(),
            id,
            startedAt: timestamp,
            isActive: true,
        };
        this.persistAndEmit();
        return id;
    }
    pauseSession(pausedAt = this.now()) {
        const session = this.state.session;
        if (!session.isActive || session.isPaused || session.startedAt === null) {
            return;
        }
        const timestamp = Math.max(session.startedAt, safeTimestamp(pausedAt, this.now()));
        session.isPaused = true;
        session.pausedAt = timestamp;
        session.pauses.push({ startedAt: timestamp, endedAt: null });
        this.persistAndEmit();
    }
    resumeSession(resumedAt = this.now()) {
        const session = this.state.session;
        if (!session.isActive || !session.isPaused) {
            return;
        }
        closePause(session, safeTimestamp(resumedAt, this.now()));
        this.persistAndEmit();
    }
    stopSession(endedAt = this.now()) {
        if (!this.state.session.isActive) {
            return;
        }
        closeSession(this.state.session, safeTimestamp(endedAt, this.now()));
        this.persistAndEmit();
    }
    resetSession() {
        this.state = createEmptyState(cloneCursors(this.state.agentFileCursors));
        this.persistAndEmit();
    }
    isCapturing(timestamp = this.now()) {
        return sessionContainsTimestamp(this.state.session, timestamp);
    }
    getSessionIdForTimestamp(timestamp) {
        return this.isCapturing(timestamp) ? this.state.session.id : null;
    }
    addSessionDuration(category, durationMs, observedAt = this.now()) {
        if (!Number.isFinite(durationMs)
            || durationMs <= 0
            || !this.isCapturing(observedAt)) {
            return;
        }
        this.mutate((state) => {
            if (category === 'hardcode') {
                state.session.hardcodeMs += durationMs;
                state.session.manualMs += durationMs;
            }
            else if (category === 'vibecode') {
                state.session.vibecodeMs += durationMs;
                state.session.aiAssistedMs += durationMs;
            }
            else if (category === 'manual') {
                state.session.hardcodeMs += durationMs;
                state.session.manualMs += durationMs;
            }
            else if (category === 'ai-assisted') {
                state.session.vibecodeMs += durationMs;
                state.session.aiAssistedMs += durationMs;
            }
            else if (category === 'automation') {
                state.session.automationMs += durationMs;
            }
            else {
                state.session.unknownBulkMs += durationMs;
            }
        });
    }
    addBuildFailure(category, occurredAt = this.now()) {
        if (!this.isCapturing(occurredAt)) {
            return;
        }
        this.mutate((state) => {
            state.buildFailures.total += 1;
            state.buildFailures.byCategory[category] =
                (state.buildFailures.byCategory[category] ?? 0) + 1;
            state.buildFailures.failureStreak += 1;
            state.buildFailures.maxFailureStreak = Math.max(state.buildFailures.maxFailureStreak, state.buildFailures.failureStreak);
        });
    }
    addSuccessfulRun(occurredAt = this.now()) {
        if (!this.isCapturing(occurredAt)) {
            return;
        }
        this.mutate((state) => {
            state.buildFailures.successfulRuns += 1;
            if (state.buildFailures.failureStreak > 0) {
                state.buildFailures.recoveredFailures += 1;
                state.buildFailures.failureStreak = 0;
            }
        });
    }
    applyAgentLogBatch(batch) {
        this.mutate((state) => {
            state.agentFileCursors[batch.filePath] = { offset: Math.max(0, batch.nextOffset) };
            const belongsToSession = batch.sessionId
                ? batch.sessionId === state.session.id
                : sessionContainsTimestamp(state.session, this.now());
            if (!belongsToSession) {
                return;
            }
            if (batch.detected
                && isAgentId(batch.sourceId)
                && !state.detectedAgents.includes(batch.sourceId)) {
                state.detectedAgents.push(batch.sourceId);
            }
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
            else if (batch.sourceId === 'github-copilot') {
                state.agentPrompts.githubCopilot += batch.promptCount;
                if (batch.copilotUsage) {
                    const current = state.tokenStats.githubCopilot ?? emptyCopilotTokens();
                    state.tokenStats.githubCopilot = {
                        input: current.input + batch.copilotUsage.input,
                        output: current.output + batch.copilotUsage.output,
                        credits: current.credits + batch.copilotUsage.credits,
                    };
                }
            }
        });
    }
    dispose() {
        this.updateEmitter.dispose();
    }
    mutate(change) {
        change(this.state);
        this.persistAndEmit();
    }
    persistAndEmit() {
        this.persist();
        this.updateEmitter.fire(this.get());
    }
    persist() {
        const snapshot = cloneState(this.state);
        this.persistQueue = this.persistQueue
            .then(() => this.globalState.update(SESSION_STATE_KEY, snapshot))
            .then(() => undefined, () => undefined);
    }
}
exports.DailyStateStore = DailyStateStore;
// Retained for downstream callers until the log watcher is session-window aware.
function localDayBounds(now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    return { start, end };
}
function createEmptyState(agentFileCursors = {}) {
    return {
        version: 3,
        detectedAgents: [],
        session: emptySession(),
        agentPrompts: { claudeCode: 0, codex: 0, githubCopilot: 0 },
        buildFailures: {
            total: 0,
            byCategory: {},
            successfulRuns: 0,
            recoveredFailures: 0,
            failureStreak: 0,
            maxFailureStreak: 0,
        },
        tokenStats: { claudeCode: null, codex: 'unavailable', githubCopilot: null },
        agentFileCursors,
    };
}
function emptySession() {
    return {
        id: null,
        startedAt: null,
        endedAt: null,
        isActive: false,
        isPaused: false,
        pausedAt: null,
        pauses: [],
        hardcodeMs: 0,
        vibecodeMs: 0,
        manualMs: 0,
        aiAssistedMs: 0,
        automationMs: 0,
        unknownBulkMs: 0,
    };
}
function emptyClaudeTokens() {
    return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}
function emptyCopilotTokens() {
    return { input: 0, output: 0, credits: 0 };
}
function parseStoredState(value) {
    if (!isRecord(value)) {
        return createEmptyState();
    }
    const cursors = parseCursors(value.agentFileCursors);
    if (value.version !== 3 || !isRecord(value.session)) {
        // Daily v2 totals cannot be assigned to a specific recording. Preserve only
        // file cursors so migration does not replay historical agent logs.
        return createEmptyState(cursors);
    }
    const session = value.session;
    const prompts = isRecord(value.agentPrompts) ? value.agentPrompts : {};
    const failures = isRecord(value.buildFailures) ? value.buildFailures : {};
    const tokenStats = isRecord(value.tokenStats) ? value.tokenStats : {};
    return {
        version: 3,
        detectedAgents: parseDetectedAgents(value.detectedAgents),
        session: {
            id: typeof session.id === 'string' ? session.id : null,
            startedAt: nullableTimestamp(session.startedAt),
            endedAt: nullableTimestamp(session.endedAt),
            isActive: session.isActive === true,
            isPaused: session.isPaused === true,
            pausedAt: nullableTimestamp(session.pausedAt),
            pauses: parsePauses(session.pauses),
            hardcodeMs: safeNumber(session.hardcodeMs) || safeNumber(session.manualMs),
            vibecodeMs: safeNumber(session.vibecodeMs) || safeNumber(session.aiAssistedMs),
            manualMs: safeNumber(session.manualMs) || safeNumber(session.hardcodeMs),
            aiAssistedMs: safeNumber(session.aiAssistedMs) || safeNumber(session.vibecodeMs),
            automationMs: safeNumber(session.automationMs),
            unknownBulkMs: safeNumber(session.unknownBulkMs),
        },
        agentPrompts: {
            claudeCode: safeNumber(prompts.claudeCode),
            codex: safeNumber(prompts.codex),
            githubCopilot: safeNumber(prompts.githubCopilot),
        },
        buildFailures: {
            total: safeNumber(failures.total),
            byCategory: parseNumberRecord(failures.byCategory),
            successfulRuns: safeNumber(failures.successfulRuns),
            recoveredFailures: safeNumber(failures.recoveredFailures),
            failureStreak: safeNumber(failures.failureStreak),
            maxFailureStreak: safeNumber(failures.maxFailureStreak),
        },
        tokenStats: {
            claudeCode: parseClaudeTokens(tokenStats.claudeCode),
            codex: parseCodexTokens(tokenStats.codex),
            githubCopilot: parseCopilotTokens(tokenStats.githubCopilot),
        },
        agentFileCursors: cursors,
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
function parseCopilotTokens(value) {
    if (!isRecord(value)) {
        return null;
    }
    return {
        input: safeNumber(value.input),
        output: safeNumber(value.output),
        credits: safeNumber(value.credits),
    };
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
function cloneCursors(cursors) {
    return Object.fromEntries(Object.entries(cursors).map(([filePath, cursor]) => [filePath, { ...cursor }]));
}
function parsePauses(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((pause) => {
        if (!isRecord(pause)) {
            return [];
        }
        const startedAt = nullableTimestamp(pause.startedAt);
        if (startedAt === null) {
            return [];
        }
        return [{ startedAt, endedAt: nullableTimestamp(pause.endedAt) }];
    });
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
        version: 3,
        detectedAgents: [...state.detectedAgents],
        session: {
            ...state.session,
            manualMs: state.session.manualMs,
            aiAssistedMs: state.session.aiAssistedMs,
            automationMs: state.session.automationMs,
            unknownBulkMs: state.session.unknownBulkMs,
            pauses: state.session.pauses.map((pause) => ({ ...pause })),
        },
        agentPrompts: { ...state.agentPrompts },
        buildFailures: {
            total: state.buildFailures.total,
            byCategory: { ...state.buildFailures.byCategory },
            successfulRuns: state.buildFailures.successfulRuns,
            recoveredFailures: state.buildFailures.recoveredFailures,
            failureStreak: state.buildFailures.failureStreak,
            maxFailureStreak: state.buildFailures.maxFailureStreak,
        },
        tokenStats: {
            claudeCode: state.tokenStats.claudeCode
                ? { ...state.tokenStats.claudeCode }
                : null,
            codex: state.tokenStats.codex === 'unavailable'
                ? 'unavailable'
                : { ...state.tokenStats.codex },
            githubCopilot: state.tokenStats.githubCopilot
                ? { ...state.tokenStats.githubCopilot }
                : null,
        },
        agentFileCursors: cloneCursors(state.agentFileCursors),
    };
}
function closePause(session, endedAt) {
    const pause = session.pauses[session.pauses.length - 1];
    if (pause && pause.endedAt === null) {
        pause.endedAt = Math.max(pause.startedAt, endedAt);
    }
    session.isPaused = false;
    session.pausedAt = null;
}
function closeSession(session, endedAt) {
    if (session.isPaused) {
        closePause(session, endedAt);
    }
    session.isActive = false;
    session.isPaused = false;
    session.endedAt = session.startedAt === null
        ? endedAt
        : Math.max(session.startedAt, endedAt);
}
function sessionContainsTimestamp(session, timestamp) {
    if (!Number.isFinite(timestamp)
        || session.id === null
        || session.startedAt === null
        || timestamp < session.startedAt
        || (session.endedAt !== null && timestamp > session.endedAt)) {
        return false;
    }
    return !session.pauses.some((pause) => timestamp >= pause.startedAt
        && (pause.endedAt === null || timestamp < pause.endedAt));
}
function createSessionId(startedAt) {
    return `${Math.round(startedAt).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function safeTimestamp(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : fallback;
}
function nullableTimestamp(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null;
}
function safeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseDetectedAgents(value) {
    return Array.isArray(value)
        ? value.filter((agent) => isAgentId(agent))
        : [];
}
function isAgentId(value) {
    return value === 'claude-code' || value === 'codex' || value === 'github-copilot';
}
//# sourceMappingURL=dailyStateStore.js.map