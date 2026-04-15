import crypto from 'node:crypto';
import { getEbayEnv } from './env';

type EncPayload = { v: 1; alg: 'A256GCM'; iv: string; tag: string; ct: string };

function parseKey(keyRaw: string): Buffer {
  // Accept base64 or hex.
  const trimmed = keyRaw.trim();
  const asB64 = Buffer.from(trimmed, 'base64');
  if (asB64.length === 32) return asB64;
  const asHex = Buffer.from(trimmed, 'hex');
  if (asHex.length === 32) return asHex;
  throw new Error('EBAY_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or hex).');
}

export function maybeEncrypt(plaintext: string): string {
  const { EBAY_TOKEN_ENCRYPTION_KEY } = getEbayEnv();
  if (!EBAY_TOKEN_ENCRYPTION_KEY) return plaintext;
  const key = parseKey(EBAY_TOKEN_ENCRYPTION_KEY);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncPayload = {
    v: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
  return `enc:${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
}

export function maybeDecrypt(stored: string): string {
  if (!stored.startsWith('enc:')) return stored;
  const { EBAY_TOKEN_ENCRYPTION_KEY } = getEbayEnv();
  if (!EBAY_TOKEN_ENCRYPTION_KEY) {
    throw new Error('Token is encrypted but EBAY_TOKEN_ENCRYPTION_KEY is not set.');
  }
  const key = parseKey(EBAY_TOKEN_ENCRYPTION_KEY);
  const raw = Buffer.from(stored.slice(4), 'base64').toString('utf8');
  const payload = JSON.parse(raw) as EncPayload;
  if (payload.v !== 1 || payload.alg !== 'A256GCM') throw new Error('Unsupported token encryption payload.');
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ct = Buffer.from(payload.ct, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

