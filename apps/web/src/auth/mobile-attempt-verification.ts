import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import {
  consumeMobileAttempt,
  insertMobileAttempt,
  readMobileAttempt,
} from '../db/mobile-auth-attempt-queries';
import { createMobileGoogleNonce, verifyMobileGoogleToken } from './mobile-google-verifier';

// Used by the guarded mobile API. Attempt consumption precedes session
// issuance; these operations are not in one transaction and require review.
type AttemptDb = { execute: (query: SQL) => PromiseLike<{ rows: Record<string, unknown>[] }> };
type Policy = { webClientId: string; androidClientId: string };
const commitmentPattern = /^[0-9a-f]{64}$/;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const verifierPrefix = 'openfind:mobile-auth:verifier:v1\0';

function isCanonical32(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 43 || !secretPattern.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value;
}

/** Proposed client commitment for a locally CSPRNG-generated 32-byte verifier. */
export function hashMobileVerifier(verifier: string): string {
  if (!isCanonical32(verifier)) throw new Error('Invalid verifier format');
  return createHash('sha256').update(verifierPrefix, 'utf8').update(verifier, 'utf8').digest('hex');
}

/** Trusted caller must enforce abuse controls and input limits before calling. */
export async function createMobileAttempt(db: AttemptDb, verifierHash: string) {
  if (
    typeof verifierHash !== 'string' ||
    verifierHash.length !== 64 ||
    !commitmentPattern.test(verifierHash)
  ) {
    throw new Error('Invalid verifier commitment');
  }
  const id = randomBytes(32).toString('base64url');
  const { nonce, nonceHash } = createMobileGoogleNonce();
  await db.execute(insertMobileAttempt(id, nonceHash, verifierHash));
  return { id, nonce };
}

/**
 * Verifies token and proof, then atomically consumes the matching attempt.
 * Return value is NOT a session and must not be used as authorization without
 * a separately reviewed account/session issuance and failure-handling design.
 * A database exception propagates; callers must fail closed, never retry as if
 * an exception proves the row was not consumed.
 */
export async function verifyAndConsumeMobileAttempt(
  db: AttemptDb,
  input: { id: string; verifier: string; token: string },
  policy: Policy,
): Promise<{
  issuer: 'https://accounts.google.com';
  subject: string;
  email: string;
  name: string;
} | null> {
  if (
    !isCanonical32(input?.id) ||
    !isCanonical32(input?.verifier) ||
    typeof input?.token !== 'string' ||
    input.token.length === 0 ||
    input.token.length > 8192
  ) {
    return null;
  }
  const result = await db.execute(readMobileAttempt(input.id));
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    typeof row?.nonce_hash !== 'string' ||
    row.nonce_hash.length !== 64 ||
    !commitmentPattern.test(row.nonce_hash) ||
    typeof row.verifier_hash !== 'string' ||
    row.verifier_hash.length !== 64 ||
    !commitmentPattern.test(row.verifier_hash)
  ) {
    return null;
  }
  const verifierHash = hashMobileVerifier(input.verifier);
  if (!timingSafeEqual(Buffer.from(verifierHash, 'hex'), Buffer.from(row.verifier_hash, 'hex'))) {
    return null;
  }
  const identity = await verifyMobileGoogleToken(input.token, row.nonce_hash, policy);
  if (!identity) return null;
  const consumed = await db.execute(consumeMobileAttempt(input.id, row.nonce_hash, verifierHash));
  return consumed.rows.length === 1 ? identity : null;
}
