import * as vscode from 'vscode';
import { SessionTracker } from '../sessionTracker';
import { demoStats, formatDuration, formatTimer, makeProgressBar } from './sprintlyPanels';
import { DailySprintlyState, DailyStateStore } from '../tracking/dailyStateStore';
import { estimateClaudeCost } from '../tracking/pricing';

export interface SprintlyStatusBarController extends vscode.Disposable {
  update(): void;
}

export function initStatusBar(
  context: vscode.ExtensionContext,
  tracker?: SessionTracker,
  dailyStore?: DailyStateStore,
): SprintlyStatusBarController {
  const item = vscode.window.createStatusBarItem(
    'sprintly.statusbar',
    vscode.StatusBarAlignment.Left,
    100,
  );
  const controller = new SprintlyPanelStatusBar(item, tracker, dailyStore);

  item.name = 'Sprintly';
  item.command = 'sprintly.openPanel';
  item.show();
  controller.update();

  context.subscriptions.push(controller);
  if (tracker) {
    context.subscriptions.push(tracker.onDidUpdate.event(() => controller.update()));
  }
  if (dailyStore) {
    context.subscriptions.push(dailyStore.onDidUpdate(() => controller.update()));
  }

  return controller;
}

class SprintlyPanelStatusBar implements SprintlyStatusBarController {
  constructor(
    private readonly item: vscode.StatusBarItem,
    private readonly tracker?: SessionTracker,
    private readonly dailyStore?: DailyStateStore,
  ) {}

  update(): void {
    try {
      const stats = demoStats();
      const session = this.tracker?.get();
      if (session?.isRecording) {
        const rankArrow = session.isPaused ? '⏸' : '↑';
        this.item.text = `$(debug-start) ${formatTimer(session.durationSeconds * 1000)}  ·  #3 ${rankArrow}`;
      } else {
        this.item.text = `$(zap) Sprintly  ·  #${stats.currentRank}`;
      }
      this.item.tooltip = buildTooltip(
        session?.isRecording ?? false,
        this.dailyStore?.get(),
      );
    } catch {
      this.item.text = '$(zap) Sprintly  ·  —';
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}

function buildTooltip(
  isActive: boolean,
  daily?: Readonly<DailySprintlyState>,
): vscode.MarkdownString {
  const stats = demoStats();
  const tooltip = new vscode.MarkdownString('', true);
  tooltip.isTrusted = true;
  tooltip.supportThemeIcons = true;

  tooltip.appendMarkdown('### $(zap) Sprintly\n\n');
  tooltip.appendMarkdown(`Rank: **#${isActive ? 3 : stats.currentRank}** · Streak: **${stats.streakDays} days**\n\n`);

  const goalCurrent = stats.weeklyGoalCurrent ?? 0;
  const goalMax = stats.weeklyGoalMax ?? 1;
  tooltip.appendMarkdown(`Weekly goal: \`${makeProgressBar(goalCurrent, goalMax)}\` ${goalCurrent}/${goalMax}\n\n`);

  if (isActive) {
    tooltip.appendMarkdown(`Active session: **${formatDuration(6443000)}**\n\n`);
  }

  if (daily) {
    const topFailure = Object.entries(daily.buildFailures.byCategory)
      .sort((left, right) => right[1] - left[1])[0];
    const claude = daily.tokenStats.claudeCode;
    const claudeEstimate = claude
      ? `${formatTokenEstimate(claude.input + claude.output + claude.cacheRead + claude.cacheCreate)} · est. $${estimateClaudeCost(claude).toFixed(2)}`
      : '— (est.)';
    const codexEstimate = daily.tokenStats.codex === 'unavailable'
      ? '— (est.)'
      : `${formatTokenEstimate(daily.tokenStats.codex.total)} (est.)`;

    tooltip.appendMarkdown('### Today\n\n');
    tooltip.appendMarkdown(`Session split: **Hard ${formatDailyDuration(daily.session.hardcodeMs)} · Vibe ${formatDailyDuration(daily.session.vibecodeMs)}**\n\n`);
    tooltip.appendMarkdown(`Agent prompts: **Claude ${daily.agentPrompts.claudeCode} · Codex ${daily.agentPrompts.codex}**\n\n`);
    tooltip.appendMarkdown(`Build failures: **${daily.buildFailures.total}${topFailure ? ` · Top: ${formatFailureCategory(topFailure[0])} ${topFailure[1]}` : ''}**\n\n`);
    tooltip.appendMarkdown(`Claude tokens estimate: **${claudeEstimate}**\n\n`);
    tooltip.appendMarkdown(`Codex tokens estimate: **${codexEstimate}**\n\n`);
  }

  tooltip.appendMarkdown('[Open Panel](command:sprintly.openPanel) · [Settings](command:workbench.action.openSettings?%5B%22sprintly%22%5D)');
  return tooltip;
}

function formatDailyDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatTokenEstimate(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `~${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `~${(tokens / 1_000).toFixed(1)}K`;
  }
  return `~${Math.round(tokens)}`;
}

function formatFailureCategory(category: string): string {
  return category.replace(/_/g, ' ');
}
