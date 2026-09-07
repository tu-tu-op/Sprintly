import * as vscode from 'vscode';
import { SessionStats, SessionTracker } from '../sessionTracker';
import { DailySprintlyState, DailyStateStore } from '../tracking/dailyStateStore';
import { estimateClaudeCost } from '../tracking/pricing';
import {
  calculateDeveloperMetrics,
  deriveDeveloperProfile,
  DeveloperMetricInput,
} from '../tracking/developerMetrics';
import { getPrivacySettings } from '../tracking/privacySettings';
import { LocalSessionStore, SessionHistoryRecord } from '../tracking/localSessionStore';
import type { SprintlySyncService, SprintlySyncStatus } from '../integration/sprintlySync';

export const SESSION_PANEL_COMMAND = 'sprintly.showStatusPanel';

type MetricDetail = 'coding' | 'prompts' | 'failures' | 'tokens' | 'history';
type PanelAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'reset'
  | 'settings'
  | 'viewWebsite'
  | 'syncCurrent'
  | 'syncPending'
  | 'connectExtension'
  | 'enterPairingCode'
  | 'migrateLocalSessions'
  | 'clearSyncQueue'
  | 'disconnect'
  | 'connectAutomatic'
  | 'connectManual'
  | 'testConnection'
  | 'viewSyncStatus';

interface SessionPanelItem extends vscode.QuickPickItem {
  metric?: MetricDetail;
  action?: PanelAction;
}

export interface SessionPanelSummary {
  scope: 'Current session' | 'Last session' | 'No session';
  status: 'In progress' | 'Paused' | 'Completed' | 'Ready';
  duration: string;
  codingSplit: string;
  archetype: string;
  metricSummary: string;
  promptUsage: string;
  tokenUsage: string;
  buildFailures: string;
}

export async function showStatusPanel(
  tracker: SessionTracker,
  sessionStore: DailyStateStore,
  historyStore?: LocalSessionStore,
  syncService?: SprintlySyncService,
): Promise<void> {
  let trackerStats = tracker.get();
  let sessionState = sessionStore.get();
  const quickPick = vscode.window.createQuickPick<SessionPanelItem>();

  // Canonical hydration: after a reload the volatile tracker is blank while a
  // finalized record exists. The panel then renders that record instead of
  // hiding activity or recomputing signals from zeroed counters.
  const latestRecord = (): SessionHistoryRecord | null => {
    if (trackerStats.isRecording || !historyStore) {
      return null;
    }
    const currentId = sessionState.session.id;
    return (currentId ? historyStore.get(currentId) : null) ?? historyStore.list()[0] ?? null;
  };

  quickPick.ignoreFocusOut = false;
  quickPick.matchOnDescription = false;
  quickPick.matchOnDetail = false;
  quickPick.buttons = [
    { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Refresh' },
    { iconPath: new vscode.ThemeIcon('globe'), tooltip: 'View session report' },
    { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Settings' },
  ];

  const render = (): void => {
    const summary = buildSessionPanelSummary(trackerStats, sessionState, latestRecord());
    quickPick.title = `$(pulse) Sprintly · ${summary.scope}`;
    quickPick.placeholder = panelPlaceholder(summary.status);
    quickPick.items = buildPanelItems(
      tracker,
      trackerStats,
      sessionState,
      summary,
      historyStore,
      latestRecord(),
      syncService?.getStatus(),
    );
  };

  const trackerSubscription = tracker.onDidUpdate.event((next) => {
    trackerStats = next;
    render();
  });
  const storeSubscription = sessionStore.onDidUpdate((next) => {
    sessionState = next;
    render();
  });
  const syncSubscription = syncService?.onDidChange(render) ?? { dispose: () => undefined };

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
      return;
    }
    if (icon === 'globe') {
      quickPick.hide();
      void vscode.commands.executeCommand('sprintly.connectWebsite');
    }
  });

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (!selected) {
      return;
    }
    quickPick.hide();
    if (selected.metric) {
      void showMetricDetail(selected.metric, sessionStore.get(), historyStore, latestRecord());
      return;
    }
    if (selected.action) {
      runPanelAction(selected.action);
    }
  });

  quickPick.onDidHide(() => {
    trackerSubscription.dispose();
    storeSubscription.dispose();
    syncSubscription.dispose();
    quickPick.dispose();
  });

  render();
  quickPick.show();
}

