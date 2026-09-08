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

type PanelView =
  | 'main'
  | 'session'
  | 'activity'
  | 'coding'
  | 'agents'
  | 'reliability'
  | 'history'
  | 'sync';

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
  view?: PanelView;
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
  focusScore: number;
  contextSwitches: number;
  shippingActivity: number;
  testingDiscipline: number;
  aiBalance: number;
  recoveryRate: number;
}

interface ActivitySnapshot {
  edits: number;
  linesChanged: number;
  fileSaves: number;
  fileSwitches: number;
  filesTouched: number;
  terminalOpens: number;
  terminalCommands: number;
  terminalCommandsByCategory: Record<string, number>;
}

export async function showStatusPanel(
  tracker: SessionTracker,
  sessionStore: DailyStateStore,
  historyStore?: LocalSessionStore,
  syncService?: SprintlySyncService,
): Promise<void> {
  let trackerStats = tracker.get();
  let sessionState = sessionStore.get();
  let activeView: PanelView = 'main';
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
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.keepScrollPosition = true;

  const render = (): void => {
    const record = latestRecord();
    const summary = buildSessionPanelSummary(trackerStats, sessionState, record);
    quickPick.title = panelTitle(activeView);
    quickPick.placeholder = panelPlaceholder(activeView, summary.status);
    quickPick.buttons = panelButtons(activeView);
    quickPick.items = buildPanelViewItems(
      activeView,
      tracker,
      trackerStats,
      sessionState,
      summary,
      historyStore,
      record,
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
    if (button === vscode.QuickInputButtons.Back) {
      activeView = 'main';
      quickPick.value = '';
      render();
      return;
    }
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
    if (selected.view) {
      activeView = selected.view;
      quickPick.value = '';
      render();
      return;
    }
    if (selected.action) {
      quickPick.hide();
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
    focusScore: metrics.focusScore,
    contextSwitches: metrics.contextSwitches,
    shippingActivity: metrics.shippingActivity,
    testingDiscipline: metrics.testingDiscipline,
    aiBalance: metrics.aiBalance,
    recoveryRate: metrics.recoveryRate,
  };
}

function buildPanelViewItems(
  view: PanelView,
  tracker: SessionTracker,
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  summary: SessionPanelSummary,
  historyStore?: LocalSessionStore,
  record?: SessionHistoryRecord | null,
  syncStatus?: SprintlySyncStatus,
): SessionPanelItem[] {
  if (view === 'session') return buildSessionItems(trackerStats, state, summary);
  if (view === 'activity') return buildActivityItems(trackerStats, state, record);
  if (view === 'coding') return buildCodingItems(state, record);
  if (view === 'agents') return buildAgentItems(state, record);
  if (view === 'reliability') return buildReliabilityItems(state, summary, record);
  if (view === 'history') return buildHistoryItems(historyStore);
  if (view === 'sync') return syncStatus
    ? buildWebsiteSyncItems(syncStatus, record)
    : [item('cloud-offline', 'Website sync unavailable', 'Open Settings to review the connection'), actionItem('settings-gear', 'Open Settings', undefined, 'settings')];
  return buildPanelItems(tracker, trackerStats, state, summary, historyStore, record, syncStatus);
}

export function buildPanelItems(
  _tracker: SessionTracker,
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  summary: SessionPanelSummary,
  historyStore?: LocalSessionStore,
  record?: SessionHistoryRecord | null,
  syncStatus?: SprintlySyncStatus,
): SessionPanelItem[] {
  const activity = getActivitySnapshot(trackerStats, record);
  const coding = getCodingTotals(state, record);
  const failures = record?.buildFailures ?? state.buildFailures;
  const items: SessionPanelItem[] = [
    separator('Session'),
    routeItem(
      statusIcon(summary.status),
      sessionRowLabel(summary),
      `${summary.status} · ${summary.duration}`,
      state.session.id
        ? `${makeProgressBar(summary.focusScore)}  Focus ${safePercent(summary.focusScore)}/100 · ${summary.archetype}`
        : 'Private, workspace-local tracking until you choose to sync',
      'session',
    ),
    separator('Insights'),
    routeItem('edit', 'Activity', describeActivityOverview(activity, state.session.id !== null), undefined, 'activity'),
    routeItem('code', 'Coding mix', describeCodingOverview(coding), undefined, 'coding'),
    routeItem('copilot', 'AI tools', describeAgentOverview(state, summary, record), undefined, 'agents'),
    routeItem('shield', 'Reliability', describeReliabilityOverview(failures, state.session.id !== null), undefined, 'reliability'),
  ];

  if (historyStore) {
    const history = historyStore.getAggregates('all');
    items.push(
      separator('Workspace'),
      routeItem(
        'history',
        'History',
        history.sessions
          ? `${plural(history.sessions, 'sprint')} · ${history.currentStreak} day streak · ${history.devScore} score`
          : 'No completed sprints yet',
        undefined,
        'history',
      ),
    );
  }

  if (syncStatus) {
    if (!historyStore) items.push(separator('Workspace'));
    items.push(routeItem('cloud', 'Website & sync', describeConnectionOverview(syncStatus), undefined, 'sync'));
  }

  items.push(
    separator('Actions'),
    ...buildControlItems(trackerStats, state),
    actionItem('globe', 'Open Sprintly report', 'View the detailed report in your browser', 'viewWebsite'),
    actionItem('settings-gear', 'Open Settings', 'Tracking, privacy, and sync preferences', 'settings'),
  );

  return items;
}

export function buildWebsiteSyncItems(
  syncStatus: SprintlySyncStatus,
  record?: SessionHistoryRecord | null,
): SessionPanelItem[] {
  const rejectedCount = syncStatus.rejectedCount ?? syncStatus.failedCount;
  const needsPairing = syncStatus.connectionStatus !== 'connected' || syncStatus.pairingRequired;
  const authenticated = syncStatus.connectionStatus === 'connected' && !syncStatus.pairingRequired;
  const items: SessionPanelItem[] = [
    separator('Connection'),
    item(
      authenticated ? 'cloud' : 'cloud-offline',
      authenticated ? 'Sprintly website connected' : needsPairing ? 'Pairing required' : 'Website disconnected',
      describeConnectionState(syncStatus),
      `${syncStatus.environment} · ${syncStatus.apiUrl}`,
    ),
    item(
      'database',
      'Upload mode',
      uploadModeLabel(syncStatus),
      syncStatus.localOnly
        ? 'Sessions stay in this workspace unless you explicitly choose a sync action.'
        : 'Only validated aggregate session data is eligible for upload.',
    ),
    item(
      'sync',
      'Sync queue',
      `${plural(syncStatus.pendingCount, 'pending item')} · ${plural(rejectedCount, 'rejected item')}`,
    ),
    syncStatus.lastSuccessfulSync
      ? item('check', 'Last successful sync', new Date(syncStatus.lastSuccessfulSync).toLocaleString())
      : item('clock', 'Last successful sync', 'Never'),
    ...(syncStatus.lastSyncError
      ? [item('warning', 'Last sync error', syncStatus.lastSyncError)]
      : []),
  ];

  if (needsPairing) {
    items.push(
      separator('Connect'),
        actionItem('globe', 'Connect Automatically', 'Open Sprintly Settings and complete browser handoff', 'connectAutomatic'),
        actionItem('key', 'Connect Manually', 'Enter the one-time pairing code from Sprintly Settings', 'connectManual'),
    );
  }

  items.push(separator('Sync'));
  if (record) {
    items.push(actionItem('cloud-upload', 'Sync Selected Session', 'Upload this completed session now', 'syncCurrent'));
  }
  items.push(
    actionItem('cloud-upload', 'Sync Pending Sessions', 'Retry queued and failed sessions', 'syncPending'),
    actionItem('archive', 'Migrate Local Sessions', 'Explicitly upload completed local history', 'migrateLocalSessions'),
  );
  if (syncStatus.pendingCount > 0 || rejectedCount > 0) {
    items.push(actionItem('trash', 'Clear Local Sync Queue', 'Remove pending and rejected upload records', 'clearSyncQueue'));
  }
  items.push(
    separator('Tools'),
    actionItem('plug', 'Test Connection', `Check ${syncStatus.apiUrl}`, 'testConnection'),
    actionItem('info', 'View Sync Status', 'Show connection and queue details', 'viewSyncStatus'),
  );
  if (authenticated) {
    items.push(actionItem('sign-out', 'Disconnect Extension', 'Revoke local token and stop uploads', 'disconnect'));
  }
  return items;
}

function buildControlItems(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  includeReset = false,
): SessionPanelItem[] {
  if (!trackerStats.isRecording) {
    return [
      actionItem('play', 'Start Sprint', 'Begin a new tracked session', 'start'),
      ...(includeReset && state.session.id
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

function buildSessionItems(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  summary: SessionPanelSummary,
): SessionPanelItem[] {
  return [
    separator(summary.scope),
    item(statusIcon(summary.status), 'Status', summary.status),
    item('clock', 'Elapsed time', summary.duration),
    scoreItem('target', 'Focus score', summary.focusScore, 'Engaged coding time within the session'),
    item('account', 'Developer style', summary.archetype, summary.metricSummary),
    separator('Signals'),
    item('git-compare', 'Context switches', String(summary.contextSwitches)),
    scoreItem('beaker', 'Testing discipline', summary.testingDiscipline, 'Share of terminal work used for validation'),
    scoreItem('rocket', 'Shipping activity', summary.shippingActivity, 'Successful runs and Git activity'),
    scoreItem('sparkle', 'AI balance', summary.aiBalance, 'Explicitly attributed AI-assisted coding'),
    separator('Actions'),
    ...buildControlItems(trackerStats, state, true),
    actionItem('globe', 'Open Sprintly report', 'View this sprint in your browser', 'viewWebsite'),
  ];
}

function buildActivityItems(
  trackerStats: Readonly<SessionStats>,
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): SessionPanelItem[] {
  if (!state.session.id) {
    return [
      separator('Activity'),
      item('circle-outline', 'No activity yet', 'Start a sprint to begin tracking'),
      separator('Actions'),
      actionItem('play', 'Start Sprint', 'Begin a new tracked session', 'start'),
    ];
  }
  const activity = getActivitySnapshot(trackerStats, record);
  const categoryItems = Object.entries(activity.terminalCommandsByCategory)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([category, count]) => item('terminal', formatCategory(category), String(count)));
  return [
    separator('Editing'),
    item('edit', 'Edits', String(activity.edits)),
    item('list-ordered', 'Lines changed', String(activity.linesChanged), 'Estimate includes inserted and structurally removed lines'),
    item('files', 'Files touched', String(activity.filesTouched)),
    item('save', 'Saves', String(activity.fileSaves)),
    item('git-compare', 'File switches', String(activity.fileSwitches)),
    separator('Terminal'),
    item('terminal', 'Commands', String(activity.terminalCommands)),
    item('add', 'Terminal opens', String(activity.terminalOpens)),
    ...(categoryItems.length ? categoryItems : [item('circle-outline', 'No command categories captured', '0')]),
  ];
}

function buildCodingItems(
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): SessionPanelItem[] {
  const coding = getCodingTotals(state, record);
  const total = coding.manualMs + coding.aiAssistedMs + coding.automationMs + coding.unknownBulkMs;
  return [
    separator('Coding time'),
    item('clock', 'Tracked coding time', formatCompactDuration(total)),
    codingItem('edit', 'Manual keystrokes', coding.manualMs, total, 'Direct typing observed by VS Code'),
    codingItem('copilot', 'AI-assisted', coding.aiAssistedMs, total, 'Only explicitly attributed assistance'),
    codingItem('wand', 'Automation', coding.automationMs, total, 'Only explicitly attributed automation'),
    codingItem('question', 'Unattributed bulk', coding.unknownBulkMs, total, 'Bulk edits whose authoring source VS Code cannot identify'),
  ];
}

function buildAgentItems(
  state: Readonly<DailySprintlyState>,
  record?: SessionHistoryRecord | null,
): SessionPanelItem[] {
  if (!getPrivacySettings().aiTrackingVisible) {
    return [
      separator('AI tools'),
      item('eye-closed', 'AI insights are hidden', 'Enable “Show AI tracking” to view aggregate usage'),
      separator('Actions'),
      actionItem('settings-gear', 'Open Settings', 'Review AI tracking visibility', 'settings'),
    ];
  }
  const prompts = record?.agentPrompts ?? state.agentPrompts;
  return [
    separator('Prompts'),
    item('copilot', 'Claude Code', plural(prompts.claudeCode, 'prompt')),
    item('terminal', 'Codex', plural(prompts.codex, 'prompt')),
    item('github', 'GitHub Copilot', plural(prompts.githubCopilot, 'prompt')),
    separator('Token usage'),
    ...buildTokenDetailItems(state, record),
    separator('Privacy'),
    item('shield', 'Prompt content', 'Never collected', 'Sprintly stores aggregate counts only'),
  ];
}

function buildReliabilityItems(
  state: Readonly<DailySprintlyState>,
  summary: SessionPanelSummary,
  record?: SessionHistoryRecord | null,
): SessionPanelItem[] {
  const failures = record?.buildFailures ?? state.buildFailures;
  const categories = Object.entries(failures.byCategory)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([category, count]) => item('error', formatCategory(category), String(count)));
  return [
    separator('Reliability'),
    item(
      failures.total ? 'warning' : 'pass-filled',
      failures.total ? plural(failures.total, 'failed execution') : 'Clean run',
      failures.total ? `${plural(failures.recoveredFailures, 'recovery')}` : 'No failures captured',
    ),
    item('check-all', 'Successful runs', String(failures.successfulRuns ?? 0)),
    scoreItem(
      'refresh',
      'Recovery rate',
      summary.recoveryRate,
      failures.total ? `${failures.recoveredFailures ?? 0} of ${failures.total} recovered in the same tool family` : 'No recovery needed',
    ),
    scoreItem('beaker', 'Testing discipline', summary.testingDiscipline, 'Build, test, and lint commands'),
    item('flame', 'Longest failure streak', String(failures.maxFailureStreak ?? failures.failureStreak ?? 0)),
    separator('Failure categories'),
    ...(categories.length ? categories : [item('pass', 'No failure categories', '0')]),
  ];
}

function buildHistoryItems(historyStore?: LocalSessionStore): SessionPanelItem[] {
  const history = historyStore?.getAggregates('all');
  if (!history) return [separator('History'), item('history', 'Local history unavailable')];
  return [
    separator('All time'),
    item('history', 'Completed sprints', String(history.sessions)),
    item('clock', 'Total coding time', formatCompactDuration(history.codingTimeMs)),
    item('pulse', 'Current streak', plural(history.currentStreak, 'day')),
    item('calendar', 'Longest streak', plural(history.longestStreak, 'day')),
    scoreItem('star-full', 'Developer score', history.devScore, 'Deterministic local score'),
    scoreItem('target', 'Average focus', history.averageFocusScore, 'Across completed sprints'),
    item('trophy', 'Personal best', formatCompactDuration(history.personalRecords.longestSessionMs), 'Longest active sprint'),
    separator('Actions'),
    actionItem('globe', 'Open Sprintly report', 'Explore your full history in the browser', 'viewWebsite'),
  ];
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
  return { label, kind: vscode.QuickPickItemKind.Separator };
}

function item(
  icon: string,
  label: string,
  description?: string,
  detail?: string,
): SessionPanelItem {
  return { label: `$(${icon}) ${label}`, description, detail };
}

function routeItem(
  icon: string,
  label: string,
  description: string | undefined,
  detail: string | undefined,
  view: PanelView,
): SessionPanelItem {
  const suffix = '$(chevron-right)';
  return { ...item(icon, label, description ? `${description}  ${suffix}` : suffix, detail), view };
}

function actionItem(
  icon: string,
  label: string,
  detail: string | undefined,
  action: PanelAction,
): SessionPanelItem {
  return { ...item(icon, label, detail), action };
}

function panelTitle(view: PanelView): string {
  return view === 'main' ? '$(pulse) Sprintly' : `$(pulse) Sprintly · ${viewLabel(view)}`;
}

function panelPlaceholder(view: PanelView, status: SessionPanelSummary['status']): string {
  if (view !== 'main') return `Search ${viewLabel(view).toLowerCase()}`;
  if (status === 'In progress') {
    return 'Search current sprint metrics and actions';
  }
  if (status === 'Paused') {
    return 'Sprint paused · Search metrics and actions';
  }
  if (status === 'Completed') {
    return 'Search the latest sprint and workspace actions';
  }
  return 'Search Sprintly metrics and actions';
}

function panelButtons(view: PanelView): vscode.QuickInputButton[] {
  return [
    ...(view === 'main' ? [] : [vscode.QuickInputButtons.Back]),
    { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Refresh' },
    { iconPath: new vscode.ThemeIcon('globe'), tooltip: 'Open Sprintly report' },
    { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Open Settings' },
  ];
}

function viewLabel(view: PanelView): string {
  const labels: Record<PanelView, string> = {
    main: 'Overview',
    session: 'Session',
    activity: 'Activity',
    coding: 'Coding mix',
    agents: 'AI tools',
    reliability: 'Reliability',
    history: 'History',
    sync: 'Website & sync',
  };
  return labels[view];
}

function statusIcon(status: SessionPanelSummary['status']): string {
  if (status === 'In progress') return 'debug-start';
  if (status === 'Paused') return 'debug-pause';
  if (status === 'Completed') return 'history';
  return 'circle-outline';
}

function sessionRowLabel(summary: SessionPanelSummary): string {
  if (summary.scope === 'Current session') return 'Current sprint';
  if (summary.scope === 'Last session') return 'Last sprint';
  return 'Ready to sprint';
}

function scoreItem(
  icon: string,
  label: string,
  score: number,
  detail: string,
): SessionPanelItem {
  const value = safePercent(score);
  return item(icon, label, `${value} / 100`, `${makeProgressBar(value)}  ${detail}`);
}

function codingItem(
  icon: string,
  label: string,
  durationMs: number,
  totalMs: number,
  detail: string,
): SessionPanelItem {
  const share = totalMs > 0 ? safePercent((durationMs / totalMs) * 100) : 0;
  const value = durationMs > 0 ? formatCompactDuration(durationMs) : 'Not observed';
  return item(icon, label, `${value} · ${share}%`, `${makeProgressBar(share)}  ${detail}`);
}

export function makeProgressBar(value: number, length = 10): string {
  const safeValue = safePercent(value);
  const safeLength = Math.max(1, Math.floor(length));
  const filled = Math.round((safeValue / 100) * safeLength);
  return '█'.repeat(filled) + '░'.repeat(safeLength - filled);
}

function safePercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function plural(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

function describeActivityOverview(activity: ActivitySnapshot, hasSession: boolean): string {
  if (!hasSession) return 'No session data';
  return `${plural(activity.edits, 'edit')} · ${plural(activity.filesTouched, 'file')} · ${plural(activity.linesChanged, 'line')}`;
}

function describeCodingOverview(coding: ReturnType<typeof getCodingTotals>): string {
  const entries = [
    ['Manual', coding.manualMs],
    ['AI-assisted', coding.aiAssistedMs],
    ['Automation', coding.automationMs],
    ['Unattributed', coding.unknownBulkMs],
  ] as const;
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return 'No engaged coding time yet';
  const dominant = entries.reduce((best, current) => current[1] > best[1] ? current : best);
  return `${dominant[0]} ${safePercent((dominant[1] / total) * 100)}% · ${formatCompactDuration(total)} tracked`;
}

function describeAgentOverview(
  state: Readonly<DailySprintlyState>,
  summary: SessionPanelSummary,
  record?: SessionHistoryRecord | null,
): string {
  if (!state.session.id) return 'No session data';
  if (!getPrivacySettings().aiTrackingVisible) return 'Hidden in privacy settings';
  const prompts = record?.agentPrompts ?? state.agentPrompts;
  const total = prompts.claudeCode + prompts.codex + prompts.githubCopilot;
  const tokens = summary.tokenUsage === 'No token usage captured' ? 'tokens unavailable' : summary.tokenUsage;
  return `${plural(total, 'prompt')} · ${tokens}`;
}

function describeReliabilityOverview(
  failures: Readonly<DailySprintlyState['buildFailures']>,
  hasSession: boolean,
): string {
  if (!hasSession) return 'No session data';
  if (!failures.total) return `Clean run · ${plural(failures.successfulRuns ?? 0, 'successful execution')}`;
  return `${plural(failures.total, 'failure')} · ${plural(failures.recoveredFailures ?? 0, 'recovery')}`;
}

function describeConnectionOverview(status: SprintlySyncStatus): string {
  const rejected = status.rejectedCount ?? status.failedCount;
  let connection = 'Disconnected';
  if (status.connectionStatus === 'connected' && !status.pairingRequired) {
    connection = status.localOnly ? 'Connected · Local only' : `Connected · ${uploadModeLabel(status)}`;
  } else if (status.connectionStatus === 'revoked') {
    connection = 'Reconnect required';
  } else if (status.pairingRequired) {
    connection = 'Pairing required';
  }
  const queued = status.pendingCount + rejected;
  return queued ? `${connection} · ${plural(queued, 'queued item')}` : connection;
}

function describeConnectionState(status: SprintlySyncStatus): string {
  if (status.syncDisabled) return 'Website sync disabled by account settings';
  if (status.syncEnabled === false) return 'Extension sync disabled';
  if (status.pairingRequired) return 'Pair this extension to authorize uploads';
  return status.connectionStatus === 'connected' ? 'Connection healthy' : 'Reconnect to use website sync';
}

function uploadModeLabel(status: SprintlySyncStatus): string {
  if (status.syncEnabled === false || status.syncDisabled || status.syncPreference === 'never') return 'Local only';
  if (status.syncPreference === 'selected') return 'Selected sprints';
  if (status.syncPreference === 'completed') return 'Completed sprints';
  return 'Leaderboard aggregates';
}

function getActivitySnapshot(
  trackerStats: Readonly<SessionStats>,
  record?: SessionHistoryRecord | null,
): ActivitySnapshot {
  if (!trackerStats.isRecording && record) {
    return {
      edits: record.edits,
      linesChanged: record.linesChanged,
      fileSaves: record.fileSaves,
      fileSwitches: record.fileSwitches,
      filesTouched: record.filesTouched,
      terminalOpens: record.terminalOpens,
      terminalCommands: record.terminalCommands,
      terminalCommandsByCategory: { ...record.terminalCommandsByCategory },
    };
  }
  return {
    edits: trackerStats.fileEdits,
    linesChanged: trackerStats.linesChanged,
    fileSaves: trackerStats.fileSaves,
    fileSwitches: trackerStats.fileSwitches,
    filesTouched: trackerStats.activeFiles.size,
    terminalOpens: trackerStats.terminalOpens ?? 0,
    terminalCommands: trackerStats.terminalCommands ?? 0,
    terminalCommandsByCategory: { ...(trackerStats.terminalCommandsByCategory ?? {}) },
  };
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
