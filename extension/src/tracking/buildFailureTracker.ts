import * as vscode from 'vscode';
import { DailyStateStore } from './dailyStateStore';

export const FAILURE_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'missing_module', pattern: /Cannot find module|MODULE_NOT_FOUND|ModuleNotFoundError/i },
  { id: 'missing_package', pattern: /command not found|is not recognized as an internal/i },
  { id: 'syntax_error', pattern: /SyntaxError|Unexpected token|ParseError/i },
  { id: 'type_error', pattern: /TypeError:|TS\d{4}:/i },
  { id: 'file_not_found', pattern: /ENOENT|No such file or directory/i },
  { id: 'permission', pattern: /EACCES|Permission denied/i },
  { id: 'port_in_use', pattern: /EADDRINUSE|address already in use/i },
];

const MAX_OUTPUT_LINES = 200;
const MAX_OUTPUT_CHARACTERS = 20_000;

export class BuildFailureTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly integratedTerminals = new Set<vscode.Terminal>();

  constructor(private readonly store: DailyStateStore) {
    for (const terminal of vscode.window.terminals) {
      if (terminal.shellIntegration) {
        this.integratedTerminals.add(terminal);
      }
    }
    this.disposables.push(
      vscode.window.onDidChangeTerminalShellIntegration((event) => {
        this.integratedTerminals.add(event.terminal);
      }),
      vscode.window.onDidCloseTerminal((terminal) => {
        this.integratedTerminals.delete(terminal);
      }),
      vscode.window.onDidEndTerminalShellExecution((event) => {
        void this.handleExecutionEnd(event).catch(() => undefined);
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.integratedTerminals.clear();
  }

  private async handleExecutionEnd(event: vscode.TerminalShellExecutionEndEvent): Promise<void> {
    if (!event.shellIntegration
      || !event.terminal.shellIntegration
      || !this.integratedTerminals.has(event.terminal)
      || event.exitCode === undefined
      || event.exitCode === 0) {
      return;
    }

    const output = await readBoundedOutput(event.execution);
    const category = categorizeFailure(output);
    this.store.addBuildFailure(category);
  }
}

export function categorizeFailure(output: string): string {
  return FAILURE_PATTERNS.find(({ pattern }) => pattern.test(output))?.id ?? 'other';
}

async function readBoundedOutput(execution: vscode.TerminalShellExecution): Promise<string> {
  let output = '';
  try {
    for await (const chunk of execution.read()) {
      const remaining = MAX_OUTPUT_CHARACTERS - output.length;
      if (remaining <= 0) {
        break;
      }
      const candidate = output + chunk.slice(0, remaining);
      const lines = candidate.split(/\r?\n/);
      if (lines.length > MAX_OUTPUT_LINES) {
        output = lines.slice(0, MAX_OUTPUT_LINES).join('\n');
        break;
      }
      output = candidate;
      if (output.length >= MAX_OUTPUT_CHARACTERS) {
        break;
      }
    }
  } catch {
    return output;
  }
  return output;
}