export function buildSessionPanelSummary(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): SessionPanelSummary {
  const hasSession = state.session.id !== null;
  const isActive = trackerStats.isRecording && state.session.isActive;
  const scope = isActive ? 'Current session' : hasSession ? 'Last session' : 'No session';
  const status = isActive
    ? trackerStats.isPaused ? 'Paused' : 'In progress'
    : hasSession ? 'Completed' : 'Ready';
  // Live sessions use the tracker clock; a stored session uses its finalized
  // record so durations never disagree between panel and history.
  const durationMs = trackerStats.startedAt && isActive
    ? trackerStats.durationSeconds * 1_000
    : record?.activeDurationMs ?? calculateStoredDuration(state);

  const metricsInput = record && !isActive
    ? metricInputFromRecord(record, durationMs)
    : buildMetricInput(trackerStats, state, durationMs);
  const profile = deriveDeveloperProfile(metricsInput);
  const metrics = calculateDeveloperMetrics(metricsInput);
  const coding = getCodingTotals(state, record);
  const privacy = getPrivacySettings();
  return {
    scope,
    status,
    duration: formatClock(durationMs),
    codingSplit: describeCodingSplit(coding),
    archetype: profile.primary,
    metricSummary: `Focus ${metrics.focusScore} · Switches ${metrics.contextSwitches} · Tests ${metrics.testingDiscipline}% · AI ${metrics.aiBalance}%`,
    promptUsage: privacy.aiTrackingVisible ? describeAgentPrompts(state, record) : 'Hidden by privacy setting',
    tokenUsage: privacy.aiTrackingVisible ? describeTokenUsage(state, record) : 'Hidden by privacy setting',
    buildFailures: describeFailures(state, record),
  };
}

export function buildPanelItems(
  tracker: SessionTracker,
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  summary: SessionPanelSummary,
  historyStore?: LocalSessionStore,
  record?: SessionHistoryRecord | null,
  syncStatus?: SprintlySyncStatus,
): SessionPanelItem[] {
  const items: SessionPanelItem[] = [
    separator('SESSION'),
    item(statusIcon(summary.status), summary.status, summary.duration,
      state.session.id ? 'Recording state and elapsed session time' : 'Start a sprint when you are ready.'),
    actionItem(
      'globe',
      'View Session Report',
      'Open the detailed session report in your browser',
      'viewWebsite',
    ),
  ];

  if (state.session.id) {
    items.push(
      item('code', 'Coding style', summary.codingSplit, `${summary.archetype} · ${summary.metricSummary}`),
    );
  }

  // Keep the website bridge near the top of the Quick Panel. Connection
  // actions used to be appended after all metrics, which made them easy to
  // miss and, in the default local-only state, looked like they were absent.
  if (syncStatus) {
    items.push(...buildWebsiteSyncItems(syncStatus, record));
  }

  // Activity rows render from the live tracker during a session and from the
  // finalized record afterwards, instead of disappearing after a reload.
  if (trackerStats.isRecording && trackerStats.startedAt) {
    items.push(
      separator('ACTIVITY'),
      item('edit', 'Edits', String(trackerStats.fileEdits), `${trackerStats.linesChanged} lines changed`),
      item(
        'files',
        'Files touched',
        String(trackerStats.activeFiles.size),
        describeTerminalActivity(trackerStats),
      ),
    );
  } else if (record) {
    items.push(
      separator('ACTIVITY'),
      item('edit', 'Edits', String(record.edits), `${record.linesChanged} lines changed`),
      item(
        'files',
        'Files touched',
        String(record.filesTouched),
        describeRecordTerminalActivity(record),
      ),
    );
  }

  items.push(
    separator('AGENT USAGE'),
    metricItem('copilot', 'Prompts', summary.promptUsage, 'prompts'),
    metricItem('symbol-numeric', 'Tokens', summary.tokenUsage, 'tokens'),
    separator('RELIABILITY'),
    metricItem('error', 'Failed executions', summary.buildFailures, 'failures'),
    metricItem('code', 'Coding split details', summary.codingSplit, 'coding'),
    item('pulse', 'Developer signals', summary.metricSummary, 'Explainable estimates from this session'),
    separator('CONTROLS'),
    ...buildControlItems(trackerStats, state),
  );

  if (historyStore) {
    const history = historyStore.getAggregates('all');
    const controlCount = buildControlItems(trackerStats, state).length;
    items.splice(
      items.length - controlCount,
      0,
      separator('LOCAL HISTORY'),
      metricItem(
        'history',
        'Session history',
        `${history.sessions} completed · ${formatCompactDuration(history.codingTimeMs)} coding`,
        'history',
      ),
    );
  }

  return items;
}

