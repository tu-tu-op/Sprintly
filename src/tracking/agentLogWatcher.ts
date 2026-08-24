import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  AgentLogParseContext,
  AgentLogSource,
  AGENT_LOG_SOURCES,
  parseJsonLine,
  TokenUsage,
} from './agentLogSources';
import {
  AgentLogBatch,
  ClaudeTokenStats,
  CopilotTokenStats,
  DailyStateStore,
} from './dailyStateStore';
import { isTelemetryCategoryEnabled } from './privacySettings';

const POLL_INTERVAL_MS = 5_000;
/** Full directory rediscovery runs at most once per minute during polling. */
const REDISCOVERY_POLL_INTERVAL = 12;
/** An unterminated trailing line larger than this is discarded, not buffered. */
const MAX_UNTERMINATED_LINE_BYTES = 4 * 1024 * 1024;
/** Consumed-prefix reconstruction for Copilot indices is skipped beyond this. */
const MAX_PREFIX_REBUILD_BYTES = 8 * 1024 * 1024;
/** In-memory per-file caches are trimmed to this many entries. */
const MAX_CACHED_FILES = 512;

interface WatchedDirectory {
  source: AgentLogSource;
  directory: string;
}

interface ParsedBatch {
  detected: boolean;
  sessionId?: string;
  promptCount: number;
  claudeUsage: ClaudeTokenStats;
  hasClaudeUsage: boolean;
  codexTokens: number;
  codexUsageAvailable: boolean;
  copilotUsage: CopilotTokenStats;
  hasCopilotUsage: boolean;
}

interface FileWorkspaceState {
  path?: string;
  matches: boolean;
  resolved: boolean;
}

export class AgentLogWatcher implements vscode.Disposable {
  private readonly watchers: fs.FSWatcher[] = [];
  private readonly watchedDirectories: WatchedDirectory[] = [];
  private readonly watchedDirectoryKeys = new Set<string>();
  private readonly fileWorkspaces = new Map<string, FileWorkspaceState>();
  private readonly fileParseContexts = new Map<string, AgentLogParseContext>();
  /** Last seen cumulative Codex token total per file, for delta accounting. */
  private readonly codexCumulativeTotals = new Map<string, number>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private scanPromise: Promise<void> | undefined;
  private scanRequested = false;
  private disposed = false;
  private startPromise: Promise<void> | undefined;
  private pollCount = 0;
  private rediscoveryDue = true;
  /**
   * Consent boundary: agent-log discovery, reading, parsing, watching, and
   * cursor persistence may only run after an explicit user Start (or an
   * equivalent opted-in flow). Nothing observes logs before that point or
   * after End/Reset/disable stops monitoring again.
   */
  private monitoring = false;

  constructor(
    private readonly store: DailyStateStore,
    private readonly sources: readonly AgentLogSource[] = AGENT_LOG_SOURCES,
    workspacePaths: readonly string[] = getOpenWorkspacePaths(),
  ) {
    this.workspacePaths = workspacePaths.map(normalizeFsPath);
  }

  private readonly workspacePaths: string[];

  start(): Promise<void> {
    this.monitoring = true;
    this.startPromise ??= this.initialize();
    return this.startPromise;
  }

  /**
   * Halt every form of log observation. Monitoring stays restartable through
   * start(), so an ended sprint does not permanently break the next one.
   */
  stop(): void {
    this.monitoring = false;
    this.startPromise = undefined;
    this.pollCount = 0;
    this.rediscoveryDue = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    for (const watcher of this.watchers.splice(0)) {
      watcher.close();
    }
    this.watchedDirectories.length = 0;
    this.watchedDirectoryKeys.clear();
    this.fileWorkspaces.clear();
    this.fileParseContexts.clear();
    this.codexCumulativeTotals.clear();
  }

  async scanNow(): Promise<void> {
    if (!this.monitoring || this.disposed) {
      return;
    }
    await this.start();
    await this.requestScan();
  }

