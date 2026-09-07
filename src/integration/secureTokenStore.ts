import { randomUUID } from 'crypto';

export const SPRINTLY_DEVICE_TOKEN_SECRET = 'sprintly.extension.deviceToken';
export const SPRINTLY_DEVELOPMENT_TOKEN_SECRET = 'sprintly.extension.developmentToken';
export const SPRINTLY_DEVICE_ID_SECRET = 'sprintly.extension.deviceId';

export interface SecureSecretStorage {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): Thenable<void> | Promise<void>;
  delete(key: string): Thenable<void> | Promise<void>;
}

/**
 * SecretStorage is the only persistent owner of extension credentials. The
 * development configuration fallback is read-only and is never copied into
 * any persisted state or export.
 */
export class SprintlyTokenStore {
  constructor(private readonly secrets: SecureSecretStorage) {}

  async get(environment: 'development' | 'production'): Promise<string | null> {
    const secureKey = environment === 'production'
      ? SPRINTLY_DEVICE_TOKEN_SECRET
      : SPRINTLY_DEVELOPMENT_TOKEN_SECRET;
    const secureToken = (await this.secrets.get(secureKey))?.trim();
    if (secureToken) return secureToken;
    return null;
  }

  /**
   * Creates one opaque installation identifier and keeps it stable across
   * reconnects. It is not a user identity and never leaves the pairing body.
   */
  async getOrCreateDeviceId(createId: () => string = randomUUID): Promise<string> {
    const existing = (await this.secrets.get(SPRINTLY_DEVICE_ID_SECRET))?.trim();
    if (isValidDeviceId(existing)) return existing;
    const generated = `vscode-${createId()}`;
    if (!isValidDeviceId(generated)) throw new Error('Could not create a valid Sprintly device ID.');
    await this.secrets.store(SPRINTLY_DEVICE_ID_SECRET, generated);
    return generated;
  }

  async storeDevelopmentToken(token: string): Promise<void> {
    const value = token.trim();
    if (!value) throw new Error('A development token is required.');
    await this.secrets.store(SPRINTLY_DEVELOPMENT_TOKEN_SECRET, value);
  }

  async storeDeviceToken(token: string): Promise<void> {
    const value = token.trim();
    if (!value) throw new Error('A device token is required.');
    await this.secrets.store(SPRINTLY_DEVICE_TOKEN_SECRET, value);
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.secrets.delete(SPRINTLY_DEVICE_TOKEN_SECRET),
      this.secrets.delete(SPRINTLY_DEVELOPMENT_TOKEN_SECRET),
    ]);
  }

  async has(environment: 'development' | 'production'): Promise<boolean> {
    return (await this.get(environment)) !== null;
  }
}

function isValidDeviceId(value: string | undefined): value is string {
  return value !== undefined
    && value.length >= 8
    && value.length <= 200
    && !/[\u0000-\u001F\u007F]/.test(value);
}
