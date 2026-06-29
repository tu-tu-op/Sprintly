"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStatusBar = initStatusBar;
const vscode = require("vscode");
const sprintlyPanels_1 = require("./sprintlyPanels");
const pricing_1 = require("../tracking/pricing");
function initStatusBar(context, tracker, dailyStore) {
    const item = vscode.window.createStatusBarItem('sprintly.statusbar', vscode.StatusBarAlignment.Left, 100);
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
class SprintlyPanelStatusBar {
    constructor(item, tracker, dailyStore) {
        this.item = item;
        this.tracker = tracker;
        this.dailyStore = dailyStore;
    }
    update() {
        try {
            const stats = (0, sprintlyPanels_1.demoStats)();
            const session = this.tracker?.get();
            if (session?.isRecording) {
                const rankArrow = session.isPaused ? '⏸' : '↑';
                this.item.text = `$(debug-start) ${(0, sprintlyPanels_1.formatTimer)(session.durationSeconds * 1000)}  ·  #3 ${rankArrow}`;
            }
            else {
                this.item.text = `$(zap) Sprintly  ·  #${stats.currentRank}`;
            }
            this.item.tooltip = buildTooltip(session?.isRecording ?? false, this.dailyStore?.get());
        }
        catch {
            this.item.text = '$(zap) Sprintly  ·  —';
        }
    }
    dispose() {
        this.item.dispose();
    }
}
function buildTooltip(isActive, daily) {
    const stats = (0, sprintlyPanels_1.demoStats)();
    const tooltip = new vscode.MarkdownString('', true);
    tooltip.isTrusted = true;
    tooltip.supportThemeIcons = true;
    tooltip.appendMarkdown('### $(zap) Sprintly\n\n');
    tooltip.appendMarkdown(`Rank: **#${isActive ? 3 : stats.currentRank}** · Streak: **${stats.streakDays} days**\n\n`);
    const goalCurrent = stats.weeklyGoalCurrent ?? 0;
    const goalMax = stats.weeklyGoalMax ?? 1;
    tooltip.appendMarkdown(`Weekly goal: \`${(0, sprintlyPanels_1.makeProgressBar)(goalCurrent, goalMax)}\` ${goalCurrent}/${goalMax}\n\n`);
    if (isActive) {
        tooltip.appendMarkdown(`Active session: **${(0, sprintlyPanels_1.formatDuration)(6443000)}**\n\n`);
    }
    if (daily) {
        const topFailure = Object.entries(daily.buildFailures.byCategory)
            .sort((left, right) => right[1] - left[1])[0];
        const claude = daily.tokenStats.claudeCode;
        const claudeEstimate = claude
            ? `${formatTokenEstimate(claude.input + claude.output + claude.cacheRead + claude.cacheCreate)} · est. $${(0, pricing_1.estimateClaudeCost)(claude).toFixed(2)}`
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
function formatDailyDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
function formatTokenEstimate(tokens) {
    if (tokens >= 1000000) {
        return `~${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
        return `~${(tokens / 1000).toFixed(1)}K`;
    }
    return `~${Math.round(tokens)}`;
}
function formatFailureCategory(category) {
    return category.replace(/_/g, ' ');
}
//# sourceMappingURL=statusBar.js.map