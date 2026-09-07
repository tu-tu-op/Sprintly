"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrivacySettings = getPrivacySettings;
exports.isSyncPreference = isSyncPreference;
exports.isTelemetryCategoryEnabled = isTelemetryCategoryEnabled;
const vscode = require("vscode");
const SYNC_PREFERENCES = [
    'never',
    'selected',
    'completed',
    'leaderboard',
];
function getPrivacySettings() {
    const configuration = vscode.workspace?.getConfiguration
        ? vscode.workspace.getConfiguration('sprintly')
        : undefined;
    const get = (key, fallback) => configuration?.get(key, fallback) ?? fallback;
    const configuredSyncPreference = get('syncPreference', 'never');
    return {
        enabled: get('enabled', true) !== false,
        autoPromptOnStartup: get('autoPromptOnStartup', true) !== false,
        localHistoryEnabled: get('localHistoryEnabled', true) !== false,
        syncEnabled: get('syncEnabled', false) === true,
        trackCodingActivity: get('telemetry.trackCodingActivity', true) !== false,
        trackAgentUsage: get('telemetry.trackAgentUsage', true) !== false,
        trackTerminalActivity: get('telemetry.trackTerminalActivity', true) !== false,
        trackBuildFailures: get('telemetry.trackBuildFailures', true) !== false,
        cloudSyncEnabled: get('cloudSyncEnabled', false) === true,
        aiTrackingVisible: get('telemetry.showAiTracking', true) !== false,
        syncPreference: isSyncPreference(configuredSyncPreference) ? configuredSyncPreference : 'never',
        leaderboardOptIn: get('leaderboardOptIn', false) === true,
    };
}
function isSyncPreference(value) {
    return typeof value === 'string' && SYNC_PREFERENCES.includes(value);
}
function isTelemetryCategoryEnabled(category) {
    const settings = getPrivacySettings();
    if (!settings.enabled)
        return false;
    if (category === 'codingActivity')
        return settings.trackCodingActivity;
    if (category === 'agentUsage')
        return settings.trackAgentUsage;
    if (category === 'terminalActivity')
        return settings.trackTerminalActivity;
    return settings.trackBuildFailures;
}
//# sourceMappingURL=privacySettings.js.map