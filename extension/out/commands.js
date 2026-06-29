"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
exports.showStatusPanel = showStatusPanel;
const vscode = require("vscode");
const statusBar_1 = require("./statusBar");
const consentFlow_1 = require("./consentFlow");
const pricing_1 = require("./tracking/pricing");
function registerCommands(context, tracker, statusBar, dailyStore) {
    const refresh = () => statusBar.update();
    const start = () => {
        tracker.start();
        refresh();
        vscode.window.showInformationMessage('🏃 Sprintly — Session started!');
    };
    const pause = () => { tracker.pause(); refresh(); };
    const resume = () => { tracker.resume(); refresh(); };
    const stop = () => {
        const s = tracker.get();
        tracker.stop();
        refresh();
        vscode.window.showInformationMessage(`✅ Sprintly — Session ended. ${s.fileEdits} edits · ${Math.floor(s.durationSeconds / 60)}m`);
    };
    const reset = () => { tracker.reset(); refresh(); };
    context.subscriptions.push(vscode.commands.registerCommand('sprintly.startSession', () => (0, consentFlow_1.runConsentFlow)(context, start)), vscode.commands.registerCommand('sprintly.stopSession', stop), vscode.commands.registerCommand('sprintly.pauseSession', pause), vscode.commands.registerCommand('sprintly.resumeSession', resume), vscode.commands.registerCommand('sprintly.resetSession', reset), vscode.commands.registerCommand('sprintly.showStatusPanel', () => showStatusPanel(tracker, dailyStore)));
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
            label: '$(code) Session split today',
            description: `Hard ${formatDailyDuration(daily.session.hardcodeMs)} · Vibe ${formatDailyDuration(daily.session.vibecodeMs)}`,
            trackingDetail: 'session',
            alwaysShow: true,
        },
        {
            label: '$(copilot) Agent prompts today',
            description: describeAgentPrompts(daily),
            trackingDetail: 'prompts',
            alwaysShow: true,
        },
        {
            label: '$(error) Build failures today',
            description: describeFailures(daily),
            trackingDetail: 'failures',
            alwaysShow: true,
        },
        {
            label: '$(symbol-numeric) Token estimate today',
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
        title = 'Sprintly · Session Split Today';
        items = [
            { label: '$(code) Hardcode', description: formatDailyDuration(daily.session.hardcodeMs) },
            { label: '$(sparkle) Vibecode', description: formatDailyDuration(daily.session.vibecodeMs) },
        ];
    }
    else if (detail === 'prompts') {
        title = 'Sprintly · Agent Prompts Today';
        items = daily.detectedAgents.map((agent) => agent === 'claude-code'
            ? { label: '$(copilot) Claude Code', description: String(daily.agentPrompts.claudeCode) }
            : { label: '$(terminal) Codex', description: String(daily.agentPrompts.codex) });
        if (items.length === 0) {
            items = [{ label: '$(search) Detecting local agent logs', description: 'No agent detected today' }];
        }
    }
    else if (detail === 'failures') {
        title = 'Sprintly · Build Failures Today';
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
        title = 'Sprintly · Token Estimate Today';
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
                    description: 'No agent detected today · est. unavailable',
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
    return agents.length > 0 ? agents.join(' · ') : 'Detecting local agent logs…';
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
    return agents.length > 0 ? agents.join(' · ') : 'Detecting agent logs · est. unavailable';
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