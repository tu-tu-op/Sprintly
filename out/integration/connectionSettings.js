"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPRINTLY_API_BASE_URL_ENV = exports.DEFAULT_SPRINTLY_WEBSITE_URL = exports.DEFAULT_SPRINTLY_API_URL = void 0;
exports.getSprintlyConnectionSettings = getSprintlyConnectionSettings;
exports.environmentLabel = environmentLabel;
const vscode = require("vscode");
const privacySettings_1 = require("../tracking/privacySettings");
exports.DEFAULT_SPRINTLY_API_URL = 'http://localhost:3000';
// The website's authenticated connection controls live on the local app
// settings route during development. Production installations should set
// sprintly.websiteUrl to the deployed Sprintly settings URL.
exports.DEFAULT_SPRINTLY_WEBSITE_URL = 'http://localhost:3000/app/settings';
exports.SPRINTLY_API_BASE_URL_ENV = 'SPRINTLY_API_BASE_URL';
function getSprintlyConnectionSettings() {
    const configuration = vscode.workspace?.getConfiguration
        ? vscode.workspace.getConfiguration('sprintly')
        : undefined;
    const get = (key, fallback) => configuration?.get(key, fallback) ?? fallback;
    const environment = get('apiEnvironment', 'development');
    const configuredPreference = get('syncPreference', 'never');
    const environmentApiUrl = process.env[exports.SPRINTLY_API_BASE_URL_ENV]?.trim();
    const configuredApiUrl = get('apiUrl', exports.DEFAULT_SPRINTLY_API_URL).trim();
    return {
        apiUrl: environmentApiUrl || configuredApiUrl || exports.DEFAULT_SPRINTLY_API_URL,
        environment: environment === 'production' ? 'production' : 'development',
        syncEnabled: get('syncEnabled', false) === true,
        syncPreference: (0, privacySettings_1.isSyncPreference)(configuredPreference) ? configuredPreference : 'never',
        leaderboardOptIn: get('leaderboardOptIn', false) === true,
        websiteUrl: get('websiteUrl', exports.DEFAULT_SPRINTLY_WEBSITE_URL),
    };
}
function environmentLabel(environment) {
    return environment === 'production' ? 'Production' : 'Development';
}
//# sourceMappingURL=connectionSettings.js.map