  private async initialize(): Promise<void> {
    await this.discoverDirectories();
    await this.requestScan();
    this.pollTimer = setInterval(() => {
      if (this.monitoring && !this.disposed) {
        this.pollCount++;
        void this.requestScan();
      }
    }, POLL_INTERVAL_MS);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private async discoverDirectories(): Promise<void> {
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

  private watchDirectory(directory: string): void {
    const onChange = (): void => {
      // A filesystem event schedules the next targeted rediscovery; it no
      // longer forces a full-tree enumeration on every event.
      this.rediscoveryDue = true;
      void this.requestScan();
    };
    try {
      const watcher = fs.watch(directory, { recursive: true }, onChange);
      watcher.on('error', () => undefined);
      this.watchers.push(watcher);
    } catch {
      try {
        const watcher = fs.watch(directory, onChange);
        watcher.on('error', () => undefined);
        this.watchers.push(watcher);
      } catch {
        // Polling remains active when native directory watching is unavailable.
      }
    }
  }

  private requestScan(): Promise<void> {
    if (this.scanPromise) {
      this.scanRequested = true;
      return this.scanPromise;
    }
    this.scanPromise = (async () => {
      do {
        this.scanRequested = false;
        if (!this.monitoring || this.disposed) {
          return;
        }
        await this.scanAllFiles();
      } while (this.scanRequested && this.monitoring && !this.disposed);
    })().finally(() => {
      this.scanPromise = undefined;
    });
    return this.scanPromise;
  }

  private async scanAllFiles(): Promise<void> {
    // Copilot creates chatSessions lazily on the first chat in a workspace.
    // Rediscovery is throttled to at most once per minute (and on filesystem
    // events) instead of enumerating every watched tree on every poll tick.
    if (this.rediscoveryDue || this.pollCount % REDISCOVERY_POLL_INTERVAL === 0) {
      this.rediscoveryDue = false;
      await this.discoverDirectories();
    }
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

  private async readAppendedBytes(source: AgentLogSource, filePath: string): Promise<void> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return;
    }
    let startOffset = this.store.getAgentFileOffset(filePath);
    if (stat.size < startOffset) {
      startOffset = 0;
      this.fileParseContexts.delete(filePath);
      this.fileWorkspaces.delete(filePath);
      // Rotation/truncation invalidates cumulative counters for this file;
      // replayed totals must restart from zero rather than produce deltas.
      this.codexCumulativeTotals.delete(filePath);
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
          if (combined.length > MAX_UNTERMINATED_LINE_BYTES) {
            // A pathological unterminated line is dropped and its bytes are
            // consumed so the cursor can still advance.
            processedBytes += combined.length;
            remainder = Buffer.alloc(0);
          } else {
            remainder = combined;
          }
          continue;
        }
        const complete = combined.subarray(0, finalNewline + 1);
        remainder = combined.subarray(finalNewline + 1);
        processedBytes += complete.length;
        this.processCompleteLines(source, complete.toString('utf8'), batch, fileWorkspace, parseContext, filePath);
      }
    } catch {
      return;
    }

    if (remainder.length > 0) {
      const parsed = parseJsonLine(remainder.toString('utf8').replace(/\r$/, ''));
      if (parsed) {
        this.processSourceLine(source, parsed, batch, fileWorkspace, parseContext, filePath);
        processedBytes += remainder.length;
      }
    }

