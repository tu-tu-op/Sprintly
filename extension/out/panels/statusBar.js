"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStatusBar = initStatusBar;
exports.buildStatusBarPresentation = buildStatusBarPresentation;
const vscode = require("vscode");
const sessionQuickPick_1 = require("./sessionQuickPick");
function initStatusBar(context, tracker, sessionStore) {
    const item = vscode.window.createStatusBarItem('sprintly.statusbar', vscode.StatusBarAlignment.Left, 100);
    const controller = new SprintlyPanelStatusBar(item, tracker, sessionStore);
    item.name = 'Sprintly';
    item.command = sessionQuickPick_1.SESSION_PANEL_COMMAND;
    item.show();
    controller.update();
    context.subscriptions.push(controller, tracker.onDidUpdate.event(() => controller.update()), sessionStore.onDidUpdate(() => controller.update()));
    return controller;
}
function buildStatusBarPresentation(trackerStats, state) {
    const summary = (0, sessionQuickPick_1.buildSessionPanelSummary)(trackerStats, state);
    let text;
    if (summary.status === 'In progress') {
        text = `$(debug-start) Sprintly · ${summary.duration}`;
    }
    else if (summary.status === 'Paused') {
        text = `$(debug-pause) Sprintly · ${summary.duration}`;
    }
    else if (summary.status === 'Completed') {
        text = '$(history) Sprintly · Last sprint';
    }
    else {
        text = '$(circle-outline) Sprintly · Ready';
    }
    return { text, summary };
}
class SprintlyPanelStatusBar {
    constructor(item, tracker, sessionStore) {
        this.item = item;
        this.tracker = tracker;
        this.sessionStore = sessionStore;
    }
    update() {
        try {
            const presentation = buildStatusBarPresentation(this.tracker.get(), this.sessionStore.get());
            this.item.text = presentation.text;
            const nextTooltipFingerprint = buildTooltipFingerprint(presentation.summary);
            if (nextTooltipFingerprint !== this.tooltipFingerprint) {
                this.tooltipFingerprint = nextTooltipFingerprint;
                this.item.tooltip = buildTooltip(presentation.summary);
            }
        }
        catch {
            this.item.text = '$(circle-outline) Sprintly · Ready';
            if (this.tooltipFingerprint !== 'fallback') {
                this.tooltipFingerprint = 'fallback';
                this.item.tooltip = 'Open Sprintly Quick Panel';
            }
        }
    }
    dispose() {
        this.item.dispose();
    }
}
function buildTooltip(summary) {
    const tooltip = new vscode.MarkdownString('', true);
    tooltip.isTrusted = true;
    tooltip.supportThemeIcons = true;
    tooltip.appendMarkdown(`### $(pulse) Sprintly · ${summary.scope}\n\n`);
    const duration = summary.status === 'In progress'
        ? 'Live timer shown in the status bar'
        : `\`${summary.duration}\``;
    tooltip.appendMarkdown(`**${summary.status}** · ${duration}\n\n`);
    tooltip.appendMarkdown(`Coding split: **${summary.codingSplit}**\n\n`);
    tooltip.appendMarkdown(`Agent prompts: **${summary.promptUsage}**\n\n`);
    tooltip.appendMarkdown(`Token usage: **${summary.tokenUsage}**\n\n`);
    tooltip.appendMarkdown(`Build failures: **${summary.buildFailures}**\n\n`);
    tooltip.appendMarkdown(`[Open Quick Panel](command:${sessionQuickPick_1.SESSION_PANEL_COMMAND}) · `
        + '[Settings](command:workbench.action.openSettings?%5B%22sprintly%22%5D)');
    return tooltip;
}
function buildTooltipFingerprint(summary) {
    return JSON.stringify({
        ...summary,
        // The status-bar timer changes every second. Excluding its active duration
        // prevents VS Code from dismissing and recreating an open hover tooltip.
        duration: summary.status === 'In progress' ? 'live' : summary.duration,
    });
}
//# sourceMappingURL=statusBar.js.map