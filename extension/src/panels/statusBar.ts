import * as vscode from 'vscode';
import { SessionStats, SessionTracker } from '../sessionTracker';
import { DailySprintlyState, DailyStateStore } from '../tracking/dailyStateStore';
import {
  buildSessionPanelSummary,
  SESSION_PANEL_COMMAND,
  SessionPanelSummary,
} from './sessionQuickPick';

export interface SprintlyStatusBarController extends vscode.Disposable {
  update(): void;
}

export interface StatusBarPresentation {
  text: string;
  summary: SessionPanelSummary;
}

export function initStatusBar(
  context: vscode.ExtensionContext,
  tracker: SessionTracker,
  sessionStore: DailyStateStore,
): SprintlyStatusBarController {
  const item = vscode.window.createStatusBarItem(
    'sprintly.statusbar',
    vscode.StatusBarAlignment.Left,
    100,
  );
  const controller = new SprintlyPanelStatusBar(item, tracker, sessionStore);

  item.name = 'Sprintly';
  item.command = SESSION_PANEL_COMMAND;
  item.show();
  controller.update();

  context.subscriptions.push(
    controller,
    tracker.onDidUpdate.event(() => controller.update()),
    sessionStore.onDidUpdate(() => controller.update()),
  );

  return controller;
}

export function buildStatusBarPresentation(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
): StatusBarPresentation {
  const summary = buildSessionPanelSummary(trackerStats, state);
  let text: string;
  if (summary.status === 'In progress') {
    text = `$(debug-start) Sprintly · ${summary.duration}`;
  } else if (summary.status === 'Paused') {
    text = `$(debug-pause) Sprintly · ${summary.duration}`;
  } else if (summary.status === 'Completed') {
    text = '$(history) Sprintly · Last sprint';
  } else {
    text = '$(circle-outline) Sprintly · Ready';
  }
  return { text, summary };
}

class SprintlyPanelStatusBar implements SprintlyStatusBarController {
  constructor(
    private readonly item: vscode.StatusBarItem,
    private readonly tracker: SessionTracker,
    private readonly sessionStore: DailyStateStore,
  ) {}

  update(): void {
    try {
      const presentation = buildStatusBarPresentation(
        this.tracker.get(),
        this.sessionStore.get(),
      );
      this.item.text = presentation.text;
      this.item.tooltip = buildTooltip(presentation.summary);
    } catch {
      this.item.text = '$(circle-outline) Sprintly · Ready';
      this.item.tooltip = 'Open Sprintly Quick Panel';
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}

function buildTooltip(summary: SessionPanelSummary): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString('', true);
  tooltip.isTrusted = true;
  tooltip.supportThemeIcons = true;

  tooltip.appendMarkdown(`### $(pulse) Sprintly · ${summary.scope}\n\n`);
  tooltip.appendMarkdown(`**${summary.status}** · \`${summary.duration}\`\n\n`);
  tooltip.appendMarkdown(`Coding split: **${summary.codingSplit}**\n\n`);
  tooltip.appendMarkdown(`Agent prompts: **${summary.promptUsage}**\n\n`);
  tooltip.appendMarkdown(`Token usage: **${summary.tokenUsage}**\n\n`);
  tooltip.appendMarkdown(`Build failures: **${summary.buildFailures}**\n\n`);
  tooltip.appendMarkdown(
    `[Open Quick Panel](command:${SESSION_PANEL_COMMAND}) · `
    + '[Settings](command:workbench.action.openSettings?%5B%22sprintly%22%5D)',
  );
  return tooltip;
}