function buildWebsiteSyncItems(
  syncStatus: SprintlySyncStatus,
  record?: SessionHistoryRecord | null,
): SessionPanelItem[] {
  const rejectedCount = syncStatus.rejectedCount ?? syncStatus.failedCount;
  const connectionDescription = syncStatus.connectionStatus === 'connected'
    ? `${syncStatus.pendingCount} pending · ${rejectedCount} rejected`
    : `${syncStatus.pendingCount} pending · ${rejectedCount} rejected · reconnect required`;
  const connectionDetail = [
    syncStatus.environment,
    syncStatus.syncPreference,
    syncStatus.localOnly ? 'local-only' : null,
    syncStatus.syncEnabled === false ? 'extension sync disabled' : null,
    syncStatus.syncDisabled ? 'website sync disabled' : null,
  ].filter((part): part is string => part !== null).join(' · ');
  const needsPairing = syncStatus.connectionStatus !== 'connected' || syncStatus.pairingRequired;
  const authenticated = syncStatus.connectionStatus === 'connected' && !syncStatus.pairingRequired;

  return [
    separator('WEBSITE CONNECTION'),
    item(
      authenticated ? 'cloud' : 'cloud-offline',
      authenticated
        ? 'Website connected'
        : syncStatus.connectionStatus === 'connected' ? 'Website reachable · pairing required' : 'Website disconnected',
      connectionDescription,
      connectionDetail,
    ),
    syncStatus.lastSuccessfulSync
      ? item('check', 'Last successful sync', new Date(syncStatus.lastSuccessfulSync).toLocaleString())
      : item('clock', 'Last successful sync', 'Never'),
    ...(syncStatus.lastSyncError
      ? [item('warning', 'Last sync error', syncStatus.lastSyncError)]
      : []),
    ...(needsPairing
      ? [
        actionItem('globe', 'Connect Automatically', 'Open Sprintly Settings and complete browser handoff', 'connectAutomatic'),
        actionItem('key', 'Connect Manually', 'Enter the one-time pairing code from Sprintly Settings', 'connectManual'),
      ]
      : []),
    ...(record
      ? [actionItem('cloud-upload', 'Sync Selected Session', 'Upload this completed session now', 'syncCurrent')]
      : []),
    actionItem('cloud-upload', 'Sync Pending Sessions', 'Retry queued and failed sessions', 'syncPending'),
    actionItem('archive', 'Migrate Local Sessions', 'Explicitly upload completed local history', 'migrateLocalSessions'),
    ...(syncStatus.pendingCount > 0 || rejectedCount > 0
      ? [actionItem('trash', 'Clear Local Sync Queue', 'Remove pending and rejected upload records', 'clearSyncQueue')]
      : []),
    actionItem('plug', 'Test Connection', `Check ${syncStatus.apiUrl}`, 'testConnection'),
    actionItem('info', 'View Sync Status', 'Show connection and queue details', 'viewSyncStatus'),
    ...(authenticated
      ? [actionItem('sign-out', 'Disconnect Extension', 'Revoke local token and stop uploads', 'disconnect')]
      : []),
  ];
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
  historyStore?: LocalSessionStore,
  record?: SessionHistoryRecord | null,
): Promise<void> {
  const title = `Sprintly · ${state.session.isActive ? 'Current session' : 'Last session'}`;
  let items: vscode.QuickPickItem[];

  if (metric === 'coding') {
    const coding = getCodingTotals(state, record);
    items = [
      item('edit', 'Manual keystrokes', formatCompactDuration(coding.manualMs)),
      // No provider-attribution integration exists yet, so AI time only shows
      // when it was actually observed; it is never inferred from edit shape.
      item('copilot', 'AI-assisted', coding.aiAssistedMs > 0
        ? formatCompactDuration(coding.aiAssistedMs)
        : 'Not observed'),
      item('wand', 'Automation', coding.automationMs > 0
        ? formatCompactDuration(coding.automationMs)
        : 'Not observed'),
      item(
        'question',
        'Unattributed bulk',
        `${formatCompactDuration(coding.unknownBulkMs)} · edits of unknown origin`,
      ),
    ];
  } else if (metric === 'prompts') {
    if (!getPrivacySettings().aiTrackingVisible) {
      items = [item('eye-closed', 'AI usage hidden', 'Enable telemetry.showAiTracking to view it')];
    } else {
      const prompts = record?.agentPrompts ?? state.agentPrompts;
      items = [
        item('copilot', 'Claude Code', String(prompts.claudeCode)),
        item('terminal', 'Codex', String(prompts.codex)),
        item('github', 'GitHub Copilot', String(prompts.githubCopilot)),
      ];
    }
  } else if (metric === 'failures') {
    const failures = record?.buildFailures ?? state.buildFailures;
    const categories = Object.entries(failures.byCategory)
      .sort((left, right) => right[1] - left[1]);
    items = categories.length
      ? categories.map(([category, count]) => item('error', formatCategory(category), String(count)))
      : [item('pass', 'No failed executions', '0')];
  } else if (metric === 'tokens') {
    items = getPrivacySettings().aiTrackingVisible
      ? buildTokenDetailItems(state, record)
      : [item('eye-closed', 'AI usage hidden', 'Enable telemetry.showAiTracking to view it')];
  } else {
    const history = historyStore?.getAggregates('all');
    items = history
      ? [
        item('history', 'Completed sessions', String(history.sessions)),
        item('clock', 'Total coding time', formatCompactDuration(history.codingTimeMs)),
        item('pulse', 'Current streak', `${history.currentStreak} day${history.currentStreak === 1 ? '' : 's'}`),
        item('star-full', 'Developer score', String(history.devScore), 'Version 1 deterministic score'),
        item('trophy', 'Personal best', formatCompactDuration(history.personalRecords.longestSessionMs), 'Longest active session'),
      ]
      : [item('history', 'Local history unavailable')];
  }

  await vscode.window.showQuickPick(items, {
    title,
    placeHolder: metricTitle(metric),
    matchOnDescription: false,
    matchOnDetail: false,
  });
}

