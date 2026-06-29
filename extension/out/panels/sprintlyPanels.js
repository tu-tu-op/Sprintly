"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeProgressBar = makeProgressBar;
exports.makeStreakDots = makeStreakDots;
exports.formatDuration = formatDuration;
exports.formatTimer = formatTimer;
exports.demoStats = demoStats;
exports.demoSessionData = demoSessionData;
exports.demoLeaderboardData = demoLeaderboardData;
exports.demoHistoryData = demoHistoryData;
exports.demoSessionResult = demoSessionResult;
exports.showOpeningPanel = showOpeningPanel;
exports.showSessionActivePanel = showSessionActivePanel;
exports.showLeaderboardPanel = showLeaderboardPanel;
exports.showHistoryPanel = showHistoryPanel;
exports.showSessionEndPanel = showSessionEndPanel;
exports.showOpeningPanelNav = showOpeningPanelNav;
exports.showSessionActivePanelNav = showSessionActivePanelNav;
exports.showLeaderboardPanelNav = showLeaderboardPanelNav;
exports.showHistoryPanelNav = showHistoryPanelNav;
exports.showSessionEndPanelNav = showSessionEndPanelNav;
const vscode = require("vscode");
const DIVIDER = '────────────────────────────────────────────────';
function makeProgressBar(value, max, length = 10) {
    const safeMax = Math.max(max, 1);
    const ratio = Math.max(0, Math.min(1, value / safeMax));
    const filled = Math.round(ratio * length);
    return `${'█'.repeat(filled)}${'░'.repeat(length - filled)}`;
}
function makeStreakDots(days) {
    return days.map((day) => (day > 0 ? '●' : '○')).join('');
}
function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function formatTimer(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function demoStats() {
    return {
        rankTier: 'GOLD',
        streakDays: 12,
        streakDaysPattern: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
        avgSessionMinutes: 45,
        currentRank: 4,
        rankPercentileLabel: 'Top 12%',
        region: 'Mumbai',
        lastSessionName: 'Deep Work',
        lastSessionDurationMs: 94 * 60000,
        lastSessionAgo: '2 hours ago',
        lastSessionVibePct: 40,
        lastSessionHardPct: 60,
        lastSessionMood: 'Flow State',
        weeklyGoalCurrent: 6,
        weeklyGoalMax: 10,
    };
}
function demoSessionData() {
    return {
        startedAt: new Date(Date.now() - 6443000),
        elapsedMs: 6443000,
        vibePct: 40,
        hardPct: 60,
        buildFails: 7,
        aiPromptsUsed: 34,
        currentRank: 3,
        rankDeltaToday: 1,
        region: 'Mumbai',
        overtakenBy: 'Ahmad',
        overtakenMinutesAgo: 4,
    };
}
function demoLeaderboardData() {
    return {
        scope: 'Region',
        timeframe: 'This Week',
        region: 'Mumbai',
        entries: [
            { rank: 1, name: 'Rahul S.', points: 847 },
            { rank: 2, name: 'Priya M.', points: 791 },
            { rank: 3, name: 'Dev K.', points: 734 },
            { rank: 4, name: 'Ahmad R.', points: 698 },
            { rank: 5, name: 'Nisha T.', points: 654 },
        ],
        currentUser: { rank: 8, name: 'You', points: 521, delta: 2, isCurrentUser: true },
    };
}
function demoHistoryData() {
    return {
        streakDays: 12,
        streakStartLabel: 'Jun 1',
        streakEndLabel: 'Jun 12',
        heatmapWeeks: [
            [1, 1, 1, 1, 1, 0, 1],
            [1, 1, 0, 1, 1, 1, 0],
            [1, 1, 1, 1, 1, 1, 1],
            [0, 0, 1, 1, 0, 0, 0],
            [1, 1, 0, 0, 1, 1, 0],
            [0, 1, 1, 0, 1, 0, 1],
            [1, 0, 1, 1, 1, 0, 0],
            [1, 1, 1, 0, 1, 1, 1],
            [0, 1, 1, 1, 1, 0, 1],
            [1, 1, 1, 1, 1, 0, 1],
        ],
        longestSessionMs: 252 * 60000,
        bestRankAchieved: 1,
        bestRankDetail: 'Set 3 weeks ago · Deep Work marathon',
        cleanDays: 7,
        sessions: [
            { dateLabel: 'Jun 12', sessionName: 'Deep Work', durationMs: 94 * 60000, rank: 3, vibePct: 40, hardPct: 60, mood: 'Flow State' },
            { dateLabel: 'Jun 11', sessionName: 'API Refactor', durationMs: 130 * 60000, rank: 4, vibePct: 20, hardPct: 80, mood: 'Grind' },
            { dateLabel: 'Jun 10', sessionName: 'Bug Hunt', durationMs: 55 * 60000, rank: 6, vibePct: 10, hardPct: 90, mood: 'Rough Day' },
            { dateLabel: 'Jun 9', sessionName: 'Feature Sprint', durationMs: 112 * 60000, rank: 5, vibePct: 55, hardPct: 45, mood: 'Flow State' },
            { dateLabel: 'Jun 8', sessionName: 'Code Review', durationMs: 48 * 60000, rank: 7, vibePct: 35, hardPct: 65, mood: 'Grind' },
            { dateLabel: 'Jun 7', sessionName: 'Refactor Day', durationMs: 102 * 60000, rank: 4, vibePct: 45, hardPct: 55, mood: 'Flow State' },
        ],
    };
}
function demoSessionResult() {
    return {
        durationMs: 6443000,
        mood: 'Flow State',
        vibePct: 40,
        hardPct: 60,
        buildFails: 7,
        aiPromptsUsed: 34,
        finalRank: 3,
        rankDelta: 1,
        bestRankAchieved: 2,
    };
}
async function showOpeningPanel(context, stats = demoStats()) {
    const qp = vscode.window.createQuickPick();
    applyQuickPickBase(qp);
    qp.title = '$(zap) SPRINTLY';
    qp.ignoreFocusOut = false;
    qp.buttons = [
        { iconPath: new vscode.ThemeIcon('trophy'), tooltip: 'Leaderboard' },
        { iconPath: new vscode.ThemeIcon('history'), tooltip: 'History' },
        { iconPath: new vscode.ThemeIcon('settings-gear'), tooltip: 'Settings' },
    ];
    const welcome = () => [
        separator('WELCOME'),
        item('$(person) Ready to sprint?', `${stats.rankTier} RANK`, `Last seen: ${stats.lastSessionName} · ${stats.lastSessionAgo} · ${stats.lastSessionMood}`),
    ];
    const momentum = () => [
        separator('YOUR MOMENTUM'),
        item('⚡ Streak', `${stats.streakDays} days`, `${makeStreakDots(stats.streakDaysPattern)}  ${stats.streakDays} of 14 days active`),
        item('⏱ Avg Session', `${stats.avgSessionMinutes}m`),
        item('❋ Current Rank', `#${stats.currentRank}`, `${stats.rankPercentileLabel} in ${stats.region} this week`),
    ];
    const lastSession = () => [
        separator('LAST SESSION'),
        item(`$(history) ${stats.lastSessionName}`, formatDuration(stats.lastSessionDurationMs), `${stats.lastSessionAgo} · Vibe ${stats.lastSessionVibePct}% · Hard ${stats.lastSessionHardPct}% · ${stats.lastSessionMood}`),
    ];
    const actions = () => [
        separator(),
        item('$(play)     Start New Session'),
        item('$(graph)    View Leaderboard'),
        item('$(calendar) View History'),
    ];
    const timers = [];
    qp.items = welcome();
    qp.show();
    timers.push(setTimeout(() => { qp.items = [...welcome(), ...momentum()]; }, 80));
    timers.push(setTimeout(() => { qp.items = [...welcome(), ...momentum(), ...lastSession()]; }, 160));
    timers.push(setTimeout(() => { qp.items = [...welcome(), ...momentum(), ...lastSession(), ...actions()]; }, 240));
    qp.onDidAccept(() => {
        const label = qp.selectedItems[0]?.label ?? '';
        if (label.includes('Start New Session')) {
            qp.hide();
            runPanel(() => showSessionActivePanel(context, demoSessionData()));
        }
        else if (label.includes('View Leaderboard')) {
            qp.hide();
            runPanel(() => showLeaderboardPanel(context, demoLeaderboardData()));
        }
        else if (label.includes('View History')) {
            qp.hide();
            runPanel(() => showHistoryPanel(context, demoHistoryData()));
        }
    });
    qp.onDidTriggerButton((button) => {
        const id = iconId(button);
        if (id === 'trophy') {
            qp.hide();
            runPanel(() => showLeaderboardPanel(context, demoLeaderboardData()));
        }
        else if (id === 'history') {
            qp.hide();
            runPanel(() => showHistoryPanel(context, demoHistoryData()));
        }
        else if (id === 'settings-gear') {
            qp.hide();
            runCommand('workbench.action.openSettings', 'sprintly');
        }
    });
    qp.onDidHide(() => {
        timers.forEach(clearTimeout);
        qp.dispose();
    });
}
async function showSessionActivePanel(context, sessionData = demoSessionData()) {
    const qp = vscode.window.createQuickPick();
    applyQuickPickBase(qp);
    qp.ignoreFocusOut = true;
    qp.buttons = [
        { iconPath: new vscode.ThemeIcon('debug-pause'), tooltip: 'Pause Session' },
        { iconPath: new vscode.ThemeIcon('target'), tooltip: 'Set a Goal' },
        { iconPath: new vscode.ThemeIcon('stop-circle'), tooltip: 'End Session' },
    ];
    let elapsedMs = sessionData.elapsedMs ?? Math.max(0, Date.now() - sessionData.startedAt.getTime());
    let paused = false;
    let goalText = sessionData.goalText ?? '';
    let keepAliveForInput = false;
    const updateTitle = () => {
        qp.title = paused
            ? `$(debug-pause) PAUSED  ⏸  ${formatTimer(elapsedMs)}`
            : `$(debug-start) SESSION LIVE  ◉  ${formatTimer(elapsedMs)}`;
    };
    const buildItems = () => {
        const rankDelta = sessionData.rankDeltaToday >= 0
            ? `▲ +${sessionData.rankDeltaToday} today`
            : `▼ ${Math.abs(sessionData.rankDeltaToday)} today`;
        const pulseDetail = sessionData.overtakenBy
            ? `${sessionData.overtakenBy} overtook you ${sessionData.overtakenMinutesAgo ?? 0} mins ago · Keep pushing!`
            : 'Holding position · Keep pushing!';
        const goalItems = goalText ? [item('$(target) Active Goal', goalText)] : [];
        return [
            separator('ENERGY SPLIT'),
            item('  Vibe (Creative)', `${sessionData.vibePct}%`, `${makeProgressBar(sessionData.vibePct, 100)}  Creative & exploratory work`),
            item('  Hard (Focus)', `${sessionData.hardPct}%`, `${makeProgressBar(sessionData.hardPct, 100)}  Deep debugging & building`),
            separator('LIVE METRICS'),
            item('$(error)   Build Fails', `${sessionData.buildFails}`),
            item('$(copilot) AI Prompts Used', `${sessionData.aiPromptsUsed}`),
            item('$(clock)   Session Time', formatDuration(elapsedMs)),
            ...goalItems,
            separator('RANK PULSE'),
            item(`  #${sessionData.currentRank} in ${sessionData.region}`, rankDelta, pulseDetail),
            separator('CONTROLS'),
            item(paused ? '$(debug-start)  Resume Session' : '$(debug-pause)  Pause Session'),
            item('$(target)       Set a Goal'),
            item('$(stop-circle)  End Session'),
        ];
    };
    const render = () => {
        updateTitle();
        qp.items = buildItems();
    };
    const pauseSession = () => {
        paused = !paused;
        render();
    };
    const setGoal = async () => {
        keepAliveForInput = true;
        try {
            const goal = await vscode.window.showInputBox({
                title: 'Set a Goal',
                prompt: 'What do you want to accomplish this session?',
                placeHolder: '—',
            });
            goalText = goal?.trim() || goalText;
        }
        catch {
            goalText = goalText || '—';
        }
        finally {
            keepAliveForInput = false;
            render();
            qp.show();
        }
    };
    const endSession = () => {
        const result = {
            durationMs: elapsedMs,
            mood: 'Flow State',
            vibePct: sessionData.vibePct,
            hardPct: sessionData.hardPct,
            buildFails: sessionData.buildFails,
            aiPromptsUsed: sessionData.aiPromptsUsed,
            finalRank: sessionData.currentRank,
            rankDelta: sessionData.rankDeltaToday,
            bestRankAchieved: Math.max(1, sessionData.currentRank - 1),
        };
        qp.hide();
        runPanel(() => showSessionEndPanel(context, result));
    };
    const dispatchControl = (label) => {
        if (label.includes('Pause Session') || label.includes('Resume Session')) {
            pauseSession();
        }
        else if (label.includes('Set a Goal')) {
            runPanel(setGoal);
        }
        else if (label.includes('End Session')) {
            endSession();
        }
    };
    render();
    qp.show();
    const ticker = setInterval(() => {
        if (!paused) {
            elapsedMs += 1000;
            updateTitle();
            qp.items = buildItems();
        }
    }, 1000);
    qp.onDidAccept(() => dispatchControl(qp.selectedItems[0]?.label ?? ''));
    qp.onDidTriggerButton((button) => {
        const id = iconId(button);
        if (id === 'debug-pause') {
            pauseSession();
        }
        else if (id === 'target') {
            runPanel(setGoal);
        }
        else if (id === 'stop-circle') {
            endSession();
        }
    });
    qp.onDidHide(() => {
        if (keepAliveForInput) {
            return;
        }
        clearInterval(ticker);
        qp.dispose();
    });
}
async function showLeaderboardPanel(context, leaderboardData = demoLeaderboardData()) {
    const qp = vscode.window.createQuickPick();
    applyQuickPickBase(qp);
    qp.title = '$(trophy) LEADERBOARD';
    qp.ignoreFocusOut = false;
    qp.buttons = [
        { iconPath: new vscode.ThemeIcon('arrow-left'), tooltip: 'Back to Home' },
    ];
    let scope = leaderboardData.scope;
    let timeframe = leaderboardData.timeframe;
    let pickingFilter = false;
    const buildItems = () => [
        separator('FILTERS'),
        item('$(globe)    Scope', describeOptions(['Region', 'Global', 'Friends'], scope)),
        item('$(calendar) Timeframe', describeOptions(['This Week', 'Month', 'All'], timeframe)),
        separator(`${scope === 'Region' ? leaderboardData.region.toUpperCase() : scope.toUpperCase()} · ${timeframe.toUpperCase()}`),
        ...leaderboardData.entries.map(rankItem),
        separator('YOU'),
        item(`  #${leaderboardData.currentUser.rank}  You`, `${leaderboardData.currentUser.points} pts  ${formatDelta(leaderboardData.currentUser.delta ?? 0)}`, `Keep it up! ${Math.max(0, leaderboardData.currentUser.rank - 5)} spots to top 5 this week`),
    ];
    const chooseScope = async () => {
        pickingFilter = true;
        try {
            const pick = await vscode.window.showQuickPick(['Region', 'Global', 'Friends'].map((option) => item(option === scope ? `✓ ${option}` : option)), quickPickOptions('Select Scope'));
            const nextScope = pick?.label.replace('✓ ', '');
            scope = nextScope ?? scope;
        }
        catch {
            scope = scope || 'Region';
        }
        finally {
            pickingFilter = false;
            qp.items = buildItems();
            qp.show();
        }
    };
    const chooseTimeframe = async () => {
        pickingFilter = true;
        try {
            const pick = await vscode.window.showQuickPick(['This Week', 'Month', 'All'].map((option) => item(option === timeframe ? `✓ ${option}` : option)), quickPickOptions('Select Timeframe'));
            const nextTimeframe = pick?.label.replace('✓ ', '');
            timeframe = nextTimeframe ?? timeframe;
        }
        catch {
            timeframe = timeframe || 'This Week';
        }
        finally {
            pickingFilter = false;
            qp.items = buildItems();
            qp.show();
        }
    };
    qp.items = buildItems();
    qp.show();
    qp.onDidAccept(() => {
        const label = qp.selectedItems[0]?.label ?? '';
        if (label.includes('Scope')) {
            runPanel(chooseScope);
        }
        else if (label.includes('Timeframe')) {
            runPanel(chooseTimeframe);
        }
    });
    qp.onDidTriggerButton((button) => {
        if (iconId(button) === 'arrow-left') {
            qp.hide();
            runPanel(() => showOpeningPanel(context, demoStats()));
        }
    });
    qp.onDidHide(() => {
        if (pickingFilter) {
            return;
        }
        qp.dispose();
    });
}
async function showHistoryPanel(context, historyData = demoHistoryData()) {
    const qp = vscode.window.createQuickPick();
    applyQuickPickBase(qp);
    qp.title = '$(history) YOUR HISTORY';
    qp.ignoreFocusOut = false;
    qp.buttons = [
        { iconPath: new vscode.ThemeIcon('arrow-left'), tooltip: 'Back to Home' },
    ];
    let pulse = false;
    const buildItems = () => [
        separator('CONSISTENCY'),
        item('  Current Streak', `${historyData.streakDays} days`, `${makeStreakDots(Array.from({ length: 14 }, (_, index) => (index < historyData.streakDays ? 1 : 0)))}  ${historyData.streakStartLabel} → ${historyData.streakEndLabel}`),
        separator('HEATMAP · LAST 10 WEEKS'),
        ...buildHeatmap(historyData.heatmapWeeks, pulse),
        separator('PERSONAL BESTS'),
        item('  Longest Session', formatDuration(historyData.longestSessionMs)),
        item('  Best Rank Achieved', `#${historyData.bestRankAchieved}`, historyData.bestRankDetail),
        item('✨ Clean Days (zero fails)', `${historyData.cleanDays}`),
        separator('SESSION LOG'),
        ...historyData.sessions.slice(0, 6).map(historyItem),
        separator(),
        item('$(export) Export History'),
    ];
    qp.items = buildItems();
    qp.show();
    const pulser = setInterval(() => {
        pulse = !pulse;
        qp.items = buildItems();
    }, 1200);
    qp.onDidAccept(() => {
        if ((qp.selectedItems[0]?.label ?? '').includes('Export History')) {
            showInfo('Export History is coming soon.');
        }
    });
    qp.onDidTriggerButton((button) => {
        if (iconId(button) === 'arrow-left') {
            qp.hide();
            runPanel(() => showOpeningPanel(context, demoStats()));
        }
    });
    qp.onDidHide(() => {
        clearInterval(pulser);
        qp.dispose();
    });
}
async function showSessionEndPanel(context, sessionResult = demoSessionResult()) {
    const qp = vscode.window.createQuickPick();
    applyQuickPickBase(qp);
    qp.title = '$(star-full) SESSION COMPLETE';
    qp.ignoreFocusOut = true;
    qp.buttons = [
        { iconPath: new vscode.ThemeIcon('share'), tooltip: 'Share this session' },
        { iconPath: new vscode.ThemeIcon('save'), tooltip: 'Save to history' },
    ];
    let mood = sessionResult.mood;
    const trophy = () => [
        separator('YOUR TROPHY'),
        item(`❋  ${formatDuration(sessionResult.durationMs)}`, mood ?? 'Flow State', DIVIDER),
        item('  Vibe Split', `${sessionResult.vibePct}%`, `${makeProgressBar(sessionResult.vibePct, 100)}  Creative & exploratory`),
        item('  Hard Split', `${sessionResult.hardPct}%`, `${makeProgressBar(sessionResult.hardPct, 100)}  Deep focused work`),
    ];
    const stats = () => [
        separator('YOUR STATS'),
        item('$(error)   Build Fails', `${sessionResult.buildFails}`),
        item('$(copilot) AI Prompts Used', `${sessionResult.aiPromptsUsed}`),
        item('  Final Rank', `#${sessionResult.finalRank}`, `Best rank of the session: #${sessionResult.bestRankAchieved}`),
    ];
    const moods = () => [
        separator('HOW WAS IT?'),
        item('  Grind Mode', mood === 'Grind Mode' ? '✓ Tagged' : undefined),
        item('⚡ Flow State', mood === 'Flow State' ? '✓ Tagged' : undefined),
        item('  Rough Day', mood === 'Rough Day' ? '✓ Tagged' : undefined),
    ];
    const actions = () => [
        separator(),
        item('$(share) Share this Session'),
        item('$(save)  Save to History'),
        item('$(home)  Back to Home'),
    ];
    const allItems = () => [...trophy(), ...stats(), ...moods(), ...actions()];
    const timers = [];
    qp.items = trophy();
    qp.show();
    timers.push(setTimeout(() => { qp.items = [...trophy(), ...stats()]; }, 200));
    timers.push(setTimeout(() => { qp.items = [...trophy(), ...stats(), ...moods()]; }, 400));
    timers.push(setTimeout(() => { qp.items = allItems(); }, 600));
    const share = () => {
        runCommand('sprintly.shareSession');
    };
    const save = () => {
        qp.hide();
        runPanel(async () => {
            await runCommandAsync('sprintly.saveSession');
            await showOpeningPanel(context, demoStats());
        });
    };
    const handleLabel = (label) => {
        if (label.includes('Grind Mode')) {
            mood = 'Grind Mode';
            qp.items = allItems();
        }
        else if (label.includes('Flow State')) {
            mood = 'Flow State';
            qp.items = allItems();
        }
        else if (label.includes('Rough Day')) {
            mood = 'Rough Day';
            qp.items = allItems();
        }
        else if (label.includes('Share this Session')) {
            share();
        }
        else if (label.includes('Save to History')) {
            save();
        }
        else if (label.includes('Back to Home')) {
            qp.hide();
            runPanel(() => showOpeningPanel(context, demoStats()));
        }
    };
    qp.onDidAccept(() => handleLabel(qp.selectedItems[0]?.label ?? ''));
    qp.onDidTriggerButton((button) => {
        const id = iconId(button);
        if (id === 'share') {
            share();
        }
        else if (id === 'save') {
            save();
        }
    });
    qp.onDidHide(() => {
        timers.forEach(clearTimeout);
        qp.dispose();
    });
}
async function showOpeningPanelNav(context, stats) {
    await showOpeningPanel(context, stats ?? demoStats());
}
async function showSessionActivePanelNav(context, sessionData) {
    await showSessionActivePanel(context, sessionData ?? demoSessionData());
}
async function showLeaderboardPanelNav(context, data) {
    await showLeaderboardPanel(context, data ?? demoLeaderboardData());
}
async function showHistoryPanelNav(context, data) {
    await showHistoryPanel(context, data ?? demoHistoryData());
}
async function showSessionEndPanelNav(context, result) {
    await showSessionEndPanel(context, result ?? demoSessionResult());
}
__exportStar(require("./types"), exports);
function applyQuickPickBase(qp) {
    qp.placeholder = '';
    qp.matchOnDescription = false;
    qp.matchOnDetail = false;
}
function separator(label = '') {
    return {
        label,
        kind: vscode.QuickPickItemKind.Separator,
        alwaysShow: true,
    };
}
function item(label, description, detail) {
    return {
        label,
        description,
        detail,
        alwaysShow: true,
    };
}
function iconId(button) {
    return button.iconPath instanceof vscode.ThemeIcon ? button.iconPath.id : '';
}
function runPanel(task) {
    void task().catch(() => {
        void Promise.resolve(vscode.window.showErrorMessage('—')).catch(() => undefined);
    });
}
function runCommand(command, ...args) {
    void runCommandAsync(command, ...args);
}
async function runCommandAsync(command, ...args) {
    try {
        await Promise.resolve(vscode.commands.executeCommand(command, ...args));
    }
    catch {
        showInfo('—');
    }
}
function showInfo(message) {
    void Promise.resolve(vscode.window.showInformationMessage(message)).catch(() => undefined);
}
function quickPickOptions(title) {
    return {
        title,
        placeHolder: '',
        matchOnDescription: false,
        matchOnDetail: false,
        ignoreFocusOut: false,
    };
}
function describeOptions(options, active) {
    return options.map((option) => (option === active ? `✓ ${option}` : option)).join(' · ');
}
function rankItem(entry) {
    if (entry.rank === 1) {
        return item(`  #${entry.rank}  ${entry.name}`, `${entry.points} pts`, `${makeProgressBar(10, 10)}  Top scorer this week`);
    }
    return item(`  #${entry.rank}  ${entry.name}`, `${entry.points} pts`);
}
function formatDelta(delta) {
    if (delta > 0) {
        return `▲ +${delta}`;
    }
    if (delta < 0) {
        return `▼ ${Math.abs(delta)}`;
    }
    return '—';
}
function buildHeatmap(weeks, pulse) {
    return weeks.slice(0, 10).map((week, index) => {
        const activeDays = week.filter((day) => day > 0).length;
        const label = index === 0 ? 'Week 10 (this week)' : `Week ${10 - index}`;
        const intensity = makeProgressBar(activeDays, 7, 7);
        const dots = week.map((day) => {
            if (day <= 0) {
                return '○';
            }
            return pulse ? '◉' : '●';
        }).join('');
        return item(`${label}   ${intensity}`, dots);
    });
}
function historyItem(entry) {
    return item(`$(history) ${entry.dateLabel} · ${entry.sessionName}`, formatDuration(entry.durationMs), `Rank #${entry.rank} · Vibe ${entry.vibePct}% · Hard ${entry.hardPct}% · ${entry.mood}`);
}
//# sourceMappingURL=sprintlyPanels.js.map