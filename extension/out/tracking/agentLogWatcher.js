"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLogWatcher = void 0;
exports.isPathInWorkspace = isPathInWorkspace;
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const agentLogSources_1 = require("./agentLogSources");
const privacySettings_1 = require("./privacySettings");
const POLL_INTERVAL_MS = 5000;
class AgentLogWatcher {
    constructor(store, sources = agentLogSources_1.AGENT_LOG_SOURCES, workspacePaths = getOpenWorkspacePaths()) {
        this.store = store;
        this.sources = sources;
        this.watchers = [];
        this.watchedDirectories = [];
        this.watchedDirectoryKeys = new Set();
        this.fileWorkspaces = new Map();
        this.fileParseContexts = new Map();
        this.scanRequested = false;
        this.disposed = false;
        this.workspacePaths = workspacePaths.map(normalizeFsPath);
    }
    start() {
        this.startPromise ?? (this.startPromise = this.initialize());
        return this.startPromise;
    }
    async scanNow() {
        await this.start();
        await this.requestScan();
    }
    async initialize() {
        await this.discoverDirectories();
        await this.requestScan();
        this.pollTimer = setInterval(() => {
            void this.requestScan();
        }, POLL_INTERVAL_MS);
    }
    dispose() {
        this.disposed = true;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        for (const watcher of this.watchers) {
            watcher.close();
        }
    }
    async discoverDirectories() {
        for (const source of this.sources) {
            for (const directory of source.getLogDirs(this.workspacePaths)) {
                const key = `${source.id}:${normalizeFsPath(directory)}`;
                if (this.watchedDirectoryKeys.has(key)) {
                    continue;
                }
                if (!(await isDirectory(directory))) {
                    continue;
                }
                this.watchedDirectoryKeys.add(key);
                this.watchedDirectories.push({ source, directory });
                this.watchDirectory(directory);
            }
        }
    }
    watchDirectory(directory) {
        const onChange = () => {
            void this.requestScan();
        };
        try {
            const watcher = fs.watch(directory, { recursive: true }, onChange);
            watcher.on('error', () => undefined);
            this.watchers.push(watcher);
        }
        catch {
            try {
                const watcher = fs.watch(directory, onChange);
                watcher.on('error', () => undefined);
                this.watchers.push(watcher);
            }
            catch {
                // Polling remains active when native directory watching is unavailable.
            }
        }
    }
    requestScan() {
        if (this.scanPromise) {
            this.scanRequested = true;
            return this.scanPromise;
        }
        this.scanPromise = (async () => {
            do {
                this.scanRequested = false;
                await this.scanAllFiles();
            } while (this.scanRequested && !this.disposed);
        })().finally(() => {
            this.scanPromise = undefined;
        });
        return this.scanPromise;
    }
    async scanAllFiles() {
        // Copilot creates chatSessions lazily on the first chat in a workspace.
        // Rediscovery lets a session that starts after Sprintly still be captured.
        await this.discoverDirectories();
        for (const watched of this.watchedDirectories) {
            const files = await findLogFiles(watched.directory, watched.source.id);
            for (const filePath of files) {
                if (this.disposed) {
                    return;
                }
                await this.readAppendedBytes(watched.source, filePath);
            }
        }
    }
    async readAppendedBytes(source, filePath) {
        let stat;
        try {
            stat = await fs.promises.stat(filePath);
        }
        catch {
            return;
        }
        let startOffset = this.store.getAgentFileOffset(filePath);
        if (stat.size < startOffset) {
            startOffset = 0;
            this.fileParseContexts.delete(filePath);
            this.fileWorkspaces.delete(filePath);
        }
        if (stat.size === startOffset || stat.size === 0) {
            return;
        }
        const fileWorkspace = await this.resolveFileWorkspace(source, filePath, startOffset);
        const parseContext = await this.resolveParseContext(source, filePath, startOffset);
        const batch = emptyParsedBatch();
        let processedBytes = 0;
        let remainder = Buffer.alloc(0);
        try {
            const stream = fs.createReadStream(filePath, {
                start: startOffset,
                end: stat.size - 1,
            });
            for await (const chunk of stream) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                const combined = remainder.length === 0 ? bytes : Buffer.concat([remainder, bytes]);
                const finalNewline = combined.lastIndexOf(0x0a);
                if (finalNewline < 0) {
                    remainder = combined;
                    continue;
                }
                const complete = combined.subarray(0, finalNewline + 1);
                remainder = combined.subarray(finalNewline + 1);
                processedBytes += complete.length;
                this.processCompleteLines(source, complete.toString('utf8'), batch, fileWorkspace, parseContext);
            }
        }
        catch {
            return;
        }
        if (remainder.length > 0) {
            const parsed = (0, agentLogSources_1.parseJsonLine)(remainder.toString('utf8').replace(/\r$/, ''));
            if (parsed) {
                this.processSourceLine(source, parsed, batch, fileWorkspace, parseContext);
                processedBytes += remainder.length;
            }
        }
        if (processedBytes === 0) {
            return;
        }
        const storeBatch = {
            sourceId: source.id,
            detected: batch.detected,
            filePath,
            nextOffset: startOffset + processedBytes,
            promptCount: batch.promptCount,
            sessionId: batch.sessionId,
            claudeUsage: batch.hasClaudeUsage ? batch.claudeUsage : undefined,
            codexTokens: batch.codexTokens,
            codexUsageAvailable: batch.codexUsageAvailable,
            copilotUsage: batch.hasCopilotUsage ? batch.copilotUsage : undefined,
        };
        this.store.applyAgentLogBatch(storeBatch);
    }
    processCompleteLines(source, text, batch, fileWorkspace, parseContext) {
        for (const line of text.split('\n')) {
            const trimmed = line.replace(/\r$/, '').trim();
            if (!trimmed) {
                continue;
            }
            const parsed = (0, agentLogSources_1.parseJsonLine)(trimmed);
            if (parsed) {
                this.processSourceLine(source, parsed, batch, fileWorkspace, parseContext);
            }
        }
    }
    processSourceLine(source, parsed, batch, fileWorkspace, parseContext) {
        const entries = source.expandEntries
            ? source.expandEntries(parsed, parseContext)
            : [parsed];
        for (const entry of entries) {
            this.processParsedLine(source, entry, batch, fileWorkspace);
        }
    }
    processParsedLine(source, parsed, batch, fileWorkspace) {
        if (!(0, privacySettings_1.isTelemetryCategoryEnabled)('agentUsage')) {
            return;
        }
        this.updateFileWorkspace(source, parsed, fileWorkspace);
        if (!fileWorkspace.matches) {
            return;
        }
        const timestamp = source.extractTimestamp(parsed);
        // ASSUMPTION: entries without a trustworthy timestamp are ignored instead of being
        // assigned to a session, which prevents old or schema-unknown lines from inflating totals.
        if (timestamp === null) {
            return;
        }
        const sessionId = this.store.getSessionIdForTimestamp(timestamp);
        if (!sessionId || (batch.sessionId && batch.sessionId !== sessionId)) {
            return;
        }
        batch.sessionId = sessionId;
        // An agent is considered in use only after a valid entry from that agent is
        // found inside this Sprintly session, rather than from installation alone.
        batch.detected = true;
        if (source.isPromptEntry(parsed)) {
            batch.promptCount += 1;
        }
        const usage = source.extractUsage(parsed);
        if (usage) {
            addUsage(batch, usage);
        }
    }
    async resolveFileWorkspace(source, filePath, startOffset) {
        const cached = this.fileWorkspaces.get(filePath);
        if (cached) {
            return cached;
        }
        const state = {
            matches: source.logsAreWorkspaceScoped === true,
            resolved: source.logsAreWorkspaceScoped === true || this.workspacePaths.length === 0,
        };
        if (this.workspacePaths.length === 0) {
            this.fileWorkspaces.set(filePath, state);
            return state;
        }
        // Persisted cursors may begin after the session metadata containing cwd.
        // Read a bounded header to recover the file's workspace association.
        if (startOffset > 0) {
            try {
                const handle = await fs.promises.open(filePath, 'r');
                try {
                    const header = Buffer.alloc(Math.min(startOffset, 64 * 1024));
                    const { bytesRead } = await handle.read(header, 0, header.length, 0);
                    for (const line of header.subarray(0, bytesRead).toString('utf8').split('\n')) {
                        const parsed = (0, agentLogSources_1.parseJsonLine)(line.trim());
                        if (parsed) {
                            this.updateFileWorkspace(source, parsed, state);
                            if (state.resolved)
                                break;
                        }
                    }
                }
                finally {
                    await handle.close();
                }
            }
            catch {
                // The appended scan can still resolve cwd from a later context entry.
            }
        }
        this.fileWorkspaces.set(filePath, state);
        return state;
    }
    async resolveParseContext(source, filePath, startOffset) {
        const cached = this.fileParseContexts.get(filePath);
        if (cached) {
            return cached;
        }
        const context = {};
        this.fileParseContexts.set(filePath, context);
        if (!source.expandEntries || startOffset <= 0) {
            return context;
        }
        // Copilot token patches refer to requests by array index. Rebuild that
        // lightweight index from the already-consumed prefix without recounting it.
        try {
            const stream = fs.createReadStream(filePath, { start: 0, end: startOffset - 1 });
            let remainder = '';
            for await (const chunk of stream) {
                const text = remainder + (Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
                const lines = text.split('\n');
                remainder = lines.pop() ?? '';
                for (const line of lines) {
                    const parsed = (0, agentLogSources_1.parseJsonLine)(line.replace(/\r$/, '').trim());
                    if (parsed) {
                        source.expandEntries(parsed, context);
                    }
                }
            }
            const parsed = (0, agentLogSources_1.parseJsonLine)(remainder.replace(/\r$/, '').trim());
            if (parsed) {
                source.expandEntries(parsed, context);
            }
        }
        catch {
            // New request records remain countable even if an old token index cannot be restored.
        }
        return context;
    }
    updateFileWorkspace(source, parsed, state) {
        const candidate = source.extractWorkspacePath(parsed);
        if (!candidate) {
            return;
        }
        state.path = candidate;
        state.matches = this.workspacePaths.some((workspacePath) => isPathInWorkspace(workspacePath, normalizeFsPath(candidate)));
        state.resolved = true;
    }
}
exports.AgentLogWatcher = AgentLogWatcher;
function addUsage(batch, usage) {
    if (usage.kind === 'claudeCode') {
        batch.hasClaudeUsage = true;
        batch.claudeUsage.input += usage.input;
        batch.claudeUsage.output += usage.output;
        batch.claudeUsage.cacheRead += usage.cacheRead;
        batch.claudeUsage.cacheCreate += usage.cacheCreate;
    }
    else if (usage.kind === 'codex') {
        batch.codexUsageAvailable = true;
        batch.codexTokens += usage.total;
    }
    else {
        batch.hasCopilotUsage = true;
        batch.copilotUsage.input += usage.input;
        batch.copilotUsage.output += usage.output;
        batch.copilotUsage.credits += usage.credits;
    }
}
function emptyParsedBatch() {
    return {
        detected: false,
        promptCount: 0,
        claudeUsage: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
        hasClaudeUsage: false,
        codexTokens: 0,
        codexUsageAvailable: false,
        copilotUsage: { input: 0, output: 0, credits: 0 },
        hasCopilotUsage: false,
    };
}
async function findLogFiles(directory, sourceId) {
    const files = [];
    const pending = [directory];
    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) {
            continue;
        }
        let entries;
        try {
            entries = await fs.promises.readdir(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                pending.push(entryPath);
            }
            else if (entry.isFile() && isLogFile(entry.name, sourceId)) {
                files.push(entryPath);
            }
        }
    }
    return files;
}
function isLogFile(fileName, sourceId) {
    if (sourceId === 'claude-code' || sourceId === 'github-copilot') {
        return fileName.toLowerCase().endsWith('.jsonl');
    }
    return /^rollout-.*\.jsonl$/i.test(fileName);
}
async function isDirectory(directory) {
    try {
        return (await fs.promises.stat(directory)).isDirectory();
    }
    catch {
        return false;
    }
}
function getOpenWorkspacePaths() {
    return (vscode.workspace.workspaceFolders ?? [])
        .filter((folder) => folder.uri.scheme === 'file')
        .map((folder) => folder.uri.fsPath);
}
function isPathInWorkspace(workspacePath, candidatePath) {
    const normalizedWorkspace = normalizeFsPath(workspacePath);
    const normalizedCandidate = normalizeFsPath(candidatePath);
    return normalizedCandidate === normalizedWorkspace
        || normalizedCandidate.startsWith(`${normalizedWorkspace}${path.sep}`);
}
function normalizeFsPath(value) {
    const normalized = path.resolve(value).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
//# sourceMappingURL=agentLogWatcher.js.map