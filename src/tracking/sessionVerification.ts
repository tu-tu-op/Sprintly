import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';
import type * as vscode from 'vscode';
import {
  DEVSTRAVA_SESSION_SCHEMA_VERSION,
  DevStravaSessionContract,
  validateSessionContract,
} from './sessionSchema';

export const DEVSTRAVA_SIGNATURE_SCHEMA_VERSION = 'devstrava.signature.v1' as const;

export interface SignedSessionPacket {
  schemaVersion: typeof DEVSTRAVA_SESSION_SCHEMA_VERSION;
  signatureVersion: typeof DEVSTRAVA_SIGNATURE_SCHEMA_VERSION;
  payload: DevStravaSessionContract;
  signature: string;
  publicKey: string;
}

export interface SessionPacketSigner {
  sign(payload: DevStravaSessionContract): Promise<SignedSessionPacket>;
  verify(packet: SignedSessionPacket): Promise<boolean>;
}

/**
 * Optional future-verification service. Keys remain in VS Code SecretStorage;
 * no private key or signature is included in normal exports/handoffs.
 */
export class LocalSessionPacketSigner implements SessionPacketSigner {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async sign(payload: DevStravaSessionContract): Promise<SignedSessionPacket> {
    const keys = await this.getOrCreateKeys();
    const body = canonicalJson(payload);
    const signature = sign(null, Buffer.from(body, 'utf8'), createPrivateKey(keys.privateKey));
    return {
      schemaVersion: DEVSTRAVA_SESSION_SCHEMA_VERSION,
      signatureVersion: DEVSTRAVA_SIGNATURE_SCHEMA_VERSION,
      payload,
      signature: signature.toString('base64'),
      publicKey: keys.publicKey,
    };
  }

  async verify(packet: SignedSessionPacket): Promise<boolean> {
    if (packet.schemaVersion !== DEVSTRAVA_SESSION_SCHEMA_VERSION
      || packet.signatureVersion !== DEVSTRAVA_SIGNATURE_SCHEMA_VERSION) {
      return false;
    }
    const validation = validateSessionContract(packet.payload);
    if (!validation.ok) return false;
    try {
      return verify(
        null,
        Buffer.from(canonicalJson(packet.payload), 'utf8'),
        createPublicKey(packet.publicKey),
        Buffer.from(packet.signature, 'base64'),
      );
    } catch {
      return false;
    }
  }

  private async getOrCreateKeys(): Promise<{ privateKey: string; publicKey: string }> {
    const privateKey = await this.secrets.get('devstrava.session.privateKey');
    const publicKey = await this.secrets.get('devstrava.session.publicKey');
    if (privateKey && publicKey) return { privateKey, publicKey };

    const generated = generateKeyPairSync('ed25519');
    const next = {
      privateKey: generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKey: generated.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
    await this.secrets.store('devstrava.session.privateKey', next.privateKey);
    await this.secrets.store('devstrava.session.publicKey', next.publicKey);
    return next;
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
