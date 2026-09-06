import * as http from 'http';
import * as https from 'https';
import { SprintlySessionContract, SPRINTLY_CONTRACT, SPRINTLY_SCHEMA_VERSION, validateSprintlySession } from '../tracking/sprintlyContract';

export interface HttpRequestOptions {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export type HttpRequest = (options: HttpRequestOptions) => Promise<HttpResponse>;

export interface SprintlyApiClientOptions {
  baseUrl: string;
  token?: string | null;
  request?: HttpRequest;
  timeoutMs?: number;
}

export interface SprintlyHealthResponse {
  ok: true;
  contract: typeof SPRINTLY_CONTRACT;
  schemaVersion: typeof SPRINTLY_SCHEMA_VERSION;
}

export interface RejectedSession {
  sessionId: string;
  reason: string;
}

export interface SprintlyUploadResult {
  acceptedSessionIds: string[];
  duplicateSessionIds: string[];
  rejected: RejectedSession[];
}

export type SprintlyApiErrorKind =
  | 'network'
  | 'unauthorized'
  | 'revoked-device'
  | 'validation'
  | 'contract'
  | 'http';

export class SprintlyApiError extends Error {
  readonly name = 'SprintlyApiError';
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly kind: SprintlyApiErrorKind;
  readonly rejected: RejectedSession[];

  constructor(
    message: string,
    options: {
      kind: SprintlyApiErrorKind;
      retryable?: boolean;
      status?: number;
      rejected?: RejectedSession[];
    },
  ) {
    super(message);
    this.kind = options.kind;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.rejected = options.rejected ?? [];
  }
}

export class SprintlyApiClient {
  private readonly baseUrl: URL;
  private readonly token: string | null;
  private readonly request: HttpRequest;
  private readonly timeoutMs: number;

  constructor(options: SprintlyApiClientOptions) {
    this.baseUrl = parseBaseUrl(options.baseUrl);
    this.token = options.token?.trim() || null;
    this.request = options.request ?? nodeHttpRequest;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async health(): Promise<SprintlyHealthResponse> {
    const response = await this.send('GET', '/api/extension/health', undefined, false);
    const body = parseJsonObject(response.body);
    if (response.status < 200 || response.status >= 300) {
      throw apiErrorFromResponse(response.status, body, 'Health check failed');
    }
    if (body.ok !== true
      || body.contract !== SPRINTLY_CONTRACT
      || body.schemaVersion !== SPRINTLY_SCHEMA_VERSION) {
      throw new SprintlyApiError(
        'The website returned an incompatible Sprintly API contract.',
        { kind: 'contract', status: response.status },
      );
    }
    return {
      ok: true,
      contract: SPRINTLY_CONTRACT,
      schemaVersion: SPRINTLY_SCHEMA_VERSION,
    };
  }

  async uploadSessions(sessions: readonly SprintlySessionContract[]): Promise<SprintlyUploadResult> {
    if (!sessions.length) {
      return { acceptedSessionIds: [], duplicateSessionIds: [], rejected: [] };
    }
    const validationErrors = sessions.flatMap((session) => {
      const validation = validateSprintlySession(session);
      return validation.ok ? [] : validation.errors.map((error) => `${session.sessionId}: ${error}`);
    });
    if (validationErrors.length) {
      throw new SprintlyApiError(
        `Session validation failed: ${validationErrors.join('; ')}`,
        { kind: 'validation', rejected: sessions.map((session) => ({
          sessionId: session.sessionId,
          reason: validationErrors.filter((error) => error.startsWith(`${session.sessionId}:`)).join('; '),
        })) },
      );
    }

    const response = await this.send(
      'POST',
      '/api/extension/sessions',
      JSON.stringify({
        contract: SPRINTLY_CONTRACT,
        schemaVersion: SPRINTLY_SCHEMA_VERSION,
        sessions,
      }),
    );
    const body = parseJsonObject(response.body);
    if (response.status === 401) {
      const revoked = isRevokedDevice(body);
      throw new SprintlyApiError(
        revoked ? 'The Sprintly device has been revoked. Reconnect the extension.' : 'Sprintly authorization was rejected.',
        {
          kind: revoked ? 'revoked-device' : 'unauthorized',
          status: response.status,
        },
      );
    }
    if (response.status === 400) {
      const rejected = parseRejected(body, sessions);
      throw new SprintlyApiError(
        `The website rejected ${rejected.length} session${rejected.length === 1 ? '' : 's'}.`,
        { kind: 'validation', status: response.status, rejected },
      );
    }
    if (response.status === 409) {
      return parseUploadResult(body, sessions, true);
    }
    if (response.status < 200 || response.status >= 300) {
      throw apiErrorFromResponse(response.status, body, 'Session upload failed');
    }
    return parseUploadResult(body, sessions, false);
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body?: string,
    includeAuth = method === 'POST',
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (includeAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    try {
      return await this.request({
        method,
        url: new URL(path, this.baseUrl).toString(),
        headers,
        body,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (error instanceof SprintlyApiError) throw error;
      const message = error instanceof Error ? error.message : 'The Sprintly website could not be reached.';
      throw new SprintlyApiError(`Sprintly network error: ${message}`, { kind: 'network', retryable: true });
    }
  }
}

export const nodeHttpRequest: HttpRequest = (options) => new Promise((resolve, reject) => {
  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    reject(new Error('Invalid Sprintly API URL.'));
    return;
  }
  const transport = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
  if (!transport) {
    reject(new Error('Sprintly API URL must use http or https.'));
    return;
  }
  const request = transport.request(url, {
    method: options.method,
    headers: options.headers,
  }, (response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size <= 2 * 1024 * 1024) chunks.push(buffer);
    });
    response.on('end', () => {
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Sprintly response was too large.'));
        return;
      }
      const headers: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of Object.entries(response.headers)) headers[key] = value;
      resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString('utf8') });
    });
    response.on('error', reject);
  });
  request.setTimeout(options.timeoutMs, () => request.destroy(new Error('Sprintly request timed out.')));
  request.on('error', reject);
  if (options.body !== undefined) request.write(options.body);
  request.end();
});

function parseBaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    url.pathname = url.pathname.replace(/\/+$/, '/') || '/';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    throw new SprintlyApiError('Sprintly API URL must use http or https.', { kind: 'contract' });
  }
}

function parseJsonObject(body: string): Record<string, unknown> {
  if (!body.trim()) return {};
  try {
    const value: unknown = JSON.parse(body);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function parseUploadResult(
  body: Record<string, unknown>,
  sessions: readonly SprintlySessionContract[],
  conflict: boolean,
): SprintlyUploadResult {
  const requestedIds = sessions.map((session) => session.sessionId);
  const acceptedSessionIds = parseIds(body.accepted ?? body.acceptedSessions);
  const duplicateSessionIds = parseIds(body.duplicates ?? body.duplicateSessions);
  const rejected = parseRejected(body, sessions);
  if (conflict && !acceptedSessionIds.length && !duplicateSessionIds.length && !rejected.length) {
    return { acceptedSessionIds: [], duplicateSessionIds: requestedIds, rejected: [] };
  }
  if (!acceptedSessionIds.length && !duplicateSessionIds.length && !rejected.length && body.ok === true) {
    return { acceptedSessionIds: requestedIds, duplicateSessionIds: [], rejected: [] };
  }
  return { acceptedSessionIds, duplicateSessionIds, rejected };
}

function parseRejected(
  body: Record<string, unknown>,
  sessions: readonly SprintlySessionContract[],
): RejectedSession[] {
  const raw = body.rejected ?? body.errors;
  if (isRecord(raw)) {
    return Object.entries(raw).map(([sessionId, reason]) => ({
      sessionId,
      reason: typeof reason === 'string' ? reason : 'The website rejected this session.',
    }));
  }
  if (!Array.isArray(raw)) {
    if (typeof body.reason === 'string') {
      return sessions.map((session) => ({ sessionId: session.sessionId, reason: body.reason as string }));
    }
    return [];
  }
  return raw.flatMap((entry): RejectedSession[] => {
    if (typeof entry === 'string') {
      return [{ sessionId: findSessionId(entry, sessions), reason: entry }];
    }
    if (!isRecord(entry)) return [];
    const sessionId = typeof entry.sessionId === 'string'
      ? entry.sessionId
      : typeof entry.id === 'string' ? entry.id : '';
    const reason = typeof entry.reason === 'string'
      ? entry.reason
      : typeof entry.message === 'string' ? entry.message : 'The website rejected this session.';
    return sessionId ? [{ sessionId, reason }] : [];
  });
}

function parseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (isRecord(entry) && typeof entry.sessionId === 'string') return [entry.sessionId];
    if (isRecord(entry) && typeof entry.id === 'string') return [entry.id];
    return [];
  });
}

function findSessionId(reason: string, sessions: readonly SprintlySessionContract[]): string {
  return sessions.find((session) => reason.includes(session.sessionId))?.sessionId ?? 'unknown';
}

function apiErrorFromResponse(
  status: number,
  body: Record<string, unknown>,
  prefix: string,
): SprintlyApiError {
  const detail = typeof body.message === 'string' ? `: ${body.message}` : '';
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  return new SprintlyApiError(`${prefix} (${status})${detail}`, {
    kind: 'http',
    status,
    retryable,
  });
}

function isRevokedDevice(body: Record<string, unknown>): boolean {
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
  const error = typeof body.error === 'string' ? body.error.toUpperCase() : '';
  return body.revoked === true
    || code === 'DEVICE_REVOKED'
    || code === 'REVOKED_DEVICE'
    || error === 'DEVICE_REVOKED'
    || error === 'REVOKED_DEVICE'
    || (typeof body.message === 'string' && body.message.toLowerCase().includes('revoked'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
