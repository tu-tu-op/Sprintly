"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateSessions = aggregateSessions;
exports.calculateLongestStreak = calculateLongestStreak;
function aggregateSessions(records, period, now = Date.now()) {
    const filtered = records.filter((record) => inPeriod(record.endedAt, period, now));
    const codingTimeMs = filtered.reduce((total, record) => total + codingDuration(record), 0);
    const failures = filtered.reduce((total, record) => total + record.buildFailures.total, 0);
    const recoveredFailures = filtered.reduce((total, record) => total + record.buildFailures.recoveredFailures, 0);
    const longest = filtered.reduce((best, record) => (!best || record.activeDurationMs > best.activeDurationMs ? record : best), null);
    const best = filtered.reduce((bestRecord, record) => (!bestRecord || record.metrics.shippingActivity + record.metrics.focusScore
        > bestRecord.metrics.shippingActivity + bestRecord.metrics.focusScore ? record : bestRecord), null);
    const aiTime = filtered.reduce((total, record) => total + record.coding.aiAssistedMs, 0);
    const promptTotal = filtered.reduce((total, record) => total
        + record.agentPrompts.claudeCode
        + record.agentPrompts.codex
        + record.agentPrompts.githubCopilot, 0);
    const recoveryRate = failures === 0 ? 100 : percentage(recoveredFailures, failures);
    const streak = calculateLongestStreak(records, now);
    return {
        period,
        sessions: filtered.length,
        codingTimeMs,
        averageSessionMs: filtered.length ? codingTimeMs / filtered.length : 0,
        aiPrompts: promptTotal,
        aiBalance: percentage(aiTime, Math.max(1, codingTimeMs)),
        failures,
        recoveredFailures,
        recoveryRate,
        bestSessionId: best?.id ?? null,
        longestSessionMs: longest?.activeDurationMs ?? 0,
        longestStreak: streak,
        personalRecords: {
            longestSessionMs: maxRecord(records, (record) => record.activeDurationMs),
            highestWeeklyCodingTimeMs: highestWeeklyCodingTime(records),
            bestRecoveryRate: records.reduce((bestRate, record) => Math.max(bestRate, record.metrics.recoveryRate), 0),
            longestStreak: streak,
        },
    };
}
function calculateLongestStreak(records, now = Date.now()) {
    const days = new Set(records.map((record) => localDay(record.endedAt)));
    let best = 0;
    let run = 0;
    const cursor = new Date(now);
    for (let index = 0; index < 3660; index += 1) {
        const key = localDay(cursor.getTime());
        if (days.has(key)) {
            run += 1;
            best = Math.max(best, run);
        }
        else if (run > 0) {
            run = 0;
        }
        cursor.setDate(cursor.getDate() - 1);
    }
    return best;
}
function inPeriod(timestamp, period, now) {
    if (period === 'all')
        return true;
    const current = new Date(now);
    const start = new Date(now);
    if (period === 'today') {
        start.setHours(0, 0, 0, 0);
    }
    else if (period === 'week') {
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    }
    else {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    }
    return timestamp >= start.getTime() && timestamp <= current.getTime();
}
function highestWeeklyCodingTime(records) {
    const buckets = new Map();
    for (const record of records) {
        const date = new Date(record.endedAt);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        const key = date.toISOString();
        buckets.set(key, (buckets.get(key) ?? 0) + codingDuration(record));
    }
    return Math.max(0, ...buckets.values());
}
function codingDuration(record) {
    return record.coding.manualMs + record.coding.aiAssistedMs
        + record.coding.automationMs + record.coding.unknownBulkMs;
}
function maxRecord(records, selector) {
    return Math.max(0, ...records.map(selector));
}
function percentage(value, total) {
    return total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
}
function localDay(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
//# sourceMappingURL=sessionAggregation.js.map