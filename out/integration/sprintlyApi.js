"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeHttpRequest = exports.SprintlyApiClient = exports.SprintlyApiError = exports.SPRINTLY_MAX_SESSIONS_PER_REQUEST = exports.SPRINTLY_MAX_REQUEST_BYTES = void 0;
exports.serializeSprintlyUploadEnvelope = serializeSprintlyUploadEnvelope;
const http = require("http");
const https = require("https");
const sprintlyContract_1 = require("../tracking/sprintlyContract");
exports.SPRINTLY_MAX_REQUEST_BYTES = 1000000;
exports.SPRINTLY_MAX_SESSIONS_PER_REQUEST = 100;
class SprintlyApiError extends Error {
    constructor(message, options) {
        super(sanitizeSensitiveText(message));
        this.name = 'SprintlyApiError';
        this.kind = options.kind;
        this.retryable = options.retryable ?? false;
        this.status = options.status;
        this.rejected = (options.rejected ?? []).map((entry) => ({
            sessionId: entry.sessionId,
            reason: sanitizeSensitiveText(entry.reason),
        }));
    }
}
exports.SprintlyApiError = SprintlyApiError;
class SprintlyApiClient {
    constructor(options) {
        this.baseUrl = parseBaseUrl(options.baseUrl);
        this.token = options.token?.trim() || null;
        this.request = options.request ?? exports.nodeHttpRequest;
        this.timeoutMs = options.timeoutMs ?? 15000;
    }
    async health() {
        const response = await this.send('GET', '/api/extension/health', undefined, false);
        const body = parseJsonObject(response.body);
        if (response.status < 200 || response.status >= 300) {
            throw apiErrorFromResponse(response.status, body, 'Health check failed');
        }
        if (body.ok !== true
            || body.contract !== sprintlyContract_1.SPRINTLY_CONTRACT
            || body.schemaVersion !== sprintlyContract_1.SPRINTLY_SCHEMA_VERSION) {
            throw new SprintlyApiError('The website returned an incompatible Sprintly API contract.', { kind: 'contract', status: response.status });
        }
        return {
            ok: true,
            contract: sprintlyContract_1.SPRINTLY_CONTRACT,
            schemaVersion: sprintlyContract_1.SPRINTLY_SCHEMA_VERSION,
        };
    }
    async uploadSessions(sessions) {
        if (!sessions.length) {
            return { acceptedSessionIds: [], duplicateSessionIds: [], rejected: [] };
        }
        if (sessions.length > exports.SPRINTLY_MAX_SESSIONS_PER_REQUEST) {
            throw new SprintlyApiError(`A Sprintly upload may contain at most ${exports.SPRINTLY_MAX_SESSIONS_PER_REQUEST} sessions.`, { kind: 'validation' });
        }
        const sessionIds = sessions.map((session) => session.sessionId);
        if (new Set(sessionIds).size !== sessionIds.length) {
            throw new SprintlyApiError('A Sprintly upload cannot contain duplicate session IDs.', {
                kind: 'validation',
            });
        }
        const validationErrors = sessions.flatMap((session) => {
            const validation = (0, sprintlyContract_1.validateSprintlySession)(session);
            return validation.ok ? [] : validation.errors.map((error) => `${session.sessionId}: ${error}`);
        });
        if (validationErrors.length) {
            throw new SprintlyApiError(`Session validation failed: ${validationErrors.join('; ')}`, { kind: 'validation', rejected: sessions.map((session) => ({
                    sessionId: session.sessionId,
                    reason: validationErrors.filter((error) => error.startsWith(`${session.sessionId}:`)).join('; '),
                })) });
        }
        const serializedBody = serializeSprintlyUploadEnvelope(sessions);
        if (Buffer.byteLength(serializedBody, 'utf8') > exports.SPRINTLY_MAX_REQUEST_BYTES) {
            throw new SprintlyApiError(`The Sprintly upload batch exceeds the ${exports.SPRINTLY_MAX_REQUEST_BYTES}-byte request limit.`, { kind: 'http', status: 413 });
        }
        const response = await this.send('POST', '/api/extension/sessions', serializedBody);
        const body = parseJsonObject(response.body);
        if (body.contract !== undefined || body.schemaVersion !== undefined) {
            validateUploadResponseContract(body, response.status);
        }
        if (isSyncDisabled(body)) {
            throw new SprintlyApiError('Sprintly synchronization is disabled by the website account settings.', { kind: 'sync-disabled', status: response.status });
        }
        if (response.status === 401) {
            const revoked = isRevokedDevice(body);
            throw new SprintlyApiError(revoked ? 'The Sprintly device has been revoked. Reconnect the extension.' : 'Sprintly authorization was rejected.', {
                kind: revoked ? 'revoked-device' : 'unauthorized',
                status: response.status,
            });
        }
        if (response.status === 400) {
            const rejected = parseRejected(body, sessions);
            throw new SprintlyApiError(`The website rejected ${rejected.length} session${rejected.length === 1 ? '' : 's'}.`, { kind: 'validation', status: response.status, rejected });
        }
        if (response.status === 409) {
            validateUploadResponseContract(body, response.status, true);
            return parseUploadResult(body, sessions);
        }
        if (response.status < 200 || response.status >= 300) {
            throw apiErrorFromResponse(response.status, body, 'Session upload failed');
        }
        validateUploadResponseContract(body, response.status, true);
        return parseUploadResult(body, sessions);
    }
    async send(method, path, body, includeAuth = method === 'POST') {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        if (includeAuth && this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }
        try {
            return await this.request({
                method,
                url: new URL(path, this.baseUrl).toString(),
                headers,
                body,
                timeoutMs: this.timeoutMs,
            });
        }
        catch (error) {
            if (error instanceof SprintlyApiError)
                throw error;
            const message = error instanceof Error ? error.message : 'The Sprintly website could not be reached.';
            throw new SprintlyApiError(`Sprintly network error: ${message}`, { kind: 'network', retryable: true });
        }
    }
}
exports.SprintlyApiClient = SprintlyApiClient;
const nodeHttpRequest = (options) => new Promise((resolve, reject) => {
    let url;
    try {
        url = new URL(options.url);
    }
    catch {
        reject(new Error('Invalid Sprintly API URL.'));
        return;
    }
    const transport = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
    if (!transport) {
        reject(new Error('Sprintly API URL must use http or https.'));
        return;
    }
    const request = transport.request(url, {
        method: options.method,
        headers: options.headers,
    }, (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size <= 2 * 1024 * 1024)
                chunks.push(buffer);
        });
        response.on('end', () => {
            if (size > 2 * 1024 * 1024) {
                reject(new Error('Sprintly response was too large.'));
                return;
            }
            const headers = {};
            for (const [key, value] of Object.entries(response.headers))
                headers[key] = value;
            resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString('utf8') });
        });
        response.on('error', reject);
    });
    request.setTimeout(options.timeoutMs, () => request.destroy(new Error('Sprintly request timed out.')));
    request.on('error', reject);
    if (options.body !== undefined)
        request.write(options.body);
    request.end();
});
exports.nodeHttpRequest = nodeHttpRequest;
function serializeSprintlyUploadEnvelope(sessions) {
    return JSON.stringify({
        contract: sprintlyContract_1.SPRINTLY_CONTRACT,
        schemaVersion: sprintlyContract_1.SPRINTLY_SCHEMA_VERSION,
        sessions,
    });
}
function parseBaseUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            throw new Error();
        url.pathname = url.pathname.replace(/\/+$/, '/') || '/';
        url.search = '';
        url.hash = '';
        return url;
    }
    catch {
        throw new SprintlyApiError('Sprintly API URL must use http or https.', { kind: 'contract' });
    }
}
function parseJsonObject(body) {
    if (!body.trim())
        return {};
    try {
        const value = JSON.parse(body);
        return isRecord(value) ? value : {};
    }
    catch {
        return {};
    }
}
function parseUploadResult(body, sessions) {
    const acceptedSessionIds = parseIds(body.accepted ?? body.acceptedSessions);
    const duplicateSessionIds = parseIds(body.duplicates ?? body.duplicateSessions);
    const rejected = parseRejected(body, sessions);
    // Never infer success from a generic `ok` or conflict status. Queue records
    // may be finalized only when the website names them as accepted or duplicate.
    return { acceptedSessionIds, duplicateSessionIds, rejected };
}
function validateUploadResponseContract(body, status, requireSuccess = false) {
    if (body.contract !== sprintlyContract_1.SPRINTLY_CONTRACT || body.schemaVersion !== sprintlyContract_1.SPRINTLY_SCHEMA_VERSION) {
        throw new SprintlyApiError(`The website returned an incompatible upload response contract (HTTP ${status}).`, { kind: 'contract', status });
    }
    if (requireSuccess && body.ok !== true) {
        throw new SprintlyApiError(`The website returned an invalid upload response (HTTP ${status}).`, { kind: 'contract', status });
    }
}
function parseRejected(body, sessions) {
    const raw = body.rejected ?? body.errors;
    if (isRecord(raw)) {
        return Object.entries(raw).map(([sessionId, reason]) => ({
            sessionId,
            reason: typeof reason === 'string' ? reason : 'The website rejected this session.',
        }));
    }
    if (!Array.isArray(raw)) {
        if (typeof body.reason === 'string') {
            return sessions.map((session) => ({ sessionId: session.sessionId, reason: body.reason }));
        }
        return [];
    }
    return raw.flatMap((entry) => {
        if (typeof entry === 'string') {
            return [{ sessionId: findSessionId(entry, sessions), reason: entry }];
        }
        if (!isRecord(entry))
            return [];
        const sessionId = typeof entry.sessionId === 'string'
            ? entry.sessionId
            : typeof entry.id === 'string' ? entry.id : '';
        const reason = typeof entry.reason === 'string'
            ? entry.reason
            : typeof entry.message === 'string' ? entry.message : 'The website rejected this session.';
        return sessionId ? [{ sessionId, reason }] : [];
    });
}
function parseIds(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((entry) => {
        if (typeof entry === 'string')
            return [entry];
        if (isRecord(entry) && typeof entry.sessionId === 'string')
            return [entry.sessionId];
        if (isRecord(entry) && typeof entry.id === 'string')
            return [entry.id];
        return [];
    });
}
function findSessionId(reason, sessions) {
    return sessions.find((session) => reason.includes(session.sessionId))?.sessionId ?? 'unknown';
}
function apiErrorFromResponse(status, body, prefix) {
    const detail = typeof body.message === 'string' ? `: ${body.message}` : '';
    const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
    return new SprintlyApiError(`${prefix} (${status})${detail}`, {
        kind: 'http',
        status,
        retryable,
    });
}
function isSyncDisabled(body) {
    if (body.syncDisabled === true || body.syncEnabled === false)
        return true;
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const error = typeof body.error === 'string' ? body.error.toUpperCase() : '';
    return code === 'SYNC_DISABLED'
        || code === 'CONSENT_REQUIRED'
        || code === 'LEADERBOARD_CONSENT_REQUIRED'
        || error === 'SYNC_DISABLED'
        || error === 'CONSENT_REQUIRED';
}
function isRevokedDevice(body) {
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const error = typeof body.error === 'string' ? body.error.toUpperCase() : '';
    return body.revoked === true
        || code === 'DEVICE_REVOKED'
        || code === 'REVOKED_DEVICE'
        || error === 'DEVICE_REVOKED'
        || error === 'REVOKED_DEVICE'
        || (typeof body.message === 'string' && body.message.toLowerCase().includes('revoked'));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sanitizeSensitiveText(value) {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/(token|secret|password|code)\s*[:=]\s*[^\s,;]+/gi, '$1: [redacted]')
        .slice(0, 500);
}
//# sourceMappingURL=sprintlyApi.js.map