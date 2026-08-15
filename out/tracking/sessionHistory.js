"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAggregateSyncPayload = exports.buildSessionHistoryRecord = exports.SessionHistoryStore = exports.LocalSessionStore = void 0;
/**
 * Compatibility entry point for the original history module.  The concrete
 * implementation now lives in LocalSessionStore so tracking, UI, export, and
 * website handoff can share one persistence boundary.
 */
var localSessionStore_1 = require("./localSessionStore");
Object.defineProperty(exports, "LocalSessionStore", { enumerable: true, get: function () { return localSessionStore_1.LocalSessionStore; } });
Object.defineProperty(exports, "SessionHistoryStore", { enumerable: true, get: function () { return localSessionStore_1.SessionHistoryStore; } });
Object.defineProperty(exports, "buildSessionHistoryRecord", { enumerable: true, get: function () { return localSessionStore_1.buildSessionHistoryRecord; } });
Object.defineProperty(exports, "createAggregateSyncPayload", { enumerable: true, get: function () { return localSessionStore_1.createAggregateSyncPayload; } });
//# sourceMappingURL=sessionHistory.js.map