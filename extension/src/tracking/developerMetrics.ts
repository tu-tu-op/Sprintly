import { SessionSplit } from './dailyStateStore';
import { TerminalCommandCounts } from './terminalCommands';

export interface DeveloperMetricInput {
  sessionDurationMs: number;
  coding: Pick<SessionSplit, 'manualMs' | 'aiAssistedMs' | 'automationMs' | 'unknownBulkMs'>;
  fileEdits: number;
  fileSaves: number;
  fileSwitches: number;
  terminalCommands: number;
  terminalCommandsByCategory?: Partial<TerminalCommandCounts>;
  failures: number;
  recoveredFailures: number;
  successfulRuns: number;
}

export interface DeveloperMetrics {
  focusScore: number;
  contextSwitches: number;
  shippingActivity: number;
  testingDiscipline: number;
  aiBalance: number;
  recoveryRate: number;
  cleanRun: boolean;
}

export type DeveloperArchetype =
  | 'Vibe Coder'
  | 'Hardcore Coder'
  | 'Precision Coder'
  | 'Terminal Warrior'
  | 'Debugging Goblin'
  | 'Test Monk'
  | 'Steady Builder'
  | 'Shipping Machine'
  | 'Refactor Addict'
  | 'AI Whisperer';

export interface DeveloperProfile {
  primary: DeveloperArchetype;
  traits: string[];
  metrics: DeveloperMetrics;
}

export function calculateDeveloperMetrics(input: DeveloperMetricInput): DeveloperMetrics {
  const sessionMs = Math.max(0, input.sessionDurationMs);
  const codingMs = codingDuration(input);
  const commands = Math.max(0, input.terminalCommands);
  const categories = input.terminalCommandsByCategory ?? {};
  const validationCommands = sum(categories.test, categories.build, categories.lint);
  const knownCodingMs = Math.max(0, input.coding.manualMs + input.coding.aiAssistedMs + input.coding.automationMs);
  const failures = Math.max(0, input.failures);

  return {
    focusScore: percentage(codingMs, sessionMs),
    contextSwitches: Math.max(0, input.fileSwitches),
    shippingActivity: percentage(
      input.successfulRuns + Math.max(0, categories.git ?? 0),
      Math.max(1, commands),
    ),
    testingDiscipline: percentage(validationCommands, Math.max(1, commands)),
    aiBalance: percentage(input.coding.aiAssistedMs, Math.max(1, knownCodingMs)),
    recoveryRate: failures === 0 ? 100 : percentage(input.recoveredFailures, failures),
    cleanRun: failures === 0,
  };
}

export function deriveDeveloperProfile(input: DeveloperMetricInput): DeveloperProfile {
  const metrics = calculateDeveloperMetrics(input);
  const categories = input.terminalCommandsByCategory ?? {};
  const totalCoding = codingDuration(input);
  const manualShare = percentage(input.coding.manualMs, Math.max(1, totalCoding));
  const automationShare = percentage(input.coding.automationMs, Math.max(1, totalCoding));
  const traits: string[] = [];

  if (input.terminalCommands >= 5) traits.push('Terminal-heavy');
  if (metrics.aiBalance >= 25) traits.push('AI-assisted');
  if (metrics.recoveryRate >= 80 && input.failures > 0) traits.push('High recovery');
  if (metrics.testingDiscipline >= 50) traits.push('Validation-minded');
  if (metrics.contextSwitches >= Math.max(3, input.fileEdits / 3)) traits.push('Fast exploration');
  if (metrics.focusScore >= 80) traits.push('Deep focus');

  let primary: DeveloperArchetype = 'Steady Builder';
  if (automationShare >= 40) {
    primary = 'Refactor Addict';
  } else if ((categories.test ?? 0) >= 2 && metrics.testingDiscipline >= 50) {
    primary = 'Test Monk';
  } else if (input.failures >= 2 && metrics.recoveryRate >= 80) {
    primary = 'Debugging Goblin';
  } else if (input.successfulRuns >= 3 && metrics.shippingActivity >= 60) {
    primary = 'Shipping Machine';
  } else if (metrics.aiBalance >= 60) {
    primary = 'AI Whisperer';
  } else if (input.terminalCommands >= 5) {
    primary = 'Terminal Warrior';
  } else if (metrics.aiBalance >= 25) {
    primary = 'Vibe Coder';
  } else if (manualShare >= 70 && metrics.focusScore >= 80) {
    primary = 'Hardcore Coder';
  } else if (input.fileEdits > 0 && input.fileSaves >= input.fileEdits * 0.8) {
    primary = 'Precision Coder';
  }

  return { primary, traits: traits.slice(0, 3), metrics };
}

function codingDuration(input: DeveloperMetricInput): number {
  return Math.max(0,
    input.coding.manualMs
    + input.coding.aiAssistedMs
    + input.coding.automationMs
    + input.coding.unknownBulkMs,
  );
}

function percentage(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function sum(...values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + Math.max(0, value ?? 0), 0);
}
