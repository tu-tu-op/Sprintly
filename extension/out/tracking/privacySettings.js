"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrivacySettings = getPrivacySettings;
exports.isTelemetryCategoryEnabled = isTelemetryCategoryEnabled;
const vscode = require("vscode");
function getPrivacySettings() {
    const configuration = vscode.workspace?.getConfiguration
        ? vscode.workspace.getConfiguration('sprintly')
        : undefined;
    const get = (key, fallback) => configuration?.get(key, fallback) ?? fallback;
    return {
        enabled: get('enabled', true) !== false,
        autoPromptOnStartup: get('autoPromptOnStartup', true) !== false,
        trackCodingActivity: get('telemetry.trackCodingActivity', true) !== false,
        trackAgentUsage: get('telemetry.trackAgentUsage', true) !== false,
        trackBuildFailures: get('telemetry.trackBuildFailures', true) !== false,
        cloudSyncEnabled: get('cloudSyncEnabled', false) === true,
        aiTrackingVisible: get('telemetry.showAiTracking', true) !== false,
    };
}
function isTelemetryCategoryEnabled(category) {
    const settings = getPrivacySettings();
    if (!settings.enabled)
        return false;
    if (category === 'codingActivity')
        return settings.trackCodingActivity;
    if (category === 'agentUsage')
        return settings.trackAgentUsage;
    return settings.trackBuildFailures;
}
//# sourceMappingURL=privacySettings.js.map