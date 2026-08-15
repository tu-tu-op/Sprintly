"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveDeveloperIdentity = deriveDeveloperIdentity;
const PERSONAS = {
    'Vibe Coder': { avatarId: 'vibe-orbit', accent: '#7c3aed' },
    'Hardcore Coder': { avatarId: 'hardcore-forge', accent: '#dc2626' },
    'Precision Coder': { avatarId: 'precision-grid', accent: '#2563eb' },
    'Terminal Warrior': { avatarId: 'terminal-flame', accent: '#059669' },
    'Debugging Goblin': { avatarId: 'debug-goblin', accent: '#ca8a04' },
    'Test Monk': { avatarId: 'test-monk', accent: '#0891b2' },
    'Steady Builder': { avatarId: 'steady-blocks', accent: '#475569' },
    'Shipping Machine': { avatarId: 'shipping-rocket', accent: '#ea580c' },
    'Refactor Addict': { avatarId: 'refactor-loop', accent: '#9333ea' },
    'AI Whisperer': { avatarId: 'ai-whisperer', accent: '#0f766e' },
};
function deriveDeveloperIdentity(profile) {
    const persona = PERSONAS[profile.primary];
    return {
        archetype: profile.primary,
        avatarId: persona.avatarId,
        accent: persona.accent,
        traits: [...profile.traits],
    };
}
//# sourceMappingURL=developerIdentity.js.map