/**
 * Compatibility entry point for the original history module.  The concrete
 * implementation now lives in LocalSessionStore so tracking, UI, export, and
 * website handoff can share one persistence boundary.
 */
export {
  LocalSessionStore,
  SessionHistoryStore,
  buildSessionHistoryRecord,
  createAggregateSyncPayload,
  type AggregateSyncPayload,
  type LocalSessionStoreOptions,
  type SessionHistoryRecord,
  type SessionHistoryRecordPatch,
} from './localSessionStore';
