"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintlyTokenStore = exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET = exports.SPRINTLY_DEVICE_TOKEN_SECRET = void 0;
exports.SPRINTLY_DEVICE_TOKEN_SECRET = 'sprintly.extension.deviceToken';
exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET = 'sprintly.extension.developmentToken';
/**
 * SecretStorage is the only persistent owner of extension credentials. The
 * development configuration fallback is read-only and is never copied into
 * any persisted state or export.
 */
class SprintlyTokenStore {
    constructor(secrets) {
        this.secrets = secrets;
    }
    async get(environment, configuredDevelopmentToken = '') {
        const secureKey = environment === 'production'
            ? exports.SPRINTLY_DEVICE_TOKEN_SECRET
            : exports.SPRINTLY_DEVELOPMENT_TOKEN_SECRET;
        const secureToken = (await this.secrets.get(secureKey))?.trim();
        if (secureToken)
            return secureToken;
        if (environment === 'development')
            return configuredDevelopmentToken.trim() || null;
        return null;
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
    async has(environment, configuredDevelopmentToken = '') {
        return (await this.get(environment, configuredDevelopmentToken)) !== null;
    }
}
exports.SprintlyTokenStore = SprintlyTokenStore;
//# sourceMappingURL=secureTokenStore.js.map