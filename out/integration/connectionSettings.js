"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SPRINTLY_WEBSITE_URL = exports.DEFAULT_SPRINTLY_API_URL = void 0;
exports.getSprintlyConnectionSettings = getSprintlyConnectionSettings;
exports.environmentLabel = environmentLabel;
const vscode = require("vscode");
const privacySettings_1 = require("../tracking/privacySettings");
exports.DEFAULT_SPRINTLY_API_URL = 'http://localhost:3000';
exports.DEFAULT_SPRINTLY_WEBSITE_URL = 'https://sprintly.app/connect';
function getSprintlyConnectionSettings() {
    const configuration = vscode.workspace?.getConfiguration
        ? vscode.workspace.getConfiguration('sprintly')
        : undefined;
    const get = (key, fallback) => configuration?.get(key, fallback) ?? fallback;
    const environment = get('apiEnvironment', 'development');
    const configuredPreference = get('syncPreference', 'never');
    return {
        apiUrl: get('apiUrl', exports.DEFAULT_SPRINTLY_API_URL).trim() || exports.DEFAULT_SPRINTLY_API_URL,
        environment: environment === 'production' ? 'production' : 'development',
        syncPreference: (0, privacySettings_1.isSyncPreference)(configuredPreference) ? configuredPreference : 'never',
        leaderboardOptIn: get('leaderboardOptIn', false) === true,
        websiteUrl: get('websiteUrl', exports.DEFAULT_SPRINTLY_WEBSITE_URL),
    };
}
function environmentLabel(environment) {
    return environment === 'production' ? 'Production' : 'Development';
}
//# sourceMappingURL=connectionSettings.js.map