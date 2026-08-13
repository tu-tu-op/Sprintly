import { DeveloperArchetype, DeveloperProfile } from './developerMetrics';

export interface DeveloperIdentity {
  archetype: DeveloperArchetype;
  avatarId: string;
  accent: string;
  traits: string[];
}

const PERSONAS: Record<DeveloperArchetype, { avatarId: string; accent: string }> = {
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

export function deriveDeveloperIdentity(profile: DeveloperProfile): DeveloperIdentity {
  const persona = PERSONAS[profile.primary];
  return {
    archetype: profile.primary,
    avatarId: persona.avatarId,
    accent: persona.accent,
    traits: [...profile.traits],
  };
}
