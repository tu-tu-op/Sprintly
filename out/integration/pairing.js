"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnavailablePairingAdapter = exports.DelegatingPairingAdapter = exports.HttpPairingAdapter = exports.SprintlyPairingError = void 0;
const sprintlyApi_1 = require("./sprintlyApi");
class SprintlyPairingError extends Error {
    constructor(message, options = {}) {
        super(sanitizeMessage(message));
        this.name = 'SprintlyPairingError';
        this.status = options.status;
        this.retryable = options.retryable ?? false;
    }
}
exports.SprintlyPairingError = SprintlyPairingError;
/**
 * The website-owned pairing exchange. Pairing codes are one-time credentials:
 * this adapter performs exactly one request and never retries a consumed code.
 */
class HttpPairingAdapter {
    constructor(options) {
        this.baseUrl = parseBaseUrl(options.baseUrl);
        this.request = options.request ?? sprintlyApi_1.nodeHttpRequest;
        this.timeoutMs = options.timeoutMs ?? 15000;
    }
    async exchangeCode(request) {
        validatePairingRequest(request);
        let response;
        try {
            response = await this.request({
                method: 'POST',
                url: new URL('/api/extension/pairing/complete', this.baseUrl).toString(),
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: request.code,
                    deviceId: request.deviceId,
                    deviceName: request.deviceName,
                    deviceType: request.deviceType,
                }),
                timeoutMs: this.timeoutMs,
            });
        }
        catch {
            throw new SprintlyPairingError('The Sprintly pairing service could not be reached.', { retryable: true });
        }
        const body = parseJsonObject(response.body);
        if (response.status < 200 || response.status >= 300) {
            throw new SprintlyPairingError(pairingFailureMessage(response.status), { status: response.status, retryable: response.status >= 500 || response.status === 429 });
        }
        if (body.ok !== true || typeof body.token !== 'string' || !body.token.trim()) {
            throw new SprintlyPairingError('The Sprintly pairing service returned an invalid device token.', { status: response.status });
        }
        if (body.expiresAt !== undefined && !isRfc3339Timestamp(body.expiresAt)) {
            throw new SprintlyPairingError('The Sprintly pairing service returned an invalid token expiry.', {
                status: response.status,
            });
        }
        return {
            ok: true,
            token: body.token.trim(),
            ...(typeof body.expiresAt === 'string' ? { expiresAt: body.expiresAt } : {}),
        };
    }
}
exports.HttpPairingAdapter = HttpPairingAdapter;
/** Kept as an explicit test/development seam for hosts with a custom bridge. */
class DelegatingPairingAdapter {
    constructor(exchange) {
        this.exchange = exchange;
    }
    exchangeCode(request) {
        return this.exchange(request);
    }
}
exports.DelegatingPairingAdapter = DelegatingPairingAdapter;
/** Backwards-compatible explicit failure; the shipped default is HTTP pairing. */
class UnavailablePairingAdapter {
    async exchangeCode(_request) {
        throw new Error('Sprintly website pairing is not available in this adapter.');
    }
}
exports.UnavailablePairingAdapter = UnavailablePairingAdapter;
function validatePairingRequest(request) {
    if (!request.code.trim())
        throw new SprintlyPairingError('A pairing code is required.');
    if (request.code.length > 256)
        throw new SprintlyPairingError('The pairing code is too long.');
    if (request.deviceId.length < 8 || request.deviceId.length > 200) {
        throw new SprintlyPairingError('The extension device ID is invalid.');
    }
    if (!request.deviceName.trim() || request.deviceName.length > 100) {
        throw new SprintlyPairingError('The extension device name is invalid.');
    }
    if (!['vscode', 'desktop', 'other'].includes(request.deviceType)) {
        throw new SprintlyPairingError('The extension device type is invalid.');
    }
}
function parseBaseUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            throw new Error();
        url.search = '';
        url.hash = '';
        return url;
    }
    catch {
        throw new SprintlyPairingError('Sprintly API URL must use http or https.');
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
function pairingFailureMessage(status) {
    if (status === 400 || status === 401 || status === 404 || status === 409) {
        return 'The pairing code is invalid, expired, already used, or not available. Generate a new code on the Sprintly website.';
    }
    return status >= 500
        ? 'The Sprintly pairing service is temporarily unavailable.'
        : `Sprintly pairing failed (${status}).`;
}
function isRfc3339Timestamp(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
        && Number.isFinite(Date.parse(value));
}
function sanitizeMessage(value) {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/token\s*[:=]\s*[^\s,;]+/gi, 'token: [redacted]')
        .slice(0, 500);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=pairing.js.map