    if (processedBytes === 0) {
      return;
    }
    const storeBatch: AgentLogBatch = {
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

  private processCompleteLines(
    source: AgentLogSource,
    text: string,
    batch: ParsedBatch,
    fileWorkspace: FileWorkspaceState,
    parseContext: AgentLogParseContext,
    filePath: string,
  ): void {
    for (const line of text.split('\n')) {
      const trimmed = line.replace(/\r$/, '').trim();
      if (!trimmed) {
        continue;
      }
      const parsed = parseJsonLine(trimmed);
      if (parsed) {
        this.processSourceLine(source, parsed, batch, fileWorkspace, parseContext, filePath);
      }
    }
  }

  private processSourceLine(
    source: AgentLogSource,
    parsed: Record<string, unknown>,
    batch: ParsedBatch,
    fileWorkspace: FileWorkspaceState,
    parseContext: AgentLogParseContext,
    filePath: string,
  ): void {
    const entries = source.expandEntries
      ? source.expandEntries(parsed, parseContext)
      : [parsed];
    for (const entry of entries) {
      this.processParsedLine(source, entry, batch, fileWorkspace, filePath);
    }
  }

  private processParsedLine(
    source: AgentLogSource,
    parsed: Record<string, unknown>,
    batch: ParsedBatch,
    fileWorkspace: FileWorkspaceState,
    filePath: string,
  ): void {
    if (!isTelemetryCategoryEnabled('agentUsage')) {
      return;
    }
    this.updateFileWorkspace(source, parsed, fileWorkspace);
    this.trimFileCache(this.fileWorkspaces);
    if (!fileWorkspace.matches) {
      return;
    }
    const timestamp = source.extractTimestamp(parsed);
    // ASSUMPTION: entries without a trustworthy timestamp are ignored instead of being
    // assigned to a session, which prevents old or schema-unknown lines from inflating totals.
    if (timestamp === null) {
      return;
    }
    // Cumulative counters must advance even for entries that fall outside the
    // session window; otherwise replayed totals would inflate later deltas.
    let usage = source.extractUsage(parsed);
    if (usage && usage.kind === 'codex' && usage.cumulative === true) {
      const previous = this.codexCumulativeTotals.get(filePath) ?? 0;
      const delta = usage.total > previous ? usage.total - previous : 0;
      this.codexCumulativeTotals.set(filePath, usage.total);
      usage = delta > 0 ? { kind: 'codex', total: delta } : null;
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
    if (usage) {
      addUsage(batch, usage);
    }
  }

  private trimFileCache(map: Map<string, unknown>): void {
    while (map.size > MAX_CACHED_FILES) {
      const oldest = map.keys().next();
      if (oldest.done) {
        return;
      }
      map.delete(oldest.value);
    }
  }

  private async resolveFileWorkspace(
    source: AgentLogSource,
    filePath: string,
    startOffset: number,
  ): Promise<FileWorkspaceState> {
    const cached = this.fileWorkspaces.get(filePath);
    if (cached) {
      return cached;
    }

    const state: FileWorkspaceState = {
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
            const parsed = parseJsonLine(line.trim());
            if (parsed) {
              this.updateFileWorkspace(source, parsed, state);
              if (state.resolved) break;
            }
          }
        } finally {
          await handle.close();
        }
      } catch {
        // The appended scan can still resolve cwd from a later context entry.
      }
    }
    this.fileWorkspaces.set(filePath, state);
    return state;
  }

  private async resolveParseContext(
    source: AgentLogSource,
    filePath: string,
    startOffset: number,
  ): Promise<AgentLogParseContext> {
    const cached = this.fileParseContexts.get(filePath);
    if (cached) {
      return cached;
    }
    const context: AgentLogParseContext = {};
    this.fileParseContexts.set(filePath, context);
    this.trimFileCache(this.fileParseContexts);
    if (!source.expandEntries || startOffset <= 0) {
      return context;
    }
    // Rebuilding request indices from an already-consumed prefix is bounded:
    // a huge consumed prefix is skipped rather than reread in full.
    if (startOffset > MAX_PREFIX_REBUILD_BYTES) {
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
          const parsed = parseJsonLine(line.replace(/\r$/, '').trim());
          if (parsed) {
            source.expandEntries(parsed, context);
          }
        }
      }
      const parsed = parseJsonLine(remainder.replace(/\r$/, '').trim());
      if (parsed) {
        source.expandEntries(parsed, context);
      }
    } catch {
      // New request records remain countable even if an old token index cannot be restored.
    }
    return context;
  }

  private updateFileWorkspace(
    source: AgentLogSource,
    parsed: Record<string, unknown>,
    state: FileWorkspaceState,
  ): void {
    const candidate = source.extractWorkspacePath(parsed);
    if (!candidate) {
      return;
    }
    state.path = candidate;
    state.matches = this.workspacePaths.some((workspacePath) => isPathInWorkspace(
      workspacePath,
      normalizeFsPath(candidate),
    ));
    state.resolved = true;
  }
}

function addUsage(batch: ParsedBatch, usage: TokenUsage): void {
  if (usage.kind === 'claudeCode') {
    batch.hasClaudeUsage = true;
    batch.claudeUsage.input += usage.input;
    batch.claudeUsage.output += usage.output;
    batch.claudeUsage.cacheRead += usage.cacheRead;
    batch.claudeUsage.cacheCreate += usage.cacheCreate;
  } else if (usage.kind === 'codex') {
    batch.codexUsageAvailable = true;
    batch.codexTokens += usage.total;
  } else {
    batch.hasCopilotUsage = true;
    batch.copilotUsage.input += usage.input;
    batch.copilotUsage.output += usage.output;
    batch.copilotUsage.credits += usage.credits;
  }
}

function emptyParsedBatch(): ParsedBatch {
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

async function findLogFiles(directory: string, sourceId: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && isLogFile(entry.name, sourceId)) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function isLogFile(fileName: string, sourceId: string): boolean {
  if (sourceId === 'claude-code' || sourceId === 'github-copilot') {
    return fileName.toLowerCase().endsWith('.jsonl');
  }
  return /^rollout-.*\.jsonl$/i.test(fileName);
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function getOpenWorkspacePaths(): string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => folder.uri.fsPath);
}

export function isPathInWorkspace(workspacePath: string, candidatePath: string): boolean {
  const normalizedWorkspace = normalizeFsPath(workspacePath);
  const normalizedCandidate = normalizeFsPath(candidatePath);
  return normalizedCandidate === normalizedWorkspace
    || normalizedCandidate.startsWith(`${normalizedWorkspace}${path.sep}`);
}

function normalizeFsPath(value: string): string {
  const normalized = path.resolve(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
