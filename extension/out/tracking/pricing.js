"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRICING_PER_MILLION = void 0;
exports.getClaudePricing = getClaudePricing;
exports.estimateClaudeCost = estimateClaudeCost;
const vscode = require("vscode");
// Rates as of authoring date — these WILL go stale,
// make configurable via settings.json, do not hardcode as permanent truth.
exports.PRICING_PER_MILLION = {
    claudeCode: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
};
function getClaudePricing() {
    const config = vscode.workspace.getConfiguration('sprintly.pricing.claudeCode');
    return {
        input: readRate(config, 'input', exports.PRICING_PER_MILLION.claudeCode.input),
        output: readRate(config, 'output', exports.PRICING_PER_MILLION.claudeCode.output),
        cacheRead: readRate(config, 'cacheRead', exports.PRICING_PER_MILLION.claudeCode.cacheRead),
        cacheCreate: readRate(config, 'cacheCreate', exports.PRICING_PER_MILLION.claudeCode.cacheCreate),
    };
}
function estimateClaudeCost(tokens, pricing = getClaudePricing()) {
    return (tokens.input * pricing.input
        + tokens.output * pricing.output
        + tokens.cacheRead * pricing.cacheRead
        + tokens.cacheCreate * pricing.cacheCreate) / 1000000;
}
function readRate(config, key, fallback) {
    const configured = config.get(key);
    return typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
        ? configured
        : fallback;
}
//# sourceMappingURL=pricing.js.map