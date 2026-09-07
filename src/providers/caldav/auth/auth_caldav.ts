function utf8BytesFromString(value: string): number[] {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];

  for (let i = 0; i < encoded.length; i += 1) {
    const ch = encoded[i];
    if (ch === '%' && i + 2 < encoded.length) {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }

  return bytes;
}

function base64FromBytes(bytes: number[]): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;

    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? alphabet[triplet & 63] : '=';
  }

  return output;
}

function encodeBase64Utf8(value: string): string {
  const maybeBuffer = (
    window as unknown as {
      Buffer?: {
        from: (input: string, encoding?: string) => { toString: (enc: string) => string };
      };
    }
  ).Buffer;

  if (maybeBuffer) {
    return maybeBuffer.from(value, 'utf-8').toString('base64');
  }

  const bytes = utf8BytesFromString(value);

  if (typeof btoa === 'function') {
    let utf8Binary = '';
    for (const byte of bytes) {
      utf8Binary += String.fromCharCode(byte);
    }

    return btoa(utf8Binary);
  }

  return base64FromBytes(bytes);
}

export function createBasicAuthHeader(username?: string, password?: string): string | undefined {
  if (!username || !password) {
    return undefined;
  }

  return `Basic ${encodeBase64Utf8(`${username}:${password}`)}`;
}
