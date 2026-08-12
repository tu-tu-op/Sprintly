import * as vscode from 'vscode';
import { SessionStats, SessionTracker } from '../sessionTracker';
import { DailySprintlyState, DailyStateStore } from '../tracking/dailyStateStore';
import { estimateClaudeCost } from '../tracking/pricing';

export const SESSION_PANEL_COMMAND = 'sprintly.showStatusPanel';

type MetricDetail = 'coding' | 'prompts' | 'failures' | 'tokens';
type PanelAction = 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'settings';

interface SessionPanelItem extends vscode.QuickPickItem {
  metric?: MetricDetail;
  action?: PanelAction;
}

export interface SessionPanelSummary {
  scope: 'Current session' | 'Last session' | 'No session';
  status: 'In progress' | 'Paused' | 'Completed' | 'Ready';
  duration: string;
  codingSplit: string;
  promptUsage: string;
  tokenUsage: string;
  buildFailures: string;
}

export async function showStatusPanel(
  tracker: SessionTracker,
  sessionStore: DailyStateStore,
): Promise<void> {
  let trackerStats = tracker.get();
  let sessionState = sessionStore.get();
  const quickPick = vscode.window.createQuickPick<SessionPanelItem>();

  quickPick.ignoreFocusOut = false;
  quickPick.matchOnDescription = false;
  quickPick.matchOnDetail = false;
  quickPick.buttons = [
    { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Refresh' },
    { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Settings' },
  ];

  const render = (): void => {
    const summary = buildSessionPanelSummary(trackerStats, sessionState);
    quickPick.title = `$(pulse) Sprintly · ${summary.scope}`;
    quickPick.placeholder = panelPlaceholder(summary.status);
    quickPick.items = buildPanelItems(tracker, trackerStats, sessionState, summary);
  };

  const trackerSubscription = tracker.onDidUpdate.event((next) => {
    trackerStats = next;
    render();
  });
  const storeSubscription = sessionStore.onDidUpdate((next) => {
    sessionState = next;
    render();
  });

  quickPick.onDidTriggerButton((button) => {
    const icon = button.iconPath instanceof vscode.ThemeIcon ? button.iconPath.id : '';
    if (icon === 'refresh') {
      trackerStats = tracker.get();
      sessionState = sessionStore.get();
      render();
      return;
    }
    if (icon === 'settings-gear') {
      quickPick.hide();
      void vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
    }
  });

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (!selected) {
      return;
    }
    quickPick.hide();
    if (selected.metric) {
      void showMetricDetail(selected.metric, sessionStore.get());
      return;
    }
    if (selected.action) {
      runPanelAction(selected.action);
    }
  });

  quickPick.onDidHide(() => {
    trackerSubscription.dispose();
    storeSubscription.dispose();
    quickPick.dispose();
  });

  render();
  quickPick.show();
}

export function buildSessionPanelSummary(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
): SessionPanelSummary {
  const hasSession = state.session.id !== null;
  const isActive = trackerStats.isRecording && state.session.isActive;
  const scope = isActive ? 'Current session' : hasSession ? 'Last session' : 'No session';
  const status = isActive
    ? trackerStats.isPaused ? 'Paused' : 'In progress'
    : hasSession ? 'Completed' : 'Ready';
  const durationMs = trackerStats.startedAt
    ? trackerStats.durationSeconds * 1_000
    : calculateStoredDuration(state);

  return {
    scope,
    status,
    duration: formatClock(durationMs),
    codingSplit: `Hard ${formatCompactDuration(state.session.hardcodeMs)} · Vibe ${formatCompactDuration(state.session.vibecodeMs)}`,
    promptUsage: describeAgentPrompts(state),
    tokenUsage: describeTokenUsage(state),
    buildFailures: describeFailures(state),
  };
}

function buildPanelItems(
  tracker: SessionTracker,
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  summary: SessionPanelSummary,
): SessionPanelItem[] {
  const items: SessionPanelItem[] = [
    separator('SESSION'),
    item(statusIcon(summary.status), summary.status, summary.duration,
      state.session.id ? `${summary.codingSplit} · ${tracker.archetype()}` : 'Start a sprint when you are ready.'),
  ];

  if (trackerStats.startedAt) {
    items.push(
      separator('ACTIVITY'),
      item('edit', 'Edits', String(trackerStats.fileEdits), `${trackerStats.linesChanged} lines changed`),
      item(
        'files',
        'Files touched',
        String(trackerStats.activeFiles.size),
        `${trackerStats.fileSaves} saves · ${trackerStats.terminalCommands} terminal opens`,
      ),
    );
  }

  items.push(
    separator('AGENT USAGE'),
    metricItem('copilot', 'Prompts', summary.promptUsage, 'prompts'),
    metricItem('symbol-numeric', 'Tokens', summary.tokenUsage, 'tokens'),
    separator('RELIABILITY'),
    metricItem('error', 'Build failures', summary.buildFailures, 'failures'),
    metricItem('code', 'Coding split', summary.codingSplit, 'coding'),
    separator('CONTROLS'),
    ...buildControlItems(trackerStats, state),
  );

  return items;
}

