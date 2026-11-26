/**
 * @file DeviceKeyManager.ts
 * @brief Cross-platform Web Crypto ECDSA P-256 keypair lifecycle and signing manager.
 *
 * @license See LICENSE.md
 */

import { NormalizedAgentError } from '../../../domain/AgentError';
import type { SecretStorageAdapter } from './SecretStorageAdapter';

export interface DeviceKeyMaterial {
  keyId: string;
  publicKeySpkiB64Url: string;
  privateKey: CryptoKey;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64Url: string): Uint8Array {
  const padded =
    b64Url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64Url.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function requireSubtle(): SubtleCrypto {
  const subtle = typeof window !== 'undefined' ? window.crypto?.subtle : undefined;
  if (!subtle) {
    throw new NormalizedAgentError({
      code: 'authentication_required',
      message: 'Web Crypto API (SubtleCrypto) is unavailable in this environment.'
    });
  }
  return subtle;
}

export class DeviceKeyManager {
  private readonly secretStorage: SecretStorageAdapter;
  private cached: DeviceKeyMaterial | null = null;

  constructor(secretStorage: SecretStorageAdapter) {
    this.secretStorage = secretStorage;
  }

  private async computeKeyId(spkiBytes: Uint8Array): Promise<string> {
    const subtle = requireSubtle();
    const copy = new Uint8Array(spkiBytes.byteLength);
    copy.set(spkiBytes);
    const digest = await subtle.digest('SHA-256', copy.buffer);
    return bytesToBase64Url(new Uint8Array(digest));
  }

  private async importRuntimeSigningKey(subtle: SubtleCrypto, jwk: JsonWebKey): Promise<CryptoKey> {
    return subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }

  public async ensureKeyPair(): Promise<DeviceKeyMaterial> {
    if (this.cached) {
      return this.cached;
    }

    const subtle = requireSubtle();
    const storedPrivJwk = this.secretStorage.getSecret('priv-jwk');
    const storedPubSpki = this.secretStorage.getSecret('pub-spki');

    if (storedPrivJwk && storedPubSpki) {
      try {
        const jwk = JSON.parse(storedPrivJwk) as JsonWebKey;
        const privateKey = await this.importRuntimeSigningKey(subtle, jwk);
        const keyId = await this.computeKeyId(base64UrlToBytes(storedPubSpki));
        this.cached = {
          keyId,
          publicKeySpkiB64Url: storedPubSpki,
          privateKey
        };
        return this.cached;
      } catch {
        // Stored key material corrupted; clear and regenerate below.
        this.secretStorage.clearAll();
      }
    }

    const generated = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify'
    ]);

    const privJwk = await subtle.exportKey('jwk', generated.privateKey);
    const pubSpkiBuffer = await subtle.exportKey('spki', generated.publicKey);
    const pubSpkiBytes = new Uint8Array(pubSpkiBuffer);
    const publicKeySpkiB64Url = bytesToBase64Url(pubSpkiBytes);
    const keyId = await this.computeKeyId(pubSpkiBytes);

    this.secretStorage.setSecret('priv-jwk', JSON.stringify(privJwk));
    this.secretStorage.setSecret('pub-spki', publicKeySpkiB64Url);

    // Re-import non-extractable runtime handle for signing operations
    const runtimePrivKey = await this.importRuntimeSigningKey(subtle, privJwk);

    this.cached = {
      keyId,
      publicKeySpkiB64Url,
      privateKey: runtimePrivKey
    };
    return this.cached;
  }

  public async signCanonicalString(canonical: string): Promise<{
    keyId: string;
    publicKeySpkiB64Url: string;
    signatureB64Url: string;
  }> {
    const subtle = requireSubtle();
    const material = await this.ensureKeyPair();
    const bytes = new TextEncoder().encode(canonical);
    const sigBuffer = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      material.privateKey,
      bytes
    );

    return {
      keyId: material.keyId,
      publicKeySpkiB64Url: material.publicKeySpkiB64Url,
      signatureB64Url: bytesToBase64Url(new Uint8Array(sigBuffer))
    };
  }

  public clear(): void {
    this.cached = null;
    this.secretStorage.clearAll();
  }
}
