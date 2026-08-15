"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalSessionPacketSigner = exports.DEVSTRAVA_SIGNATURE_SCHEMA_VERSION = void 0;
const crypto_1 = require("crypto");
const sessionSchema_1 = require("./sessionSchema");
exports.DEVSTRAVA_SIGNATURE_SCHEMA_VERSION = 'devstrava.signature.v1';
/**
 * Optional future-verification service. Keys remain in VS Code SecretStorage;
 * no private key or signature is included in normal exports/handoffs.
 */
class LocalSessionPacketSigner {
    constructor(secrets) {
        this.secrets = secrets;
    }
    async sign(payload) {
        const keys = await this.getOrCreateKeys();
        const body = canonicalJson(payload);
        const signature = (0, crypto_1.sign)(null, Buffer.from(body, 'utf8'), (0, crypto_1.createPrivateKey)(keys.privateKey));
        return {
            schemaVersion: sessionSchema_1.DEVSTRAVA_SESSION_SCHEMA_VERSION,
            signatureVersion: exports.DEVSTRAVA_SIGNATURE_SCHEMA_VERSION,
            payload,
            signature: signature.toString('base64'),
            publicKey: keys.publicKey,
        };
    }
    async verify(packet) {
        if (packet.schemaVersion !== sessionSchema_1.DEVSTRAVA_SESSION_SCHEMA_VERSION
            || packet.signatureVersion !== exports.DEVSTRAVA_SIGNATURE_SCHEMA_VERSION) {
            return false;
        }
        const validation = (0, sessionSchema_1.validateSessionContract)(packet.payload);
        if (!validation.ok)
            return false;
        try {
            return (0, crypto_1.verify)(null, Buffer.from(canonicalJson(packet.payload), 'utf8'), (0, crypto_1.createPublicKey)(packet.publicKey), Buffer.from(packet.signature, 'base64'));
        }
        catch {
            return false;
        }
    }
    async getOrCreateKeys() {
        const privateKey = await this.secrets.get('devstrava.session.privateKey');
        const publicKey = await this.secrets.get('devstrava.session.publicKey');
        if (privateKey && publicKey)
            return { privateKey, publicKey };
        const generated = (0, crypto_1.generateKeyPairSync)('ed25519');
        const next = {
            privateKey: generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
            publicKey: generated.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        };
        await this.secrets.store('devstrava.session.privateKey', next.privateKey);
        await this.secrets.store('devstrava.session.publicKey', next.publicKey);
        return next;
    }
}
exports.LocalSessionPacketSigner = LocalSessionPacketSigner;
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
//# sourceMappingURL=sessionVerification.js.map