function buildTokenDetailItems(
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): vscode.QuickPickItem[] {
  const tokenStats = record?.tokenStats ?? state.tokenStats;
  const detectedAgents = record
    ? (state.detectedAgents.length ? state.detectedAgents : [])
    : state.detectedAgents;
  const items: vscode.QuickPickItem[] = [];
  const claude = tokenStats.claudeCode;
  if (claude) {
    items.push(
      item('copilot', 'Claude Code total', formatTokens(totalClaudeTokens(claude)), `Estimated cost ${formatCost(estimateClaudeCost(claude))}`),
      item('arrow-down', 'Claude input', formatTokens(claude.input)),
      item('arrow-up', 'Claude output', formatTokens(claude.output)),
      item('database', 'Claude cache', formatTokens(claude.cacheRead + claude.cacheCreate)),
    );
  }
  if (detectedAgents.includes('codex') || (tokenStats.codex !== 'unavailable' && tokenStats.codex.total > 0)) {
    items.push(item(
      'terminal',
      'Codex total',
      tokenStats.codex === 'unavailable' ? 'Unavailable' : formatTokens(tokenStats.codex.total),
    ));
  }
  const copilot = tokenStats.githubCopilot;
  if (copilot) {
    items.push(
      item('github', 'GitHub Copilot total', formatTokens(copilot.input + copilot.output), `${formatCredits(copilot.credits)} used`),
      item('arrow-down', 'Copilot input', formatTokens(copilot.input)),
      item('arrow-up', 'Copilot output', formatTokens(copilot.output)),
    );
  } else if (detectedAgents.includes('github-copilot')) {
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
    viewWebsite: 'sprintly.connectWebsite',
    syncCurrent: 'sprintly.syncCurrentSession',
    syncPending: 'sprintly.syncPendingSessions',
    connectExtension: 'sprintly.connectExtension',
    enterPairingCode: 'sprintly.enterPairingCode',
    migrateLocalSessions: 'sprintly.migrateLocalSessions',
    clearSyncQueue: 'sprintly.clearSyncQueue',
    disconnect: 'sprintly.disconnect',
    connectAutomatic: 'sprintly.connectAutomatically',
    connectManual: 'sprintly.connectManually',
    testConnection: 'sprintly.testConnection',
    viewSyncStatus: 'sprintly.viewSyncStatus',
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
    history: 'Local session history',
  };
  return titles[metric];
}

