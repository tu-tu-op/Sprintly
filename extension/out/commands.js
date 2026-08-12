"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
exports.showStatusPanel = showStatusPanel;
const vscode = require("vscode");
const statusBar_1 = require("./statusBar");
const consentFlow_1 = require("./consentFlow");
const pricing_1 = require("./tracking/pricing");
function registerCommands(context, tracker, statusBar, dailyStore, agentLogWatcher) {
    const refresh = () => statusBar.update();
    const start = async () => {
        await agentLogWatcher.scanNow();
        dailyStore.startSession();
        tracker.start();
        refresh();
        vscode.window.showInformationMessage('Sprintly session started.');
    };
    const pause = async () => {
        await agentLogWatcher.scanNow();
        dailyStore.pauseSession();
        tracker.pause();
        refresh();
    };
    const resume = async () => {
        await agentLogWatcher.scanNow();
        dailyStore.resumeSession();
        tracker.resume();
        refresh();
    };
    const stop = async () => {
        const s = tracker.get();
        await agentLogWatcher.scanNow();
        dailyStore.stopSession();
        tracker.stop();
        refresh();
        vscode.window.showInformationMessage(`Sprintly session ended: ${s.fileEdits} edits · ${Math.floor(s.durationSeconds / 60)}m`);
    };
    const reset = async () => {
        await agentLogWatcher.scanNow();
        dailyStore.resetSession();
        tracker.reset();
        refresh();
    };
    context.subscriptions.push(vscode.commands.registerCommand('sprintly.startSession', () => (0, consentFlow_1.runConsentFlow)(start)), vscode.commands.registerCommand('sprintly.stopSession', stop), vscode.commands.registerCommand('sprintly.pauseSession', pause), vscode.commands.registerCommand('sprintly.resumeSession', resume), vscode.commands.registerCommand('sprintly.resetSession', reset), vscode.commands.registerCommand('sprintly.showStatusPanel', () => showStatusPanel(tracker, dailyStore)));
}
async function showStatusPanel(tracker, dailyStore) {
    const s = tracker.get();
    let daily = dailyStore.get();
    const mm = String(Math.floor(s.durationSeconds / 60)).padStart(2, '0');
    const ss = String(s.durationSeconds % 60).padStart(2, '0');
    const dur = `${mm}:${ss}`;
    // Activity progress bar
    const editPct = Math.min(100, Math.round((s.fileEdits / 100) * 100));
    const editBar = (0, statusBar_1.makeProgressBar)(editPct);
    // ── Create QuickPick ────────────────────────────────────────────────────────
    const qp = vscode.window.createQuickPick();
    qp.title = '$(pulse) Sprintly';
    qp.placeholder = '';
    qp.ignoreFocusOut = false; // dismiss on click-away, like Copilot's card
    qp.matchOnDescription = false; // never filter rows as user types
    qp.matchOnDetail = false;
    // ── Header buttons (Copilot-style gear + refresh) ──────────────────────────
    qp.buttons = [
        { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Refresh Stats' },
        { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Open Settings' },
    ];
    qp.onDidTriggerButton(btn => {
        const id = btn.iconPath.id;
        if (id === 'refresh') {
            // Re-open with fresh data
            qp.hide();
            vscode.commands.executeCommand('sprintly.showStatusPanel');
        }
        else if (id === 'settings-gear') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
        }
        qp.hide();
    });
    // ── Items ──────────────────────────────────────────────────────────────────
    const buildItems = () => [
        // ── Status section ───────────────────────────────────────────────────────
        { label: 'Status', kind: vscode.QuickPickItemKind.Separator, alwaysShow: true },
        {
            label: '$(record) Session',
            description: !s.isRecording ? 'Idle'
                : s.isPaused ? `Paused — ${dur}`
                    : `Active — ${dur}`,
            alwaysShow: true,
        },
        {
            label: '$(edit) Edits',
            description: `${s.fileEdits}`,
            detail: s.isRecording
                ? `${editBar}  ${editPct}% activity`
                : undefined,
            alwaysShow: true,
        },
        {
            label: '$(save) Saves',
            description: `${s.fileSaves}`,
            alwaysShow: true,
        },
        {
            label: '$(files) Files touched',
            description: `${s.activeFiles.size}`,
            alwaysShow: true,
        },
        {
            label: '$(list-ordered) Lines changed',
            description: `${s.linesChanged}`,
            alwaysShow: true,
        },
        {
            label: '$(terminal) Terminal opens',
            description: `${s.terminalCommands}`,
            alwaysShow: true,
        },
        {
            label: '$(sparkle) Archetype',
            description: tracker.archetype(),
            alwaysShow: true,
        },
        {
            label: '$(code) Session coding split',
            description: `Hard ${formatDailyDuration(daily.session.hardcodeMs)} · Vibe ${formatDailyDuration(daily.session.vibecodeMs)}`,
            trackingDetail: 'session',
            alwaysShow: true,
        },
        {
            label: '$(copilot) Agent prompts this session',
            description: describeAgentPrompts(daily),
            trackingDetail: 'prompts',
            alwaysShow: true,
        },
        {
            label: '$(error) Build failures this session',
            description: describeFailures(daily),
            trackingDetail: 'failures',
            alwaysShow: true,
        },
        {
            label: '$(symbol-numeric) Token estimate this session',
            description: describeTokenEstimate(daily),
            trackingDetail: 'tokens',
            alwaysShow: true,
        },
        // ── Options section — all existing commands ───────────────────────────────
        { label: 'Options', kind: vscode.QuickPickItemKind.Separator, alwaysShow: true },
        {
            label: '$(play) Start Session',
            alwaysShow: true,
        },
        {
            label: '$(debug-pause) Pause Session',
            alwaysShow: true,
        },
        {
            label: '$(debug-continue) Resume Session',
            alwaysShow: true,
        },
        {
            label: '$(stop-circle) Stop Session',
            alwaysShow: true,
        },
        {
            label: '$(refresh) Reset Session',
            alwaysShow: true,
        },
        // ── Actions section ───────────────────────────────────────────────────────
        { label: 'Actions', kind: vscode.QuickPickItemKind.Separator, alwaysShow: true },
        {
            label: '$(settings-gear) Open Settings',
            alwaysShow: true,
        },
    ];
    qp.items = buildItems();
    // ── Routing ─────────────────────────────────────────────────────────────────
    qp.onDidAccept(() => {
        const selected = qp.selectedItems[0];
        if (!selected) {
            qp.hide();
            return;
        }
        if (selected.trackingDetail) {
            const detail = selected.trackingDetail;
            qp.hide();
            void showTrackingDetail(detail, dailyStore.get());
            return;
        }
        const label = selected.label;
        if (label.includes('Start Session')) {
            vscode.commands.executeCommand('sprintly.startSession');
        }
        else if (label.includes('Pause Session')) {
            vscode.commands.executeCommand('sprintly.pauseSession');
        }
        else if (label.includes('Resume Session')) {
            vscode.commands.executeCommand('sprintly.resumeSession');
        }
        else if (label.includes('Stop Session')) {
            vscode.commands.executeCommand('sprintly.stopSession');
        }
        else if (label.includes('Reset Session')) {
            vscode.commands.executeCommand('sprintly.resetSession');
        }
        else if (label.includes('Open Settings')) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
        }
        qp.hide();
    });
    const dailySubscription = dailyStore.onDidUpdate((next) => {
        daily = next;
        qp.items = buildItems();
    });
    qp.onDidHide(() => {
        dailySubscription.dispose();
        qp.dispose();
    });
    qp.show();
}
async function showTrackingDetail(detail, daily) {
    let title;
    let items;
    if (detail === 'session') {
        title = sessionDetailTitle(daily, 'Coding Split');
        items = [
            { label: '$(code) Hardcode', description: formatDailyDuration(daily.session.hardcodeMs) },
            { label: '$(sparkle) Vibecode', description: formatDailyDuration(daily.session.vibecodeMs) },
        ];
    }
    else if (detail === 'prompts') {
        title = sessionDetailTitle(daily, 'Agent Prompts');
        items = daily.detectedAgents.map((agent) => agent === 'claude-code'
            ? { label: '$(copilot) Claude Code', description: String(daily.agentPrompts.claudeCode) }
            : { label: '$(terminal) Codex', description: String(daily.agentPrompts.codex) });
        if (items.length === 0) {
            items = [{ label: '$(search) Detecting local agent logs', description: sessionEmptyLabel(daily) }];
        }
    }
    else if (detail === 'failures') {
        title = sessionDetailTitle(daily, 'Build Failures');
        const categories = Object.entries(daily.buildFailures.byCategory)
            .sort((left, right) => right[1] - left[1]);
        items = categories.length > 0
            ? categories.map(([category, count]) => ({
                label: `$(error) ${formatCategory(category)}`,
                description: String(count),
            }))
            : [{ label: '$(check) No failures', description: '0' }];
    }
    else {
        title = sessionDetailTitle(daily, 'Token Estimate');
        const claude = daily.tokenStats.claudeCode;
        items = [];
        if (daily.detectedAgents.includes('claude-code')) {
            items.push(...(claude
                ? [
                    {
                        label: '$(copilot) Claude total (est.)',
                        description: `${formatTokens(totalClaudeTokens(claude))} · est. ${formatCost((0, pricing_1.estimateClaudeCost)(claude))}`,
                    },
                    { label: '  Claude input (est.)', description: formatTokens(claude.input) },
                    { label: '  Claude output (est.)', description: formatTokens(claude.output) },
                    { label: '  Claude cache read (est.)', description: formatTokens(claude.cacheRead) },
                    { label: '  Claude cache create (est.)', description: formatTokens(claude.cacheCreate) },
                ]
                : [{ label: '$(copilot) Claude tokens (est.)', description: '—' }]));
        }
        if (daily.detectedAgents.includes('codex')) {
            items.push({
                label: '$(terminal) Codex tokens (est.)',
                description: daily.tokenStats.codex === 'unavailable'
                    ? '—'
                    : formatTokens(daily.tokenStats.codex.total),
            });
        }
        if (items.length === 0) {
            items = [{
                    label: '$(search) Detecting token estimate source',
                    description: `${sessionEmptyLabel(daily)} · est. unavailable`,
                }];
        }
    }
    await vscode.window.showQuickPick(items, {
        title,
        placeHolder: '',
        matchOnDescription: false,
        matchOnDetail: false,
    });
}
function describeFailures(daily) {
    const top = Object.entries(daily.buildFailures.byCategory)
        .sort((left, right) => right[1] - left[1])[0];
    return top
        ? `${daily.buildFailures.total} · Top: ${formatCategory(top[0])} ${top[1]}`
        : '0 · No failures';
}
function describeAgentPrompts(daily) {
    const agents = daily.detectedAgents.map((agent) => agent === 'claude-code'
        ? `Claude ${daily.agentPrompts.claudeCode}`
        : `Codex ${daily.agentPrompts.codex}`);
    if (agents.length === 0) {
        return daily.session.id ? 'No agent prompts yet' : 'Start a session to begin counting';
    }
    const total = daily.agentPrompts.claudeCode + daily.agentPrompts.codex;
    return `${total} total · ${agents.join(' · ')}`;
}
function describeTokenEstimate(daily) {
    const agents = [];
    if (daily.detectedAgents.includes('claude-code')) {
        const claude = daily.tokenStats.claudeCode;
        agents.push(claude
            ? `Claude ${formatTokens(totalClaudeTokens(claude))} · est. ${formatCost((0, pricing_1.estimateClaudeCost)(claude))}`
            : 'Claude — (est.)');
    }
    if (daily.detectedAgents.includes('codex')) {
        agents.push(daily.tokenStats.codex === 'unavailable'
            ? 'Codex — (est.)'
            : `Codex ${formatTokens(daily.tokenStats.codex.total)} (est.)`);
    }
    return agents.length > 0
        ? agents.join(' · ')
        : daily.session.id
            ? 'No token usage yet · est. unavailable'
            : 'Start a session to begin counting';
}
function sessionDetailTitle(state, detail) {
    const scope = state.session.isActive ? 'Current Session' : 'Last Session';
    return `Sprintly · ${scope} · ${detail}`;
}
function sessionEmptyLabel(state) {
    return state.session.id ? 'No agent detected in this session' : 'No Sprintly session yet';
}
function totalClaudeTokens(tokens) {
    return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreate;
}
function formatDailyDuration(milliseconds) {
    const totalMinutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function formatTokens(tokens) {
    if (tokens >= 1000000) {
        return `~${(tokens / 1000000).toFixed(1)}M tokens`;
    }
    if (tokens >= 1000) {
        return `~${(tokens / 1000).toFixed(1)}K tokens`;
    }
    return `~${Math.round(tokens)} tokens`;
}
function formatCost(cost) {
    return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
}
function formatCategory(category) {
    return category.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
//# sourceMappingURL=commands.js.map