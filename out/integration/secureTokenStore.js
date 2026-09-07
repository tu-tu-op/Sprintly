"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintlyTokenStore = exports.SPRINTLY_DEVICE_ID_SECRET = exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET = exports.SPRINTLY_DEVICE_TOKEN_SECRET = void 0;
const crypto_1 = require("crypto");
exports.SPRINTLY_DEVICE_TOKEN_SECRET = 'sprintly.extension.deviceToken';
exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET = 'sprintly.extension.developmentToken';
exports.SPRINTLY_DEVICE_ID_SECRET = 'sprintly.extension.deviceId';
/**
 * SecretStorage is the only persistent owner of extension credentials.
 * Development credentials are an explicit local smoke-test value and are
 * never copied into any other persisted state or export.
 */
class SprintlyTokenStore {
    constructor(secrets) {
        this.secrets = secrets;
    }
    async get(environment) {
        const secureKey = environment === 'production'
            ? exports.SPRINTLY_DEVICE_TOKEN_SECRET
            : exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET;
        const secureToken = (await this.secrets.get(secureKey))?.trim();
        if (secureToken)
            return secureToken;
        return null;
    }
    /**
     * Creates one opaque installation identifier and keeps it stable across
     * reconnects. It is not a user identity and never leaves the pairing body.
     */
    async getOrCreateDeviceId(createId = crypto_1.randomUUID) {
        const existing = (await this.secrets.get(exports.SPRINTLY_DEVICE_ID_SECRET))?.trim();
        if (isValidDeviceId(existing))
            return existing;
        const generated = `vscode-${createId()}`;
        if (!isValidDeviceId(generated))
            throw new Error('Could not create a valid Sprintly device ID.');
        await this.secrets.store(exports.SPRINTLY_DEVICE_ID_SECRET, generated);
        return generated;
    }
    async storeDevelopmentToken(token) {
        const value = token.trim();
        if (!value)
            throw new Error('A development token is required.');
        await this.secrets.store(exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET, value);
    }
    async storeDeviceToken(token) {
        const value = token.trim();
        if (!value)
            throw new Error('A device token is required.');
        await this.secrets.store(exports.SPRINTLY_DEVICE_TOKEN_SECRET, value);
    }
    async clear() {
        await Promise.all([
            this.secrets.delete(exports.SPRINTLY_DEVICE_TOKEN_SECRET),
            this.secrets.delete(exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET),
        ]);
    }
    async has(environment) {
        return (await this.get(environment)) !== null;
    }
}
exports.SprintlyTokenStore = SprintlyTokenStore;
function isValidDeviceId(value) {
    return value !== undefined
        && value.length >= 8
        && value.length <= 200
        && !/[\u0000-\u001F\u007F]/.test(value);
}
//# sourceMappingURL=secureTokenStore.js.map