function describeAgentPrompts(
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): string {
  const prompts = record?.agentPrompts ?? state.agentPrompts;
  const detected = state.detectedAgents;
  const total = prompts.claudeCode + prompts.codex + prompts.githubCopilot;
  if (!state.session.id) return 'Start a sprint to begin counting';
  if (total === 0) return '0 total';
  const agents = [
    `Claude ${prompts.claudeCode}`,
    `Codex ${prompts.codex}`,
  ];
  if (prompts.githubCopilot > 0 || detected.includes('github-copilot')) {
    agents.push(`Copilot ${prompts.githubCopilot}`);
  }
  return `${total} total · ${agents.join(' · ')}`;
}

function describeFailures(
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): string {
  if (!state.session.id) return 'No session data';
  const failures = record?.buildFailures ?? state.buildFailures;
  const top = Object.entries(failures.byCategory)
    .sort((left, right) => right[1] - left[1])[0];
  if (!top) return '0 total';
  // Honest wording: these are failed terminal executions, and a recovery is
  // only counted when the same tool family later succeeded.
  const recovery = failures.total > 0 && failures.recoveredFailures > 0
    ? ` · recovered (same tool family) ${failures.recoveredFailures}`
    : '';
  const streak = failures.failureStreak > 1
    ? ` · ${failures.failureStreak} failure streak`
    : '';
  return `${failures.total} total · ${formatCategory(top[0])} ${top[1]}${recovery}${streak}`;
}

function describeCodingSplit(coding: {
  manualMs: number;
  aiAssistedMs: number;
  automationMs: number;
  unknownBulkMs: number;
}): string {
  return [
    `Manual keystrokes ${formatCompactDuration(coding.manualMs)}`,
    coding.aiAssistedMs > 0 ? `AI-assisted ${formatCompactDuration(coding.aiAssistedMs)}` : null,
    coding.automationMs > 0 ? `Automation ${formatCompactDuration(coding.automationMs)}` : null,
    `Unattributed ${formatCompactDuration(coding.unknownBulkMs)}`,
  ].filter((part): part is string => part !== null).join(' · ');
}

