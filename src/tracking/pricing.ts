import * as vscode from 'vscode';
import { ClaudeTokenStats } from './dailyStateStore';

// Rates as of authoring date — these WILL go stale,
// make configurable via settings.json, do not hardcode as permanent truth.
export const PRICING_PER_MILLION = {
  claudeCode: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
} as const;

export interface ClaudePricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export function getClaudePricing(): ClaudePricing {
  const config = vscode.workspace.getConfiguration('sprintly.pricing.claudeCode');
  return {
    input: readRate(config, 'input', PRICING_PER_MILLION.claudeCode.input),
    output: readRate(config, 'output', PRICING_PER_MILLION.claudeCode.output),
    cacheRead: readRate(config, 'cacheRead', PRICING_PER_MILLION.claudeCode.cacheRead),
    cacheCreate: readRate(config, 'cacheCreate', PRICING_PER_MILLION.claudeCode.cacheCreate),
  };
}

export function estimateClaudeCost(tokens: ClaudeTokenStats, pricing = getClaudePricing()): number {
  return (
    tokens.input * pricing.input
    + tokens.output * pricing.output
    + tokens.cacheRead * pricing.cacheRead
    + tokens.cacheCreate * pricing.cacheCreate
  ) / 1_000_000;
}

function readRate(
  config: vscode.WorkspaceConfiguration,
  key: keyof ClaudePricing,
  fallback: number,
): number {
  const configured = config.get<unknown>(key);
  return typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
    ? configured
    : fallback;
}
