import * as vscode from 'vscode';

export type TelemetryCategory = 'codingActivity' | 'agentUsage' | 'buildFailures';

export interface SprintlyPrivacySettings {
  enabled: boolean;
  autoPromptOnStartup: boolean;
  trackCodingActivity: boolean;
  trackAgentUsage: boolean;
  trackBuildFailures: boolean;
  cloudSyncEnabled: boolean;
  aiTrackingVisible: boolean;
}

export function getPrivacySettings(): SprintlyPrivacySettings {
  const configuration = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('sprintly')
    : undefined;
  const get = <T>(key: string, fallback: T): T => configuration?.get<T>(key, fallback) ?? fallback;
  return {
    enabled: get<boolean>('enabled', true) !== false,
    autoPromptOnStartup: get<boolean>('autoPromptOnStartup', true) !== false,
    trackCodingActivity: get<boolean>('telemetry.trackCodingActivity', true) !== false,
    trackAgentUsage: get<boolean>('telemetry.trackAgentUsage', true) !== false,
    trackBuildFailures: get<boolean>('telemetry.trackBuildFailures', true) !== false,
    cloudSyncEnabled: get<boolean>('cloudSyncEnabled', false) === true,
    aiTrackingVisible: get<boolean>('telemetry.showAiTracking', true) !== false,
  };
}

export function isTelemetryCategoryEnabled(category: TelemetryCategory): boolean {
  const settings = getPrivacySettings();
  if (!settings.enabled) return false;
  if (category === 'codingActivity') return settings.trackCodingActivity;
  if (category === 'agentUsage') return settings.trackAgentUsage;
  return settings.trackBuildFailures;
}