function buildControlItems(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
): SessionPanelItem[] {
  if (!trackerStats.isRecording) {
    return [
      actionItem('play', 'Start Sprint', 'Begin a new tracked session', 'start'),
      ...(state.session.id
        ? [actionItem('trash', 'Clear Session Data', 'Remove the current session totals', 'reset')]
        : []),
    ];
  }

  return [
    trackerStats.isPaused
      ? actionItem('debug-continue', 'Resume Sprint', undefined, 'resume')
      : actionItem('debug-pause', 'Pause Sprint', undefined, 'pause'),
    actionItem('stop-circle', 'End Sprint', 'Keep this session as your latest summary', 'stop'),
  ];
}

async function showMetricDetail(
  metric: MetricDetail,
  state: Readonly<DailySprintlyState>,
): Promise<void> {
  const title = `Sprintly · ${state.session.isActive ? 'Current session' : 'Last session'}`;
  let items: vscode.QuickPickItem[];

  if (metric === 'coding') {
    items = [
      item('code', 'Hardcode', formatCompactDuration(state.session.hardcodeMs)),
      item('sparkle', 'Vibecode', formatCompactDuration(state.session.vibecodeMs)),
    ];
  } else if (metric === 'prompts') {
    items = [
      item('copilot', 'Claude Code', String(state.agentPrompts.claudeCode)),
      item('terminal', 'Codex', String(state.agentPrompts.codex)),
      item('github', 'GitHub Copilot', String(state.agentPrompts.githubCopilot)),
    ];
  } else if (metric === 'failures') {
    const categories = Object.entries(state.buildFailures.byCategory)
      .sort((left, right) => right[1] - left[1]);
    items = categories.length
      ? categories.map(([category, count]) => item('error', formatCategory(category), String(count)))
      : [item('pass', 'No build failures', '0')];
  } else {
    items = buildTokenDetailItems(state);
  }

  await vscode.window.showQuickPick(items, {
    title,
    placeHolder: metricTitle(metric),
    matchOnDescription: false,
    matchOnDetail: false,
  });
}

function buildTokenDetailItems(state: Readonly<DailySprintlyState>): vscode.QuickPickItem[] {
  const items: vscode.QuickPickItem[] = [];
  const claude = state.tokenStats.claudeCode;
  if (claude) {
    items.push(
      item('copilot', 'Claude Code total', formatTokens(totalClaudeTokens(claude)), `Estimated cost ${formatCost(estimateClaudeCost(claude))}`),
      item('arrow-down', 'Claude input', formatTokens(claude.input)),
      item('arrow-up', 'Claude output', formatTokens(claude.output)),
      item('database', 'Claude cache', formatTokens(claude.cacheRead + claude.cacheCreate)),
    );
  }
  if (state.detectedAgents.includes('codex')) {
    items.push(item(
      'terminal',
      'Codex total',
      state.tokenStats.codex === 'unavailable' ? 'Unavailable' : formatTokens(state.tokenStats.codex.total),
    ));
  }
  const copilot = state.tokenStats.githubCopilot;
  if (copilot) {
    items.push(
      item('github', 'GitHub Copilot total', formatTokens(copilot.input + copilot.output), `${formatCredits(copilot.credits)} used`),
      item('arrow-down', 'Copilot input', formatTokens(copilot.input)),
      item('arrow-up', 'Copilot output', formatTokens(copilot.output)),
    );
  } else if (state.detectedAgents.includes('github-copilot')) {
    items.push(item('github', 'GitHub Copilot total', 'Unavailable'));
  }
  return items.length ? items : [item('circle-slash', 'No token usage captured', 'Unavailable')];
}

function runPanelAction(action: PanelAction): void {
  const commands: Record<PanelAction, string> = {
    start: 'sprintly.startSession',
    pause: 'sprintly.pauseSession',
    resume: 'sprintly.resumeSession',
    stop: 'sprintly.stopSession',
    reset: 'sprintly.resetSession',
    settings: 'workbench.action.openSettings',
  };
  const args = action === 'settings' ? ['sprintly'] : [];
  void vscode.commands.executeCommand(commands[action], ...args);
}

