import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Not connected to any route or session issuer. Server-side use only. The
// signing-key location is fixed by the server, never selected by a client.
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const hashPrefix = 'openfind:mobile-auth:nonce:v1\0';
const noncePattern = /^[A-Za-z0-9_-]{43}$/;
const hashPattern = /^[0-9a-f]{64}$/;

function isCanonicalNonce(nonce: string): boolean {
  return (
    nonce.length === 43 &&
    noncePattern.test(nonce) &&
    Buffer.from(nonce, 'base64url').length === 32 &&
    Buffer.from(nonce, 'base64url').toString('base64url') === nonce
  );
}

/** Internal v1 proposal: server creates 32 random bytes and stores only this hash. */
export function createMobileGoogleNonce() {
  const nonce = randomBytes(32).toString('base64url');
  return { nonce, nonceHash: hashMobileGoogleNonce(nonce) };
}

export function hashMobileGoogleNonce(nonce: string): string {
  if (!isCanonicalNonce(nonce)) throw new Error('Invalid nonce format');
  return createHash('sha256').update(hashPrefix, 'utf8').update(nonce, 'utf8').digest('hex');
}

/** All values in this policy must come from trusted server configuration. */
type GooglePolicy = { webClientId: string; androidClientId: string };

/**
 * Verifies a Google token and binds its nonce to a stored hash. This does NOT
 * consume the attempt, verify its expiry or verifier, provision a user, or
 * issue a session. It is not a complete authentication flow.
 */
export async function verifyMobileGoogleToken(
  token: string,
  expectedNonceHash: string,
  policy: GooglePolicy,
): Promise<{ issuer: 'https://accounts.google.com'; subject: string } | null> {
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > 8192 ||
    typeof expectedNonceHash !== 'string' ||
    expectedNonceHash.length !== 64 ||
    !hashPattern.test(expectedNonceHash) ||
    typeof policy?.webClientId !== 'string' ||
    !policy.webClientId.trim() ||
    policy.webClientId !== policy.webClientId.trim() ||
    typeof policy.androidClientId !== 'string' ||
    !policy.androidClientId.trim() ||
    policy.androidClientId !== policy.androidClientId.trim()
  ) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, googleKeys, {
      algorithms: ['RS256'],
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: policy.webClientId,
      requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce'],
      maxTokenAge: '1h',
      clockTolerance: 0,
    });
    // Narrow aud to the one configured server client rather than accepting
    // arbitrary additional audiences. azp can be the Web or Android client.
    if (
      payload.aud !== policy.webClientId ||
      (payload.azp !== undefined &&
        (typeof payload.azp !== 'string' ||
          ![policy.webClientId, policy.androidClientId].includes(payload.azp))) ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.sub.length > 255 ||
      /[^\x21-\x7e]/.test(payload.sub) ||
      typeof payload.iat !== 'number' ||
      !Number.isInteger(payload.iat) ||
      typeof payload.exp !== 'number' ||
      !Number.isInteger(payload.exp) ||
      typeof payload.nonce !== 'string' ||
      !isCanonicalNonce(payload.nonce)
    ) {
      return null;
    }
    const actual = Buffer.from(hashMobileGoogleNonce(payload.nonce), 'hex');
    const expected = Buffer.from(expectedNonceHash, 'hex');
    if (!timingSafeEqual(actual, expected)) return null;
    // Both Google issuer aliases identify the same provider; use a canonical key.
    return { issuer: 'https://accounts.google.com', subject: payload.sub };
  } catch {
    // Includes invalid JWTs and key-service outages. Never emit token contents.
    return null;
  }
}
