"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSprintlyPairingIntent = parseSprintlyPairingIntent;
function parseSprintlyPairingIntent(uri) {
    if (uri.scheme !== 'vscode' || uri.authority !== 'sprintly' || uri.path !== '/connect') {
        return null;
    }
    const parameters = new URLSearchParams(uri.query);
    const code = parameters.get('code')?.trim();
    if (!code || code.length > 256)
        return null;
    const apiValue = parameters.get('api')?.trim();
    if (!apiValue)
        return { code };
    try {
        const api = new URL(apiValue);
        if (api.protocol !== 'http:' && api.protocol !== 'https:')
            return null;
        api.search = '';
        api.hash = '';
        return { code, apiUrl: api.toString().replace(/\/$/, '') };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=connectionUri.js.map