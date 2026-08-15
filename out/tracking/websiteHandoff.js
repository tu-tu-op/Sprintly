"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebsiteHandoffService = void 0;
exports.createSessionSharePayload = createSessionSharePayload;
exports.createHistorySyncPayload = createHistorySyncPayload;
exports.createLeaderboardPayload = createLeaderboardPayload;
exports.isoWeek = isoWeek;
exports.defaultExportFileName = defaultExportFileName;
const vscode = require("vscode");
const sessionSchema_1 = require("./sessionSchema");
const sessionAggregation_1 = require("./sessionAggregation");
const localSessionStore_1 = require("./localSessionStore");
function createSessionSharePayload(record) {
    return {
        schemaVersion: sessionSchema_1.DEVSTRAVA_SESSION_SCHEMA_VERSION,
        payloadType: 'session.share.v1',
        session: (0, localSessionStore_1.toSessionContract)(record),
    };
}
function createHistorySyncPayload(store, now = Date.now()) {
    const exported = store.export(now);
    return {
        schemaVersion: sessionSchema_1.DEVSTRAVA_SESSION_SCHEMA_VERSION,
        payloadType: 'history.sync.v1',
        sessions: exported.sessions,
        aggregateMetadata: exported.aggregates,
    };
}
function createLeaderboardPayload(records, region = null, now = Date.now()) {
    const aggregation = (0, sessionAggregation_1.aggregateSessions)(records, 'week', now);
    return {
        schemaVersion: sessionSchema_1.DEVSTRAVA_SESSION_SCHEMA_VERSION,
        payloadType: 'leaderboard.aggregate.v1',
        week: isoWeek(now),
        region: region || null,
        sessions: aggregation.sessions,
        activeMinutes: Math.round(aggregation.activeTimeMs / 60000),
        focusScore: aggregation.averageFocusScore,
        recoveryScore: aggregation.recoveryRate,
        devScore: aggregation.devScore,
        streak: aggregation.currentStreak,
    };
}
function isoWeek(timestamp) {
    const date = new Date(timestamp);
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
/**
 * The initial bridge is a user-selected JSON file handoff. The extension never
 * posts telemetry or puts payloads in a URL. The website asks the user to
 * import this file after authentication/authorization.
 */
class WebsiteHandoffService {
    constructor(websiteUrl = readWebsiteUrl()) {
        this.websiteUrl = websiteUrl;
    }
    async connectWebsite() {
        const uri = safeWebsiteUri(this.websiteUrl);
        if (!uri || !vscode.env?.openExternal)
            return false;
        return vscode.env.openExternal(uri);
    }
    async savePayload(payload, defaultFileName, openWebsite = false) {
        const defaultUri = vscode.Uri.file(defaultFileName);
        const uri = await vscode.window.showSaveDialog({
            defaultUri,
            saveLabel: 'Save DevStrava Data',
            filters: { 'DevStrava JSON': ['json'] },
        });
        if (!uri)
            return null;
        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
        let openedWebsite = false;
        if (openWebsite) {
            openedWebsite = await this.connectWebsite();
        }
        return { uri, openedWebsite };
    }
    async readPayload(uri) {
        const selected = uri ?? (await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Import DevStrava Data',
            filters: { 'DevStrava JSON': ['json'] },
        }))?.[0];
        if (!selected)
            return null;
        const bytes = await vscode.workspace.fs.readFile(selected);
        return JSON.parse(Buffer.from(bytes).toString('utf8'));
    }
    dispose() { }
}
exports.WebsiteHandoffService = WebsiteHandoffService;
function defaultExportFileName(now = new Date()) {
    const date = now.toISOString().slice(0, 10);
    return `devstrava-export-${date}.json`;
}
function readWebsiteUrl() {
    const configuration = vscode.workspace?.getConfiguration
        ? vscode.workspace.getConfiguration('sprintly')
        : undefined;
    return configuration?.get('websiteUrl', 'https://sprintly.app/connect')
        ?? 'https://sprintly.app/connect';
}
function safeWebsiteUri(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            return null;
        return vscode.Uri.parse(url.toString());
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=websiteHandoff.js.map