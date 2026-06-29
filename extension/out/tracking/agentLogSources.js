"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_LOG_SOURCES = exports.CODEX_SOURCE = exports.CLAUDE_CODE_SOURCE = void 0;
exports.parseJsonLine = parseJsonLine;
const os = require("os");
const path = require("path");
exports.CLAUDE_CODE_SOURCE = {
    id: 'claude-code',
    getLogDirs: () => [
        path.join(os.homedir(), '.claude', 'projects'),
        path.join(os.homedir(), '.config', 'claude', 'projects'),
    ],
    isPromptEntry: (line) => {
        if (line.type === 'summary' || line.type !== 'user') {
            return false;
        }
        const message = asRecord(line.message);
        return message?.role === 'user' && hasUserAuthoredText(message.content);
    },
    extractTimestamp: extractCommonTimestamp,
    extractUsage: (line) => {
        if (line.type !== 'assistant') {
            return null;
        }
        const message = asRecord(line.message);
        const usage = asRecord(message?.usage);
        if (!usage) {
            return null;
        }
        const input = readNonNegativeNumber(usage.input_tokens);
        const output = readNonNegativeNumber(usage.output_tokens);
        const cacheRead = readNonNegativeNumber(usage.cache_read_input_tokens);
        const cacheCreate = readNonNegativeNumber(usage.cache_creation_input_tokens);
        if (input === null && output === null && cacheRead === null && cacheCreate === null) {
            return null;
        }
        return {
            kind: 'claudeCode',
            input: input ?? 0,
            output: output ?? 0,
            cacheRead: cacheRead ?? 0,
            cacheCreate: cacheCreate ?? 0,
        };
    },
};
exports.CODEX_SOURCE = {
    id: 'codex',
    getLogDirs: () => [path.join(os.homedir(), '.codex', 'sessions')],
    isPromptEntry: isCodexPrompt,
    extractTimestamp: extractCommonTimestamp,
    extractUsage: extractCodexUsage,
};
exports.AGENT_LOG_SOURCES = [
    exports.CLAUDE_CODE_SOURCE,
    exports.CODEX_SOURCE,
];
function parseJsonLine(line) {
    try {
        const parsed = JSON.parse(line);
        return asRecord(parsed);
    }
    catch {
        return null;
    }
}
function isCodexPrompt(line) {
    if (line.role === 'user' && hasUserAuthoredText(readContent(line))) {
        return true;
    }
    const message = asRecord(line.message);
    if (message?.role === 'user' && hasUserAuthoredText(readContent(message))) {
        return true;
    }
    const type = typeof line.type === 'string' ? line.type.toLowerCase() : '';
    if (isUserMessageType(type) && hasUserAuthoredText(readContent(line))) {
        return true;
    }
    const payload = asRecord(line.payload);
    if (!payload) {
        return false;
    }
    const payloadType = typeof payload.type === 'string' ? payload.type.toLowerCase() : '';
    if (payload.role === 'user' && hasUserAuthoredText(readContent(payload))) {
        return true;
    }
    return isUserMessageType(payloadType) && hasUserAuthoredText(readContent(payload));
}
function isUserMessageType(type) {
    return type === 'user_message' || type === 'user-message' || type === 'input_message';
}
function extractCodexUsage(line) {
    const payload = asRecord(line.payload);
    const info = asRecord(payload?.info);
    const type = typeof line.type === 'string' ? line.type.toLowerCase() : '';
    const payloadType = typeof payload?.type === 'string' ? payload.type.toLowerCase() : '';
    const candidates = [
        line.usage,
        payload?.usage,
        line.token_count,
        payload?.token_count,
    ];
    if (type === 'token_count' || payloadType === 'token_count') {
        // Prefer per-turn usage when available; total_token_usage is cumulative in newer logs.
        candidates.unshift(info?.last_token_usage, info?.total_token_usage, payload, line);
    }
    for (const candidate of candidates) {
        const total = extractTokenTotal(candidate);
        if (total !== null) {
            return { kind: 'codex', total };
        }
    }
    return null;
}
function extractTokenTotal(value) {
    const usage = asRecord(value);
    if (!usage) {
        return null;
    }
    const direct = firstNumber(usage.total_tokens, usage.totalTokens, usage.total, usage.token_count);
    if (direct !== null) {
        return direct;
    }
    const input = firstNumber(usage.input_tokens, usage.inputTokens);
    const output = firstNumber(usage.output_tokens, usage.outputTokens);
    const reasoning = firstNumber(usage.reasoning_output_tokens, usage.reasoningOutputTokens);
    if (input === null && output === null && reasoning === null) {
        return null;
    }
    return (input ?? 0) + (output ?? 0) + (reasoning ?? 0);
}
function extractCommonTimestamp(line) {
    const payload = asRecord(line.payload);
    const message = asRecord(line.message);
    const raw = line.timestamp
        ?? line.created_at
        ?? line.createdAt
        ?? line.time
        ?? payload?.timestamp
        ?? message?.timestamp;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw < 1000000000000 ? raw * 1000 : raw;
    }
    if (typeof raw !== 'string') {
        return null;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
}
function readContent(value) {
    return value.content ?? value.text ?? value.message ?? value.input;
}
function hasUserAuthoredText(content) {
    if (typeof content === 'string') {
        return content.trim().length > 0;
    }
    if (!Array.isArray(content) || content.length === 0) {
        return false;
    }
    if (content.every((block) => asRecord(block)?.type === 'tool_result')) {
        return false;
    }
    return content.some((block) => {
        if (typeof block === 'string') {
            return block.trim().length > 0;
        }
        const record = asRecord(block);
        if (!record || record.type === 'tool_result') {
            return false;
        }
        const text = record.text ?? record.content ?? record.input_text;
        return typeof text === 'string' && text.trim().length > 0;
    });
}
function firstNumber(...values) {
    for (const value of values) {
        const number = readNonNegativeNumber(value);
        if (number !== null) {
            return number;
        }
    }
    return null;
}
function readNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : null;
}
//# sourceMappingURL=agentLogSources.js.map