"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDeveloperMetrics = calculateDeveloperMetrics;
exports.deriveDeveloperProfile = deriveDeveloperProfile;
exports.calculateSessionScore = calculateSessionScore;
function calculateDeveloperMetrics(input) {
    const sessionMs = Math.max(0, input.sessionDurationMs);
    const codingMs = codingDuration(input);
    const commands = Math.max(0, input.terminalCommands);
    const categories = input.terminalCommandsByCategory ?? {};
    const validationCommands = sum(categories.test, categories.build, categories.lint);
    const knownCodingMs = Math.max(0, input.coding.manualMs + input.coding.aiAssistedMs + input.coding.automationMs);
    const failures = Math.max(0, input.failures);
    return {
        focusScore: percentage(codingMs, sessionMs),
        contextSwitches: Math.max(0, input.fileSwitches),
        shippingActivity: percentage(input.successfulRuns + Math.max(0, categories.git ?? 0), Math.max(1, commands)),
        testingDiscipline: percentage(validationCommands, Math.max(1, commands)),
        aiBalance: percentage(input.coding.aiAssistedMs, Math.max(1, knownCodingMs)),
        recoveryRate: failures === 0 ? 100 : percentage(input.recoveredFailures, failures),
        cleanRun: failures === 0,
    };
}
function deriveDeveloperProfile(input) {
    const metrics = calculateDeveloperMetrics(input);
    const categories = input.terminalCommandsByCategory ?? {};
    const totalCoding = codingDuration(input);
    const manualShare = percentage(input.coding.manualMs, Math.max(1, totalCoding));
    const automationShare = percentage(input.coding.automationMs, Math.max(1, totalCoding));
    const traits = [];
    if (input.terminalCommands >= 5)
        traits.push('Terminal-heavy');
    if (metrics.aiBalance >= 25)
        traits.push('AI-assisted');
    if (metrics.recoveryRate >= 80 && input.failures > 0)
        traits.push('High recovery');
    if (metrics.testingDiscipline >= 50)
        traits.push('Validation-minded');
    if (metrics.contextSwitches >= Math.max(3, input.fileEdits / 3))
        traits.push('Fast exploration');
    if (metrics.focusScore >= 80)
        traits.push('Deep focus');
    let primary = 'Steady Builder';
    if (automationShare >= 40) {
        primary = 'Refactor Addict';
    }
    else if ((categories.test ?? 0) >= 2 && metrics.testingDiscipline >= 50) {
        primary = 'Test Monk';
    }
    else if (input.failures >= 2 && metrics.recoveryRate >= 80) {
        primary = 'Debugging Goblin';
    }
    else if (input.successfulRuns >= 3 && metrics.shippingActivity >= 60) {
        primary = 'Shipping Machine';
    }
    else if (metrics.aiBalance >= 60) {
        primary = 'AI Whisperer';
    }
    else if (input.terminalCommands >= 5) {
        primary = 'Terminal Warrior';
    }
    else if (metrics.aiBalance >= 25) {
        primary = 'Vibe Coder';
    }
    else if (manualShare >= 70 && metrics.focusScore >= 80) {
        primary = 'Hardcore Coder';
    }
    else if (input.fileEdits > 0 && input.fileSaves >= input.fileEdits * 0.8) {
        primary = 'Precision Coder';
    }
    return { primary, traits: traits.slice(0, 3), metrics };
}
/**
 * Versioned per-session score used in the local contract.  This is a
 * normalized 0-100 score; the website may present it differently, but the
 * extension always produces the same value for the same observed metrics.
 */
function calculateSessionScore(input) {
    const metrics = calculateDeveloperMetrics(input);
    const consistency = percentage(Math.min(Math.max(0, input.fileSaves), Math.max(1, input.fileEdits)), Math.max(1, input.fileEdits));
    const aiBalance = balancedAiScore(metrics.aiBalance);
    const devScore = Math.round(metrics.focusScore * 0.25
        + consistency * 0.15
        + metrics.recoveryRate * 0.15
        + metrics.testingDiscipline * 0.2
        + metrics.shippingActivity * 0.15
        + aiBalance * 0.1);
    return {
        devScoreVersion: 1,
        focus: metrics.focusScore,
        consistency,
        recovery: metrics.recoveryRate,
        testingDiscipline: metrics.testingDiscipline,
        shippingActivity: metrics.shippingActivity,
        aiBalance: metrics.aiBalance,
        devScore: Math.max(0, Math.min(100, devScore)),
    };
}
function codingDuration(input) {
    return Math.max(0, input.coding.manualMs
        + input.coding.aiAssistedMs
        + input.coding.automationMs
        + input.coding.unknownBulkMs);
}
function percentage(value, total) {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0)
        return 0;
    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}
function balancedAiScore(aiBalance) {
    return aiBalance > 0
        ? Math.max(0, 100 - Math.abs(aiBalance - 35) * 2)
        : 50;
}
function sum(...values) {
    return values.reduce((total, value) => total + Math.max(0, value ?? 0), 0);
}
//# sourceMappingURL=developerMetrics.js.map