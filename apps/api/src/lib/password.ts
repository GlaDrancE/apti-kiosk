import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/**
 * Password hashing on node:crypto's scrypt — no bcrypt/argon2 dependency.
 * scrypt is memory-hard and is the algorithm Node ships for exactly this.
 *
 * Stored as `scrypt$<salt-hex>$<hash-hex>` so the salt travels with the hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verify. Returns false for malformed or missing hashes. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEYLEN) return false;

  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEYLEN);
  return timingSafeEqual(actual, expected);
}

// Ambiguous glyphs are removed: these get read off a printed sheet and typed by
// hand, and 0/O and 1/l/I generate support tickets.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A random password for a bulk-created student account. */
export function generatePassword(length = 10): string {
  // Rejection-free: 256 % 55 != 0 would bias, so draw from a wider pool and mod
  // a value that is uniform over the alphabet by rejecting the tail.
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= 256 - (256 % ALPHABET.length)) continue; // biased tail, redraw
      out.push(ALPHABET[byte % ALPHABET.length]!);
      if (out.length === length) break;
    }
  }
  return out.join('');
}
