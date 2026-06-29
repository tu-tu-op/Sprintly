"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLogWatcher = void 0;
const fs = require("fs");
const path = require("path");
const agentLogSources_1 = require("./agentLogSources");
const dailyStateStore_1 = require("./dailyStateStore");
const POLL_INTERVAL_MS = 5000;
class AgentLogWatcher {
    constructor(store, sources = agentLogSources_1.AGENT_LOG_SOURCES) {
        this.store = store;
        this.sources = sources;
        this.watchers = [];
        this.watchedDirectories = [];
        this.scanRequested = false;
        this.disposed = false;
    }
    async start() {
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
            for (const directory of source.getLogDirs()) {
                if (!(await isDirectory(directory))) {
                    continue;
                }
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
        }
        if (stat.size === startOffset || stat.size === 0) {
            return;
        }
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
                this.processCompleteLines(source, complete.toString('utf8'), batch);
            }
        }
        catch {
            return;
        }
        if (remainder.length > 0) {
            const parsed = (0, agentLogSources_1.parseJsonLine)(remainder.toString('utf8').replace(/\r$/, ''));
            if (parsed) {
                this.processParsedLine(source, parsed, batch);
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
            claudeUsage: batch.hasClaudeUsage ? batch.claudeUsage : undefined,
            codexTokens: batch.codexTokens,
            codexUsageAvailable: batch.codexUsageAvailable,
        };
        this.store.applyAgentLogBatch(storeBatch);
    }
    processCompleteLines(source, text, batch) {
        for (const line of text.split('\n')) {
            const trimmed = line.replace(/\r$/, '').trim();
            if (!trimmed) {
                continue;
            }
            const parsed = (0, agentLogSources_1.parseJsonLine)(trimmed);
            if (parsed) {
                this.processParsedLine(source, parsed, batch);
            }
        }
    }
    processParsedLine(source, parsed, batch) {
        const timestamp = source.extractTimestamp(parsed);
        const bounds = (0, dailyStateStore_1.localDayBounds)();
        // ASSUMPTION: entries without a trustworthy timestamp are ignored instead of being
        // assigned to today, which prevents old or schema-unknown lines from inflating totals.
        if (timestamp === null || timestamp < bounds.start || timestamp >= bounds.end) {
            return;
        }
        // ASSUMPTION: an agent is considered in use only after a valid entry from that
        // agent is found for the current local day, rather than from installation alone.
        batch.detected = true;
        if (source.isPromptEntry(parsed)) {
            batch.promptCount += 1;
        }
        const usage = source.extractUsage(parsed);
        if (usage) {
            addUsage(batch, usage);
        }
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
    else {
        batch.codexUsageAvailable = true;
        batch.codexTokens += usage.total;
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
    if (sourceId === 'claude-code') {
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
//# sourceMappingURL=agentLogWatcher.js.map