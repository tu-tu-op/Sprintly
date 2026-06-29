import * as os from 'os';
import * as path from 'path';
import { ClaudeTokenStats } from './dailyStateStore';

export type ParsedJsonLine = Record<string, unknown>;

export type TokenUsage =
  | ({ kind: 'claudeCode' } & ClaudeTokenStats)
  | { kind: 'codex'; total: number };

export interface AgentLogSource {
  id: string;
  getLogDirs(): string[];
  isPromptEntry(line: ParsedJsonLine): boolean;
  extractTimestamp(line: ParsedJsonLine): number | null;
  extractUsage(line: ParsedJsonLine): TokenUsage | null;
}

export const CLAUDE_CODE_SOURCE: AgentLogSource = {
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

export const CODEX_SOURCE: AgentLogSource = {
  id: 'codex',
  getLogDirs: () => [path.join(os.homedir(), '.codex', 'sessions')],
  isPromptEntry: isCodexPrompt,
  extractTimestamp: extractCommonTimestamp,
  extractUsage: extractCodexUsage,
};

export const AGENT_LOG_SOURCES: readonly AgentLogSource[] = [
  CLAUDE_CODE_SOURCE,
  CODEX_SOURCE,
];

export function parseJsonLine(line: string): ParsedJsonLine | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function isCodexPrompt(line: ParsedJsonLine): boolean {
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

function isUserMessageType(type: string): boolean {
  return type === 'user_message' || type === 'user-message' || type === 'input_message';
}

function extractCodexUsage(line: ParsedJsonLine): TokenUsage | null {
  const payload = asRecord(line.payload);
  const info = asRecord(payload?.info);
  const type = typeof line.type === 'string' ? line.type.toLowerCase() : '';
  const payloadType = typeof payload?.type === 'string' ? payload.type.toLowerCase() : '';
  const candidates: unknown[] = [
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

function extractTokenTotal(value: unknown): number | null {
  const usage = asRecord(value);
  if (!usage) {
    return null;
  }
  const direct = firstNumber(
    usage.total_tokens,
    usage.totalTokens,
    usage.total,
    usage.token_count,
  );
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

function extractCommonTimestamp(line: ParsedJsonLine): number | null {
  const payload = asRecord(line.payload);
  const message = asRecord(line.message);
  const raw = line.timestamp
    ?? line.created_at
    ?? line.createdAt
    ?? line.time
    ?? payload?.timestamp
    ?? message?.timestamp;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readContent(value: ParsedJsonLine): unknown {
  return value.content ?? value.text ?? value.message ?? value.input;
}

function hasUserAuthoredText(content: unknown): boolean {
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

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = readNonNegativeNumber(value);
    if (number !== null) {
      return number;
    }
  }
  return null;
}

function readNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function asRecord(value: unknown): ParsedJsonLine | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ParsedJsonLine
    : null;
}
