import * as vscode from 'vscode';
import { isSyncPreference, SyncPreference } from '../tracking/privacySettings';

export type SprintlyApiEnvironment = 'development' | 'production';

export interface SprintlyConnectionSettings {
  apiUrl: string;
  environment: SprintlyApiEnvironment;
  /** Optional for compatibility with callers created before this setting existed. */
  syncEnabled?: boolean;
  syncPreference: SyncPreference;
  leaderboardOptIn: boolean;
  websiteUrl: string;
}

export const DEFAULT_SPRINTLY_API_URL = 'http://localhost:3000';
// The website's authenticated connection controls live on the local app
// settings route during development. Production installations should set
// sprintly.websiteUrl to the deployed Sprintly settings URL.
export const DEFAULT_SPRINTLY_WEBSITE_URL = 'http://localhost:3000/app/settings';
export const SPRINTLY_API_BASE_URL_ENV = 'SPRINTLY_API_BASE_URL';

export function getSprintlyConnectionSettings(): SprintlyConnectionSettings {
  const configuration = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('sprintly')
    : undefined;
  const get = <T>(key: string, fallback: T): T => configuration?.get<T>(key, fallback) ?? fallback;
  const environment = get<unknown>('apiEnvironment', 'development');
  const configuredPreference = get<unknown>('syncPreference', 'never');
  const environmentApiUrl = process.env[SPRINTLY_API_BASE_URL_ENV]?.trim();
  const configuredApiUrl = get<string>('apiUrl', DEFAULT_SPRINTLY_API_URL).trim();
  return {
    apiUrl: environmentApiUrl || configuredApiUrl || DEFAULT_SPRINTLY_API_URL,
    environment: environment === 'production' ? 'production' : 'development',
    syncEnabled: get<boolean>('syncEnabled', false) === true,
    syncPreference: isSyncPreference(configuredPreference) ? configuredPreference : 'never',
    leaderboardOptIn: get<boolean>('leaderboardOptIn', false) === true,
    websiteUrl: get<string>('websiteUrl', DEFAULT_SPRINTLY_WEBSITE_URL),
  };
}

export function environmentLabel(environment: SprintlyApiEnvironment): string {
  return environment === 'production' ? 'Production' : 'Development';
}
