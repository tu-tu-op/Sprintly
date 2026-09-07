import * as vscode from 'vscode';

export type TelemetryCategory = 'codingActivity' | 'agentUsage' | 'terminalActivity' | 'buildFailures';

export type SyncPreference = 'never' | 'selected' | 'completed' | 'leaderboard';

const SYNC_PREFERENCES: readonly SyncPreference[] = [
  'never',
  'selected',
  'completed',
  'leaderboard',
];

export interface SprintlyPrivacySettings {
  enabled: boolean;
  autoPromptOnStartup: boolean;
  localHistoryEnabled: boolean;
  syncEnabled: boolean;
  trackCodingActivity: boolean;
  trackAgentUsage: boolean;
  trackTerminalActivity: boolean;
  trackBuildFailures: boolean;
  cloudSyncEnabled: boolean;
  aiTrackingVisible: boolean;
  syncPreference: SyncPreference;
  leaderboardOptIn: boolean;
}

export function getPrivacySettings(): SprintlyPrivacySettings {
  const configuration = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('sprintly')
    : undefined;
  const get = <T>(key: string, fallback: T): T => configuration?.get<T>(key, fallback) ?? fallback;
  const configuredSyncPreference = get<unknown>('syncPreference', 'never');
  return {
    enabled: get<boolean>('enabled', true) !== false,
    autoPromptOnStartup: get<boolean>('autoPromptOnStartup', true) !== false,
    localHistoryEnabled: get<boolean>('localHistoryEnabled', true) !== false,
    syncEnabled: get<boolean>('syncEnabled', false) === true,
    trackCodingActivity: get<boolean>('telemetry.trackCodingActivity', true) !== false,
    trackAgentUsage: get<boolean>('telemetry.trackAgentUsage', true) !== false,
    trackTerminalActivity: get<boolean>('telemetry.trackTerminalActivity', true) !== false,
    trackBuildFailures: get<boolean>('telemetry.trackBuildFailures', true) !== false,
    cloudSyncEnabled: get<boolean>('cloudSyncEnabled', false) === true,
    aiTrackingVisible: get<boolean>('telemetry.showAiTracking', true) !== false,
    syncPreference: isSyncPreference(configuredSyncPreference) ? configuredSyncPreference : 'never',
    leaderboardOptIn: get<boolean>('leaderboardOptIn', false) === true,
  };
}

export function isSyncPreference(value: unknown): value is SyncPreference {
  return typeof value === 'string' && SYNC_PREFERENCES.includes(value as SyncPreference);
}

export function isTelemetryCategoryEnabled(category: TelemetryCategory): boolean {
  const settings = getPrivacySettings();
  if (!settings.enabled) return false;
  if (category === 'codingActivity') return settings.trackCodingActivity;
  if (category === 'agentUsage') return settings.trackAgentUsage;
  if (category === 'terminalActivity') return settings.trackTerminalActivity;
  return settings.trackBuildFailures;
}