function getCodingTotals(
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): {
  manualMs: number;
  aiAssistedMs: number;
  automationMs: number;
  unknownBulkMs: number;
} {
  if (record) {
    return { ...record.coding };
  }
  return {
    manualMs: state.session.manualMs ?? state.session.hardcodeMs ?? 0,
    aiAssistedMs: state.session.aiAssistedMs ?? state.session.vibecodeMs ?? 0,
    automationMs: state.session.automationMs ?? 0,
    unknownBulkMs: state.session.unknownBulkMs ?? 0,
  };
}

function metricInputFromRecord(
  record: SessionHistoryRecord,
  durationMs: number,
): DeveloperMetricInput {
  return {
    sessionDurationMs: Math.max(durationMs, record.activeDurationMs),
    coding: record.coding,
    fileEdits: record.edits,
    fileSaves: record.fileSaves,
    fileSwitches: record.fileSwitches,
    terminalCommands: record.terminalCommands,
    terminalCommandsByCategory: record.terminalCommandsByCategory,
    failures: record.buildFailures.total,
    recoveredFailures: record.buildFailures.recoveredFailures,
    successfulRuns: record.buildFailures.successfulRuns,
  };
}

function describeRecordTerminalActivity(record: SessionHistoryRecord): string {
  const categories = Object.entries(record.terminalCommandsByCategory ?? {})
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${formatCategory(category)} ${count}`)
    .join(' · ');
  return `${record.fileSaves} saves · ${record.terminalCommands} commands · `
    + `${record.terminalOpens} terminal opens${categories ? ` · ${categories}` : ''}`;
}

function buildMetricInput(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  durationMs: number,
): DeveloperMetricInput {
  return {
    sessionDurationMs: durationMs,
    coding: getCodingTotals(state),
    fileEdits: trackerStats.fileEdits,
    fileSaves: trackerStats.fileSaves,
    fileSwitches: trackerStats.fileSwitches,
    terminalCommands: trackerStats.terminalCommands ?? 0,
    terminalCommandsByCategory: trackerStats.terminalCommandsByCategory,
    failures: state.buildFailures.total,
    recoveredFailures: state.buildFailures.recoveredFailures ?? 0,
    successfulRuns: state.buildFailures.successfulRuns ?? 0,
  };
}

function describeTerminalActivity(stats: Readonly<SessionStats>): string {
  const opens = stats.terminalOpens ?? 0;
  const commands = stats.terminalCommands ?? 0;
  const categories = Object.entries(stats.terminalCommandsByCategory ?? {})
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${formatCategory(category)} ${count}`)
    .join(' · ');
  return `${stats.fileSaves} saves · ${commands} commands · ${opens} terminal opens${categories ? ` · ${categories}` : ''}`;
}

function describeTokenUsage(
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): string {
  if (!state.session.id) return 'Start a sprint to begin counting';
  const tokenStats = record?.tokenStats ?? state.tokenStats;
  const detected = state.detectedAgents;
  const parts: string[] = [];
  const claude = tokenStats.claudeCode;
  if (claude) {
    parts.push(`Claude ${formatTokens(totalClaudeTokens(claude))}`);
  }
  if (detected.includes('codex') || (tokenStats.codex !== 'unavailable' && tokenStats.codex.total > 0)) {
    parts.push(tokenStats.codex === 'unavailable'
      ? 'Codex unavailable'
      : `Codex ${formatTokens(tokenStats.codex.total)}`);
  }
  const copilot = tokenStats.githubCopilot;
  if (copilot) {
    parts.push(`Copilot ${formatTokens(copilot.input + copilot.output)}`);
  } else if (detected.includes('github-copilot')) {
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
