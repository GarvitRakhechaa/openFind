import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  createMobileGoogleNonce,
  hashMobileGoogleNonce,
  verifyMobileGoogleToken,
} from '../src/auth/mobile-google-verifier';

// Synthetic keys and mocked Google JWKS fetch only: no account or network use.
const { privateKey, publicKey } = await generateKeyPair('RS256');
const otherKey = (await generateKeyPair('RS256')).privateKey;
const publicJwk = await exportJWK(publicKey);
const originalFetch = globalThis.fetch;
let fetches = 0;
let keysUnavailable = true;
globalThis.fetch = async (input) => {
  assert.equal(String(input), 'https://www.googleapis.com/oauth2/v3/certs');
  fetches += 1;
  if (keysUnavailable) return new Response(null, { status: 503 });
  return Response.json({ keys: [{ ...publicJwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
};

try {
  const policy = { webClientId: 'fixture-web-client', androidClientId: 'fixture-android-client' };
  const { nonce, nonceHash } = createMobileGoogleNonce();
  const { nonceHash: otherNonceHash } = createMobileGoogleNonce();
  const now = Math.floor(Date.now() / 1000);
  const defaults: Record<string, unknown> = {
    iss: 'https://accounts.google.com',
    sub: 'google-subject-fixture',
    aud: policy.webClientId,
    azp: policy.androidClientId,
    iat: now,
    exp: now + 300,
    nonce,
    email: 'Fixture@example.invalid',
    email_verified: true,
  };
  async function signed(changes: Record<string, unknown> = {}, key = privateKey): Promise<string> {
    const claims = { ...defaults, ...changes };
    for (const [name, value] of Object.entries(claims)) {
      if (value === undefined) delete claims[name];
    }
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).sign(key);
  }
  const valid = await signed();
  assert.equal(
    await verifyMobileGoogleToken(valid, nonceHash, policy),
    null,
    'JWKS outage fails closed',
  );
  keysUnavailable = false;
  assert.deepEqual(await verifyMobileGoogleToken(valid, nonceHash, policy), {
    issuer: 'https://accounts.google.com',
    subject: 'google-subject-fixture',
    email: 'fixture@example.invalid',
    name: 'Google user',
  });
  assert.ok(fetches >= 2, 'a failed key fetch should be retried');
  assert.equal(hashMobileGoogleNonce(nonce), nonceHash);
  assert.equal(await verifyMobileGoogleToken(valid, otherNonceHash, policy), null);
  assert.equal(await verifyMobileGoogleToken(valid, 'bad-hash', policy), null);
  assert.equal(await verifyMobileGoogleToken('x'.repeat(8193), nonceHash, policy), null);
  assert.equal(
    await verifyMobileGoogleToken(valid, nonceHash, { ...policy, androidClientId: '' }),
    null,
  );
  assert.throws(() => hashMobileGoogleNonce('bad'), /Invalid nonce/);

  for (const changes of [
    { iss: 'https://not-google.example' },
    { aud: 'other-client' },
    { aud: [policy.webClientId, 'another-client'] },
    { azp: 'unknown-presenter' },
    { azp: 123 },
    { sub: '' },
    { sub: undefined },
    { sub: 'x'.repeat(256) },
    { sub: 'subject\n' },
    { exp: now - 1 },
    { exp: undefined },
    { iat: now + 120 },
    { iat: now - 3601 },
    { iat: undefined },
    { nonce: undefined },
    { nonce: randomBytes(32).toString('base64url') },
    { nonce: 'bad' },
    { email: undefined },
    { email: 'bad' },
    { email_verified: false },
    { email_verified: 'true' },
  ]) {
    assert.equal(await verifyMobileGoogleToken(await signed(changes), nonceHash, policy), null);
  }
  assert.equal(await verifyMobileGoogleToken(await signed({}, otherKey), nonceHash, policy), null);
  const hsToken = await new SignJWT(defaults)
    .setProtectedHeader({ alg: 'HS256', kid: 'fixture-key' })
    .sign(randomBytes(32));
  assert.equal(await verifyMobileGoogleToken(hsToken, nonceHash, policy), null);
  assert.deepEqual(
    await verifyMobileGoogleToken(
      await signed({ iss: 'accounts.google.com', azp: undefined }),
      nonceHash,
      policy,
    ),
    {
      issuer: 'https://accounts.google.com',
      subject: 'google-subject-fixture',
      email: 'fixture@example.invalid',
      name: 'Google user',
    },
  );
  // Verification alone is intentionally replayable: challenge consumption is separate.
  assert.ok(await verifyMobileGoogleToken(valid, nonceHash, policy));
  assert.ok(await verifyMobileGoogleToken(valid, nonceHash, policy));
  console.log(
    'Google verifier component tests passed with local keys and mocked JWKS; no real Google login tested.',
  );
} finally {
  globalThis.fetch = originalFetch;
}
