"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPRINTLY_EXTENSION_ID = void 0;
exports.parseSprintlyPairingIntent = parseSprintlyPairingIntent;
exports.SPRINTLY_EXTENSION_ID = 'tu-tu-op.sprintly';
function parseSprintlyPairingIntent(uri, extensionId = exports.SPRINTLY_EXTENSION_ID) {
    const isVSCodeScheme = uri.scheme === 'vscode' || uri.scheme === 'vscode-insiders';
    if (!isVSCodeScheme
        || uri.authority.toLowerCase() !== extensionId.toLowerCase()
        || uri.path !== '/connect') {
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