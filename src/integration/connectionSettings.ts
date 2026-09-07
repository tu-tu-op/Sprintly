import * as vscode from 'vscode';
import { isSyncPreference, SyncPreference } from '../tracking/privacySettings';

export type SprintlyApiEnvironment = 'development' | 'production';

export interface SprintlyConnectionSettings {
  apiUrl: string;
  environment: SprintlyApiEnvironment;
  syncPreference: SyncPreference;
  leaderboardOptIn: boolean;
  websiteUrl: string;
}

export const DEFAULT_SPRINTLY_API_URL = 'http://localhost:3000';
export const DEFAULT_SPRINTLY_WEBSITE_URL = 'https://sprintly.app/connect';

export function getSprintlyConnectionSettings(): SprintlyConnectionSettings {
  const configuration = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('sprintly')
    : undefined;
  const get = <T>(key: string, fallback: T): T => configuration?.get<T>(key, fallback) ?? fallback;
  const environment = get<unknown>('apiEnvironment', 'development');
  const configuredPreference = get<unknown>('syncPreference', 'never');
  return {
    apiUrl: get<string>('apiUrl', DEFAULT_SPRINTLY_API_URL).trim() || DEFAULT_SPRINTLY_API_URL,
    environment: environment === 'production' ? 'production' : 'development',
    syncPreference: isSyncPreference(configuredPreference) ? configuredPreference : 'never',
    leaderboardOptIn: get<boolean>('leaderboardOptIn', false) === true,
    websiteUrl: get<string>('websiteUrl', DEFAULT_SPRINTLY_WEBSITE_URL),
  };
}

export function environmentLabel(environment: SprintlyApiEnvironment): string {
  return environment === 'production' ? 'Production' : 'Development';
}
