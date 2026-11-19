import { webcrypto } from 'node:crypto';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { sha256HexSync } from '../../../domain/crypto/sha256';
import { isNormalizedAgentError } from '../../../domain/AgentError';
import { DeviceKeyManager, base64UrlToBytes } from '../identity/DeviceKeyManager';
import { type ISecretBackingStore, SecretStorageAdapter } from '../identity/SecretStorageAdapter';
import { RequestSigner, buildCanonicalRequest } from '../client/RequestSigner';

if (!window.crypto?.subtle) {
  Object.defineProperty(window, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}
if (typeof window.TextEncoder === 'undefined') {
  Object.defineProperty(window, 'TextEncoder', {
    value: NodeTextEncoder,
    configurable: true
  });
}
if (typeof window.TextDecoder === 'undefined') {
  Object.defineProperty(window, 'TextDecoder', {
    value: NodeTextDecoder,
    configurable: true
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createMemorySecretStore(): ISecretBackingStore {
  const data = new Map<string, string>();
  return {
    getSecret: (key: string) => data.get(key) ?? null,
    setSecret: (key: string, value: string) => {
      if (!value) {
        data.delete(key);
      } else {
        data.set(key, value);
      }
    }
  };
}

describe('SecretStorageAdapter & RequestSigner (P-256)', () => {
  it('fails closed when Obsidian SecretStorage is unavailable', () => {
    const adapter = new SecretStorageAdapter(undefined, 'staging', undefined);
    expect(adapter.isSupported()).toBe(false);

    let caught: unknown;
    try {
      adapter.getSecret('priv-jwk');
    } catch (err) {
      caught = err;
    }
    expect(isNormalizedAgentError(caught)).toBe(true);
    if (isNormalizedAgentError(caught)) {
      expect(caught.code).toBe('authentication_required');
    }
  });

  it('scopes secret keys by environment', () => {
    const store = createMemorySecretStore();
    const staging = new SecretStorageAdapter(undefined, 'staging', store);
    const prod = new SecretStorageAdapter(undefined, 'production', store);

    expect(staging.getKeyName('priv-jwk')).toBe('fcr-managed-staging-priv-jwk');
    expect(prod.getKeyName('priv-jwk')).toBe('fcr-managed-production-priv-jwk');
  });

  it('signs canonical requests with ECDSA P-256 and verifies via Web Crypto', async () => {
    const store = createMemorySecretStore();
    const adapter = new SecretStorageAdapter(undefined, 'staging', store);
    const keyManager = new DeviceKeyManager(adapter);
    const signer = new RequestSigner(keyManager);

    const body = JSON.stringify({ messages: [{ role: 'user', content: 'Hello 🌍' }] });
    const headers = await signer.signRequest({
      method: 'POST',
      path: '/v1/chat/completions',
      body,
      idempotencyKey: 'idem-123',
      nonce: 'nonce-abc',
      timestampMs: 1700000000000
    });

    expect(headers['X-FCR-Protocol-Version']).toBe('2026-11-16');
    expect(headers['X-FCR-Body-Sha256']).toBe(sha256HexSync(body));
    expect(headers['X-FCR-Idempotency-Key']).toBe('idem-123');

    const spkiB64Url = adapter.getSecret('pub-spki');
    expect(spkiB64Url).toBeTruthy();

    const spkiBuffer = toArrayBuffer(base64UrlToBytes(spkiB64Url as string));
    const publicKey = await window.crypto.subtle.importKey(
      'spki',
      spkiBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const canonical = buildCanonicalRequest({
      method: 'POST',
      path: '/v1/chat/completions',
      timestampMs: headers['X-FCR-Timestamp'],
      nonce: headers['X-FCR-Nonce'],
      idempotencyKey: headers['X-FCR-Idempotency-Key'],
      bodySha256Hex: headers['X-FCR-Body-Sha256']
    });

    const sigBuffer = toArrayBuffer(base64UrlToBytes(headers['X-FCR-Signature']));
    const canonicalBuffer = toArrayBuffer(new window.TextEncoder().encode(canonical));
    const valid = await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBuffer,
      canonicalBuffer
    );
    expect(valid).toBe(true);

    // Tampered body digest must fail verification
    const tamperedCanonical = buildCanonicalRequest({
      method: 'POST',
      path: '/v1/chat/completions',
      timestampMs: headers['X-FCR-Timestamp'],
      nonce: headers['X-FCR-Nonce'],
      idempotencyKey: headers['X-FCR-Idempotency-Key'],
      bodySha256Hex: sha256HexSync('tampered')
    });
    const invalid = await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBuffer,
      toArrayBuffer(new window.TextEncoder().encode(tamperedCanonical))
    );
    expect(invalid).toBe(false);
  });
});
