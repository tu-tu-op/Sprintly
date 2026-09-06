"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelegatingPairingAdapter = exports.UnavailablePairingAdapter = void 0;
/**
 * The website has not published a pairing endpoint yet. Keeping this default
 * adapter explicit prevents the extension from inventing a network protocol.
 */
class UnavailablePairingAdapter {
    async exchangeCode(_request) {
        throw new Error('Sprintly website pairing is not available yet. Use a development token or configure a pairing adapter.');
    }
}
exports.UnavailablePairingAdapter = UnavailablePairingAdapter;
/** Useful for the future website implementation and deterministic extension tests. */
class DelegatingPairingAdapter {
    constructor(exchange) {
        this.exchange = exchange;
    }
    exchangeCode(request) {
        return this.exchange(request);
    }
}
exports.DelegatingPairingAdapter = DelegatingPairingAdapter;
//# sourceMappingURL=pairing.js.map