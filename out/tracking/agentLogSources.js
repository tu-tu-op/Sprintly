"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_LOG_SOURCES = exports.GITHUB_COPILOT_SOURCE = exports.CODEX_SOURCE = exports.CLAUDE_CODE_SOURCE = void 0;
exports.parseJsonLine = parseJsonLine;
const fs = require("fs");
const os = require("os");
const path = require("path");
exports.CLAUDE_CODE_SOURCE = {
    id: 'claude-code',
    getLogDirs: () => [
        path.join(os.homedir(), '.claude', 'projects'),
        path.join(os.homedir(), '.config', 'claude', 'projects'),
    ],
    extractWorkspacePath: extractCommonWorkspacePath,
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
    extractWorkspacePath: extractCommonWorkspacePath,
    isPromptEntry: isCodexPrompt,
    extractTimestamp: extractCommonTimestamp,
    extractUsage: extractCodexUsage,
};
exports.GITHUB_COPILOT_SOURCE = {
    id: 'github-copilot',
    getLogDirs: getCopilotChatLogDirs,
    logsAreWorkspaceScoped: true,
    extractWorkspacePath: () => null,
    isPromptEntry: (line) => line.__sprintlyCopilotPrompt === true,
    extractTimestamp: extractCommonTimestamp,
    extractUsage: (line) => {
        const input = readNonNegativeNumber(line.__sprintlyCopilotInput) ?? 0;
        const output = readNonNegativeNumber(line.__sprintlyCopilotOutput) ?? 0;
        const credits = readNonNegativeNumber(line.__sprintlyCopilotCredits) ?? 0;
        return input === 0 && output === 0 && credits === 0
            ? null
            : { kind: 'githubCopilot', input, output, credits };
    },
    expandEntries: expandCopilotEntries,
};
exports.AGENT_LOG_SOURCES = [
    exports.CLAUDE_CODE_SOURCE,
    exports.CODEX_SOURCE,
    exports.GITHUB_COPILOT_SOURCE,
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
function extractCommonWorkspacePath(line) {
    const payload = asRecord(line.payload);
    const message = asRecord(line.message);
    const raw = line.cwd
        ?? line.project_path
        ?? line.projectPath
        ?? line.workspace_path
        ?? line.workspacePath
        ?? payload?.cwd
        ?? payload?.project_path
        ?? payload?.projectPath
        ?? message?.cwd;
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}
function getCopilotChatLogDirs(workspacePaths = []) {
    if (workspacePaths.length === 0) {
        return [];
    }
    const storageRoots = getVsCodeConfigRoots()
        .map((configRoot) => path.join(configRoot, 'User', 'workspaceStorage'))
        .filter((candidate) => fs.existsSync(candidate));
    const directories = [];
    for (const storageRoot of storageRoots) {
        let entries;
        try {
            entries = fs.readdirSync(storageRoot, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const storageDirectory = path.join(storageRoot, entry.name);
            const storedWorkspace = readStoredWorkspacePath(path.join(storageDirectory, 'workspace.json'));
            if (!storedWorkspace || !workspacePaths.some((workspace) => pathsEqual(storedWorkspace, workspace))) {
                continue;
            }
            const chatSessions = path.join(storageDirectory, 'chatSessions');
            if (fs.existsSync(chatSessions)) {
                directories.push(chatSessions);
            }
        }
    }
    return directories;
}
function getVsCodeConfigRoots() {
    const products = ['Code', 'Code - Insiders', 'VSCodium'];
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA;
        return appData
            ? products.map((product) => path.join(appData, product))
            : [];
    }
    if (process.platform === 'darwin') {
        const applicationSupport = path.join(os.homedir(), 'Library', 'Application Support');
        return products.map((product) => path.join(applicationSupport, product));
    }
    const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
    return products.map((product) => path.join(configHome, product));
}
function readStoredWorkspacePath(workspaceFile) {
    try {
        const parsed = asRecord(JSON.parse(fs.readFileSync(workspaceFile, 'utf8')));
        const uri = typeof parsed?.folder === 'string'
            ? parsed.folder
            : typeof parsed?.workspace === 'string'
                ? parsed.workspace
                : null;
        return uri ? fileUriToPath(uri) : null;
    }
    catch {
        return null;
    }
}
function fileUriToPath(uri) {
    if (!uri.toLowerCase().startsWith('file://')) {
        return null;
    }
    try {
        const parsed = new URL(uri);
        let pathname = decodeURIComponent(parsed.pathname);
        if (/^\/[a-zA-Z]:\//.test(pathname)) {
            pathname = pathname.slice(1);
        }
        return pathname.replace(/\//g, path.sep);
    }
    catch {
        return null;
    }
}
function pathsEqual(left, right) {
    return normalizeComparablePath(left) === normalizeComparablePath(right);
}
function normalizeComparablePath(value) {
    const normalized = path.resolve(value).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
function expandCopilotEntries(line, context) {
    const timestamps = context.copilotRequestTimestamps ?? [];
    context.copilotRequestTimestamps = timestamps;
    const kind = readNonNegativeNumber(line.kind);
    const keyPath = Array.isArray(line.k) ? line.k : [];
    if (kind === 0) {
        const snapshot = asRecord(line.v);
        const requests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
        timestamps.length = 0;
        return requests.flatMap((request) => appendCopilotRequest(request, timestamps));
    }
    if (kind === 2 && keyPath.length === 1 && keyPath[0] === 'requests' && Array.isArray(line.v)) {
        return line.v.flatMap((request) => appendCopilotRequest(request, timestamps));
    }
    if (kind === 1 && keyPath.length === 3 && keyPath[0] === 'requests') {
        const requestIndex = typeof keyPath[1] === 'number' ? keyPath[1] : Number(keyPath[1]);
        const metric = keyPath[2];
        const timestamp = Number.isInteger(requestIndex) ? timestamps[requestIndex] : null;
        if (timestamp === null || timestamp === undefined || typeof metric !== 'string') {
            return [];
        }
        const synthetic = { timestamp };
        if (metric === 'promptTokens') {
            synthetic.__sprintlyCopilotInput = readNonNegativeNumber(line.v) ?? 0;
        }
        else if (metric === 'completionTokens') {
            synthetic.__sprintlyCopilotOutput = readNonNegativeNumber(line.v) ?? 0;
        }
        else if (metric === 'copilotCredits') {
            synthetic.__sprintlyCopilotCredits = readNonNegativeNumber(line.v) ?? 0;
        }
        else {
            return [];
        }
        return [synthetic];
    }
    return [];
}
function appendCopilotRequest(value, timestamps) {
    const request = asRecord(value);
    if (!request) {
        timestamps.push(null);
        return [];
    }
    const timestamp = extractCommonTimestamp(request);
    timestamps.push(timestamp);
    return [{
            ...request,
            __sprintlyCopilotPrompt: isCopilotPrompt(request),
            __sprintlyCopilotInput: readNonNegativeNumber(request.promptTokens) ?? 0,
            __sprintlyCopilotOutput: readNonNegativeNumber(request.completionTokens) ?? 0,
            __sprintlyCopilotCredits: readNonNegativeNumber(request.copilotCredits) ?? 0,
        }];
}
function isCopilotPrompt(request) {
    const message = asRecord(request.message);
    if (typeof message?.text !== 'string' || message.text.trim().length === 0) {
        return false;
    }
    const agent = asRecord(request.agent);
    const extensionId = asRecord(agent?.extensionId);
    const extensionValue = String(extensionId?.value ?? extensionId?._lower ?? '').toLowerCase();
    const modelId = String(request.modelId ?? '').toLowerCase();
    return extensionValue === 'github.copilot-chat' || modelId.startsWith('copilot/');
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