/**
 * @file RequestSigner.ts
 * @brief Canonical HTTP request digest and ECDSA P-256 signature builder.
 *
 * @license See LICENSE.md
 */

import { generateRandomId } from '../../../domain/crypto/randomId';
import { sha256HexSync } from '../../../domain/crypto/sha256';
import { MANAGED_PROTOCOL_VERSION } from '../protocol/managedTypes';
import type { DeviceKeyManager } from '../identity/DeviceKeyManager';

export interface CanonicalRequestParts {
  method: string;
  path: string;
  timestampMs: string;
  nonce: string;
  idempotencyKey?: string;
  bodySha256Hex: string;
}

export function buildCanonicalRequest(parts: CanonicalRequestParts): string {
  return [
    parts.method.toUpperCase(),
    parts.path,
    parts.timestampMs,
    parts.nonce,
    parts.idempotencyKey ?? '',
    parts.bodySha256Hex
  ].join('\n');
}

export interface SignGatewayRequestParams {
  method: string;
  path: string;
  body?: string;
  idempotencyKey?: string;
  nonce?: string;
  timestampMs?: number;
}

export interface IRequestSigner {
  signRequest(params: SignGatewayRequestParams): Promise<Record<string, string>>;
}

export class RequestSigner implements IRequestSigner {
  private readonly keyManager: DeviceKeyManager;

  constructor(keyManager: DeviceKeyManager) {
    this.keyManager = keyManager;
  }

  public async signRequest(params: SignGatewayRequestParams): Promise<Record<string, string>> {
    const timestampMs = String(params.timestampMs ?? Date.now());
    const nonce = params.nonce ?? generateRandomId('nonce');
    const bodySha256Hex = sha256HexSync(params.body ?? '');

    const canonical = buildCanonicalRequest({
      method: params.method,
      path: params.path,
      timestampMs,
      nonce,
      idempotencyKey: params.idempotencyKey,
      bodySha256Hex
    });

    const signed = await this.keyManager.signCanonicalString(canonical);

    const headers: Record<string, string> = {
      'X-FCR-Protocol-Version': MANAGED_PROTOCOL_VERSION,
      'X-FCR-Key-Id': signed.keyId,
      'X-FCR-Timestamp': timestampMs,
      'X-FCR-Nonce': nonce,
      'X-FCR-Body-Sha256': bodySha256Hex,
      'X-FCR-Signature': signed.signatureB64Url
    };

    if (params.idempotencyKey) {
      headers['X-FCR-Idempotency-Key'] = params.idempotencyKey;
    }

    return headers;
  }
}