function separator(label: string): SessionPanelItem {
  return { label, kind: vscode.QuickPickItemKind.Separator, alwaysShow: true };
}

function item(
  icon: string,
  label: string,
  description?: string,
  detail?: string,
): SessionPanelItem {
  return { label: `$(${icon}) ${label}`, description, detail, alwaysShow: true };
}

function metricItem(
  icon: string,
  label: string,
  description: string,
  metric: MetricDetail,
): SessionPanelItem {
  return { ...item(icon, label, description), metric };
}

function actionItem(
  icon: string,
  label: string,
  detail: string | undefined,
  action: PanelAction,
): SessionPanelItem {
  return { ...item(icon, label, undefined, detail), action };
}

function panelPlaceholder(status: SessionPanelSummary['status']): string {
  if (status === 'In progress') {
    return 'Sprint in progress · Select a metric or control';
  }
  if (status === 'Paused') {
    return 'Sprint paused · Resume when ready';
  }
  if (status === 'Completed') {
    return 'Review your latest sprint or start another';
  }
  return 'Start a sprint to begin tracking';
}

function statusIcon(status: SessionPanelSummary['status']): string {
  if (status === 'In progress') return 'debug-start';
  if (status === 'Paused') return 'debug-pause';
  if (status === 'Completed') return 'history';
  return 'circle-outline';
}

function metricTitle(metric: MetricDetail): string {
  const titles: Record<MetricDetail, string> = {
    coding: 'Coding split',
    prompts: 'Agent prompts',
    failures: 'Build failures',
    tokens: 'Token usage',
  };
  return titles[metric];
}

function describeAgentPrompts(state: Readonly<DailySprintlyState>): string {
  const total = state.agentPrompts.claudeCode
    + state.agentPrompts.codex
    + state.agentPrompts.githubCopilot;
  if (!state.session.id) return 'Start a sprint to begin counting';
  if (total === 0) return '0 total';
  const agents = [
    `Claude ${state.agentPrompts.claudeCode}`,
    `Codex ${state.agentPrompts.codex}`,
  ];
  if (state.agentPrompts.githubCopilot > 0 || state.detectedAgents.includes('github-copilot')) {
    agents.push(`Copilot ${state.agentPrompts.githubCopilot}`);
  }
  return `${total} total · ${agents.join(' · ')}`;
}

function describeFailures(state: Readonly<DailySprintlyState>): string {
  if (!state.session.id) return 'No session data';
  const top = Object.entries(state.buildFailures.byCategory)
    .sort((left, right) => right[1] - left[1])[0];
  return top
    ? `${state.buildFailures.total} total · ${formatCategory(top[0])} ${top[1]}`
    : '0 total';
}

function describeTokenUsage(state: Readonly<DailySprintlyState>): string {
  if (!state.session.id) return 'Start a sprint to begin counting';
  const parts: string[] = [];
  const claude = state.tokenStats.claudeCode;
  if (claude) {
    parts.push(`Claude ${formatTokens(totalClaudeTokens(claude))}`);
  }
  if (state.detectedAgents.includes('codex')) {
    parts.push(state.tokenStats.codex === 'unavailable'
      ? 'Codex unavailable'
      : `Codex ${formatTokens(state.tokenStats.codex.total)}`);
  }
  const copilot = state.tokenStats.githubCopilot;
  if (copilot) {
    parts.push(`Copilot ${formatTokens(copilot.input + copilot.output)}`);
  } else if (state.detectedAgents.includes('github-copilot')) {
    parts.push('Copilot unavailable');
  }
  return parts.length ? parts.join(' · ') : 'No token usage captured';
}

function calculateStoredDuration(state: Readonly<DailySprintlyState>): number {
  const { startedAt, endedAt, pauses } = state.session;
  if (startedAt === null) return 0;
  const end = endedAt ?? Date.now();
  const pausedMs = pauses.reduce((total, pause) => {
    const pauseEnd = pause.endedAt ?? end;
    return total + Math.max(0, pauseEnd - pause.startedAt);
  }, 0);
  return Math.max(0, end - startedAt - pausedMs);
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${clock}` : clock;
}

function formatCompactDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0 ? `${hours}h ${totalMinutes % 60}m` : `${totalMinutes}m`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `~${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `~${(tokens / 1_000).toFixed(1)}K`;
  return `~${Math.round(tokens)}`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
}

function formatCredits(credits: number): string {
  return `${credits} Copilot credit${credits === 1 ? '' : 's'}`;
}

function totalClaudeTokens(
  tokens: NonNullable<DailySprintlyState['tokenStats']['claudeCode']>,
): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreate;
}

function formatCategory(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
