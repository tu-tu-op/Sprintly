export const SPRINTLY_DEVICE_TOKEN_SECRET = 'sprintly.extension.deviceToken';
export const SPRINTLY_DEVELOPMENT_TOKEN_SECRET = 'sprintly.extension.developmentToken';

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

  async get(environment: 'development' | 'production', configuredDevelopmentToken = ''): Promise<string | null> {
    const secureKey = environment === 'production'
      ? SPRINTLY_DEVICE_TOKEN_SECRET
      : SPRINTLY_DEVELOPMENT_TOKEN_SECRET;
    const secureToken = (await this.secrets.get(secureKey))?.trim();
    if (secureToken) return secureToken;
    if (environment === 'development') return configuredDevelopmentToken.trim() || null;
    return null;
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

  async has(environment: 'development' | 'production', configuredDevelopmentToken = ''): Promise<boolean> {
    return (await this.get(environment, configuredDevelopmentToken)) !== null;
  }
}
