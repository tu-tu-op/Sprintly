"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_PANEL_COMMAND = void 0;
exports.showStatusPanel = showStatusPanel;
exports.buildSessionPanelSummary = buildSessionPanelSummary;
const vscode = require("vscode");
const pricing_1 = require("../tracking/pricing");
const developerMetrics_1 = require("../tracking/developerMetrics");
const privacySettings_1 = require("../tracking/privacySettings");
exports.SESSION_PANEL_COMMAND = 'sprintly.showStatusPanel';
async function showStatusPanel(tracker, sessionStore) {
    let trackerStats = tracker.get();
    let sessionState = sessionStore.get();
    const quickPick = vscode.window.createQuickPick();
    quickPick.ignoreFocusOut = false;
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;
    quickPick.buttons = [
        { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Refresh' },
        { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Settings' },
    ];
    const render = () => {
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
function buildSessionPanelSummary(trackerStats, state) {
    const hasSession = state.session.id !== null;
    const isActive = trackerStats.isRecording && state.session.isActive;
    const scope = isActive ? 'Current session' : hasSession ? 'Last session' : 'No session';
    const status = isActive
        ? trackerStats.isPaused ? 'Paused' : 'In progress'
        : hasSession ? 'Completed' : 'Ready';
    const durationMs = trackerStats.startedAt
        ? trackerStats.durationSeconds * 1000
        : calculateStoredDuration(state);
    const profile = (0, developerMetrics_1.deriveDeveloperProfile)(buildMetricInput(trackerStats, state, durationMs));
    const metrics = (0, developerMetrics_1.calculateDeveloperMetrics)(buildMetricInput(trackerStats, state, durationMs));
    const privacy = (0, privacySettings_1.getPrivacySettings)();
    return {
        scope,
        status,
        duration: formatClock(durationMs),
        codingSplit: describeCodingSplit(state),
        archetype: profile.primary,
        metricSummary: `Focus ${metrics.focusScore} · Switches ${metrics.contextSwitches} · Tests ${metrics.testingDiscipline}% · AI ${metrics.aiBalance}%`,
        promptUsage: privacy.aiTrackingVisible ? describeAgentPrompts(state) : 'Hidden by privacy setting',
        tokenUsage: privacy.aiTrackingVisible ? describeTokenUsage(state) : 'Hidden by privacy setting',
        buildFailures: describeFailures(state),
    };
}
function buildPanelItems(tracker, trackerStats, state, summary) {
    const items = [
        separator('SESSION'),
        item(statusIcon(summary.status), summary.status, summary.duration, state.session.id ? 'Recording state and elapsed session time' : 'Start a sprint when you are ready.'),
    ];
    if (state.session.id) {
        items.push(item('code', 'Coding style', summary.codingSplit, `${summary.archetype} · ${summary.metricSummary}`));
    }
    if (trackerStats.startedAt) {
        items.push(separator('ACTIVITY'), item('edit', 'Edits', String(trackerStats.fileEdits), `${trackerStats.linesChanged} lines changed`), item('files', 'Files touched', String(trackerStats.activeFiles.size), describeTerminalActivity(trackerStats)));
    }
    items.push(separator('AGENT USAGE'), metricItem('copilot', 'Prompts', summary.promptUsage, 'prompts'), metricItem('symbol-numeric', 'Tokens', summary.tokenUsage, 'tokens'), separator('RELIABILITY'), metricItem('error', 'Build failures', summary.buildFailures, 'failures'), metricItem('code', 'Coding split details', summary.codingSplit, 'coding'), item('pulse', 'Developer signals', summary.metricSummary, 'Explainable estimates from this session'), separator('CONTROLS'), ...buildControlItems(trackerStats, state));
    return items;
}
function buildControlItems(trackerStats, state) {
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
async function showMetricDetail(metric, state) {
    const title = `Sprintly · ${state.session.isActive ? 'Current session' : 'Last session'}`;
    let items;
    if (metric === 'coding') {
        const coding = getCodingTotals(state);
        items = [
            item('edit', 'Manual', formatCompactDuration(coding.manualMs)),
            item('copilot', 'AI-assisted', formatCompactDuration(coding.aiAssistedMs)),
            item('wand', 'Automation', formatCompactDuration(coding.automationMs)),
            item('question', 'Unattributed bulk', formatCompactDuration(coding.unknownBulkMs)),
        ];
    }
    else if (metric === 'prompts') {
        if (!(0, privacySettings_1.getPrivacySettings)().aiTrackingVisible) {
            items = [item('eye-closed', 'AI usage hidden', 'Enable telemetry.showAiTracking to view it')];
        }
        else {
            items = [
                item('copilot', 'Claude Code', String(state.agentPrompts.claudeCode)),
                item('terminal', 'Codex', String(state.agentPrompts.codex)),
                item('github', 'GitHub Copilot', String(state.agentPrompts.githubCopilot)),
            ];
        }
    }
    else if (metric === 'failures') {
        const categories = Object.entries(state.buildFailures.byCategory)
            .sort((left, right) => right[1] - left[1]);
        items = categories.length
            ? categories.map(([category, count]) => item('error', formatCategory(category), String(count)))
            : [item('pass', 'No build failures', '0')];
    }
    else {
        items = (0, privacySettings_1.getPrivacySettings)().aiTrackingVisible
            ? buildTokenDetailItems(state)
            : [item('eye-closed', 'AI usage hidden', 'Enable telemetry.showAiTracking to view it')];
    }
    await vscode.window.showQuickPick(items, {
        title,
        placeHolder: metricTitle(metric),
        matchOnDescription: false,
        matchOnDetail: false,
    });
}
function buildTokenDetailItems(state) {
    const items = [];
    const claude = state.tokenStats.claudeCode;
    if (claude) {
        items.push(item('copilot', 'Claude Code total', formatTokens(totalClaudeTokens(claude)), `Estimated cost ${formatCost((0, pricing_1.estimateClaudeCost)(claude))}`), item('arrow-down', 'Claude input', formatTokens(claude.input)), item('arrow-up', 'Claude output', formatTokens(claude.output)), item('database', 'Claude cache', formatTokens(claude.cacheRead + claude.cacheCreate)));
    }
    if (state.detectedAgents.includes('codex')) {
        items.push(item('terminal', 'Codex total', state.tokenStats.codex === 'unavailable' ? 'Unavailable' : formatTokens(state.tokenStats.codex.total)));
    }
    const copilot = state.tokenStats.githubCopilot;
    if (copilot) {
        items.push(item('github', 'GitHub Copilot total', formatTokens(copilot.input + copilot.output), `${formatCredits(copilot.credits)} used`), item('arrow-down', 'Copilot input', formatTokens(copilot.input)), item('arrow-up', 'Copilot output', formatTokens(copilot.output)));
    }
    else if (state.detectedAgents.includes('github-copilot')) {
        items.push(item('github', 'GitHub Copilot total', 'Unavailable'));
    }
    return items.length ? items : [item('circle-slash', 'No token usage captured', 'Unavailable')];
}
function runPanelAction(action) {
    const commands = {
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
function separator(label) {
    return { label, kind: vscode.QuickPickItemKind.Separator, alwaysShow: true };
}
function item(icon, label, description, detail) {
    return { label: `$(${icon}) ${label}`, description, detail, alwaysShow: true };
}
function metricItem(icon, label, description, metric) {
    return { ...item(icon, label, description), metric };
}
function actionItem(icon, label, detail, action) {
    return { ...item(icon, label, undefined, detail), action };
}
function panelPlaceholder(status) {
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
function statusIcon(status) {
    if (status === 'In progress')
        return 'debug-start';
    if (status === 'Paused')
        return 'debug-pause';
    if (status === 'Completed')
        return 'history';
    return 'circle-outline';
}
function metricTitle(metric) {
    const titles = {
        coding: 'Coding split',
        prompts: 'Agent prompts',
        failures: 'Build failures',
        tokens: 'Token usage',
    };
    return titles[metric];
}
function describeAgentPrompts(state) {
    const total = state.agentPrompts.claudeCode
        + state.agentPrompts.codex
        + state.agentPrompts.githubCopilot;
    if (!state.session.id)
        return 'Start a sprint to begin counting';
    if (total === 0)
        return '0 total';
    const agents = [
        `Claude ${state.agentPrompts.claudeCode}`,
        `Codex ${state.agentPrompts.codex}`,
    ];
    if (state.agentPrompts.githubCopilot > 0 || state.detectedAgents.includes('github-copilot')) {
        agents.push(`Copilot ${state.agentPrompts.githubCopilot}`);
    }
    return `${total} total · ${agents.join(' · ')}`;
}
function describeFailures(state) {
    if (!state.session.id)
        return 'No session data';
    const top = Object.entries(state.buildFailures.byCategory)
        .sort((left, right) => right[1] - left[1])[0];
    if (!top)
        return '0 total';
    const recovery = state.buildFailures.total > 0
        && state.buildFailures.recoveredFailures > 0
        ? ` · Recovery ${Math.round((state.buildFailures.recoveredFailures / state.buildFailures.total) * 100)}%`
        : '';
    const streak = state.buildFailures.failureStreak > 1
        ? ` · ${state.buildFailures.failureStreak} failure streak`
        : '';
    return `${state.buildFailures.total} total · ${formatCategory(top[0])} ${top[1]}${recovery}${streak}`;
}
function describeCodingSplit(state) {
    const coding = getCodingTotals(state);
    return [
        `Manual ${formatCompactDuration(coding.manualMs)}`,
        `AI-assisted ${formatCompactDuration(coding.aiAssistedMs)}`,
        `Automation ${formatCompactDuration(coding.automationMs)}`,
        `Unattributed ${formatCompactDuration(coding.unknownBulkMs)}`,
    ].join(' · ');
}
function getCodingTotals(state) {
    return {
        manualMs: state.session.manualMs ?? state.session.hardcodeMs ?? 0,
        aiAssistedMs: state.session.aiAssistedMs ?? state.session.vibecodeMs ?? 0,
        automationMs: state.session.automationMs ?? 0,
        unknownBulkMs: state.session.unknownBulkMs ?? 0,
    };
}
function buildMetricInput(trackerStats, state, durationMs) {
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
function describeTerminalActivity(stats) {
    const opens = stats.terminalOpens ?? 0;
    const commands = stats.terminalCommands ?? 0;
    const categories = Object.entries(stats.terminalCommandsByCategory ?? {})
        .filter(([, count]) => count > 0)
        .map(([category, count]) => `${formatCategory(category)} ${count}`)
        .join(' · ');
    return `${stats.fileSaves} saves · ${commands} commands · ${opens} terminal opens${categories ? ` · ${categories}` : ''}`;
}
function describeTokenUsage(state) {
    if (!state.session.id)
        return 'Start a sprint to begin counting';
    const parts = [];
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
    }
    else if (state.detectedAgents.includes('github-copilot')) {
        parts.push('Copilot unavailable');
    }
    return parts.length ? parts.join(' · ') : 'No token usage captured';
}
function calculateStoredDuration(state) {
    const { startedAt, endedAt, pauses } = state.session;
    if (startedAt === null)
        return 0;
    const end = endedAt ?? Date.now();
    const pausedMs = pauses.reduce((total, pause) => {
        const pauseEnd = pause.endedAt ?? end;
        return total + Math.max(0, pauseEnd - pause.startedAt);
    }, 0);
    return Math.max(0, end - startedAt - pausedMs);
}
function formatClock(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return hours > 0 ? `${String(hours).padStart(2, '0')}:${clock}` : clock;
}
function formatCompactDuration(milliseconds) {
    const totalMinutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(totalMinutes / 60);
    return hours > 0 ? `${hours}h ${totalMinutes % 60}m` : `${totalMinutes}m`;
}
function formatTokens(tokens) {
    if (tokens >= 1000000)
        return `~${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000)
        return `~${(tokens / 1000).toFixed(1)}K`;
    return `~${Math.round(tokens)}`;
}
function formatCost(cost) {
    return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
}
function formatCredits(credits) {
    return `${credits} Copilot credit${credits === 1 ? '' : 's'}`;
}
function totalClaudeTokens(tokens) {
    return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreate;
}
function formatCategory(category) {
    return category.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
//# sourceMappingURL=sessionQuickPick.js.map