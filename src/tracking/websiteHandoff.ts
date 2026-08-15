import * as vscode from 'vscode';
import type { LocalSessionStore, SessionHistoryRecord } from './localSessionStore';
import {
  DEVSTRAVA_SESSION_SCHEMA_VERSION,
  DevStravaExportPayload,
  DevStravaSessionContract,
} from './sessionSchema';
import { aggregateSessions } from './sessionAggregation';
import { toSessionContract } from './localSessionStore';

export interface SessionSharePayload {
  schemaVersion: typeof DEVSTRAVA_SESSION_SCHEMA_VERSION;
  payloadType: 'session.share.v1';
  session: DevStravaSessionContract;
}

export interface HistorySyncPayload {
  schemaVersion: typeof DEVSTRAVA_SESSION_SCHEMA_VERSION;
  payloadType: 'history.sync.v1';
  sessions: DevStravaSessionContract[];
  aggregateMetadata: DevStravaExportPayload['aggregates'];
}

export interface LeaderboardPayload {
  schemaVersion: typeof DEVSTRAVA_SESSION_SCHEMA_VERSION;
  payloadType: 'leaderboard.aggregate.v1';
  week: string;
  region: string | null;
  sessions: number;
  activeMinutes: number;
  focusScore: number;
  recoveryScore: number;
  devScore: number;
  streak: number;
}

export type WebsiteHandoffPayload = SessionSharePayload | HistorySyncPayload | LeaderboardPayload;

export function createSessionSharePayload(record: SessionHistoryRecord): SessionSharePayload {
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    payloadType: 'session.share.v1',
    session: toSessionContract(record),
  };
}

export function createHistorySyncPayload(store: LocalSessionStore, now = Date.now()): HistorySyncPayload {
  const exported = store.export(now);
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    payloadType: 'history.sync.v1',
    sessions: exported.sessions,
    aggregateMetadata: exported.aggregates,
  };
}

export function createLeaderboardPayload(
  records: readonly SessionHistoryRecord[],
  region: string | null = null,
  now = Date.now(),
): LeaderboardPayload {
  const aggregation = aggregateSessions(records, 'week', now);
  return {
    schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
    payloadType: 'leaderboard.aggregate.v1',
    week: isoWeek(now),
    region: region || null,
    sessions: aggregation.sessions,
    activeMinutes: Math.round(aggregation.activeTimeMs / 60_000),
    focusScore: aggregation.averageFocusScore,
    recoveryScore: aggregation.recoveryRate,
    devScore: aggregation.devScore,
    streak: aggregation.currentStreak,
  };
}

export function isoWeek(timestamp: number): string {
  const date = new Date(timestamp);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface HandoffResult {
  uri: vscode.Uri;
  openedWebsite: boolean;
}

/**
 * The initial bridge is a user-selected JSON file handoff. The extension never
 * posts telemetry or puts payloads in a URL. The website asks the user to
 * import this file after authentication/authorization.
 */
export class WebsiteHandoffService implements vscode.Disposable {
  constructor(private readonly websiteUrl: string = readWebsiteUrl()) {}

  async connectWebsite(): Promise<boolean> {
    const uri = safeWebsiteUri(this.websiteUrl);
    if (!uri || !vscode.env?.openExternal) return false;
    return vscode.env.openExternal(uri);
  }

  async savePayload(
    payload: WebsiteHandoffPayload | DevStravaExportPayload,
    defaultFileName: string,
    openWebsite = false,
  ): Promise<HandoffResult | null> {
    const defaultUri = vscode.Uri.file(defaultFileName);
    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      saveLabel: 'Save DevStrava Data',
      filters: { 'DevStrava JSON': ['json'] },
    });
    if (!uri) return null;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
    let openedWebsite = false;
    if (openWebsite) {
      openedWebsite = await this.connectWebsite();
    }
    return { uri, openedWebsite };
  }

  async readPayload(uri?: vscode.Uri): Promise<unknown | null> {
    const selected = uri ?? (await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Import DevStrava Data',
      filters: { 'DevStrava JSON': ['json'] },
    }))?.[0];
    if (!selected) return null;
    const bytes = await vscode.workspace.fs.readFile(selected);
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  }

  dispose(): void {}
}

export function defaultExportFileName(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `devstrava-export-${date}.json`;
}

function readWebsiteUrl(): string {
  const configuration = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('sprintly')
    : undefined;
  return configuration?.get<string>('websiteUrl', 'https://sprintly.app/connect')
    ?? 'https://sprintly.app/connect';
}

function safeWebsiteUri(value: string): vscode.Uri | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return vscode.Uri.parse(url.toString());
  } catch {
    return null;
  }
}
