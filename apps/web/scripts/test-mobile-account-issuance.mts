// ISOLATED TEST ONLY: fixture plugin is never registered by the real app.
// It does not implement an HTTP request parser, limiter, or mobile transport.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { drizzle } from 'drizzle-orm/pglite';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { issueMobileSessionCandidate } from '../src/auth/mobile-account-issuance';
import { createMobileAttempt, hashMobileVerifier } from '../src/auth/mobile-attempt-verification';
import * as schema from '../src/auth/schema';

const baseURL = 'https://openfind.example';
const policy = { webClientId: 'test-web-client', androidClientId: 'test-android-client' };
const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as {
  entries: Array<{ tag: string }>;
};
const client = new PGlite();
const db = drizzle(client, { schema });
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
  return Response.json({ keys: [{ ...jwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
};

// Fixture input is set by the local test, never populated from HTTP.
let input = { id: '', verifier: '', token: '' };
const plugin = {
  id: 'test-only-mobile-session',
  endpoints: {
    issueFixture: createAuthEndpoint(
      '/test-only-mobile-session',
      { method: 'POST' },
      async (ctx) => {
        const ok = await issueMobileSessionCandidate(ctx, db, input, policy);
        if (!ok) ctx.setStatus(401);
        return ctx.json({ ok });
      },
    ),
  },
} satisfies BetterAuthPlugin;

try {
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const auth = betterAuth({
    baseURL,
    secret: randomBytes(32).toString('base64url'),
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    socialProviders: {
      google: {
        clientId: policy.webClientId,
        clientSecret: 'fixture-secret',
        disableIdTokenSignIn: true,
      },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: true },
    plugins: [plugin],
  });
  async function prepare(sub: string, email: string) {
    const verifier = randomBytes(32).toString('base64url');
    const attempt = await createMobileAttempt(db, hashMobileVerifier(verifier));
    const token = await new SignJWT({
      nonce: attempt.nonce,
      email,
      email_verified: true,
      name: 'Fixture User',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(policy.webClientId)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    return { id: attempt.id, verifier, token };
  }
  async function call() {
    return auth.handler(
      new Request(`${baseURL}/api/auth/test-only-mobile-session`, {
        method: 'POST',
        headers: { origin: baseURL },
      }),
    );
  }
  async function sessionCookie(response: Response) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const header = response.headers.get('set-cookie');
    assert.ok(header);
    assert.match(header, /HttpOnly/i);
    assert.match(header, /Secure/i);
    const cookie = header.split(';')[0];
    assert.ok(cookie);
    return cookie;
  }
  // Fixture existing web user: same Google subject must map to the same user.
  const context = await auth.$context;
  const webUser = await context.internalAdapter.createUser(
    { name: 'Web user', email: 'web@example.invalid', emailVerified: true },
    { method: 'admin' },
  );
  await context.internalAdapter.createAccount({
    providerId: 'google',
    accountId: 'web-subject',
    userId: webUser.id,
  });
  input = await prepare('web-subject', 'changed@example.invalid');
  const webAttempt = { ...input };
  input = { ...input, verifier: randomBytes(32).toString('base64url') };
  const wrongVerifier = await call();
  assert.equal(wrongVerifier.status, 401);
  assert.equal(wrongVerifier.headers.get('set-cookie'), null);
  input = webAttempt;
  const webCookie = await sessionCookie(await call());
  assert.equal(
    (await auth.api.getSession({ headers: new Headers({ cookie: webCookie }) }))?.user.id,
    webUser.id,
  );
  input = webAttempt;
  const replay = await call();
  assert.equal(replay.status, 401);
  assert.equal(replay.headers.get('set-cookie'), null);

  // Unknown Google subject with same email must not link to the web account.
  input = await prepare('different-subject', 'web@example.invalid');
  const collision = await call();
  assert.equal(collision.status, 401);
  assert.equal(collision.headers.get('set-cookie'), null);
  const collisionAccounts = await client.query('SELECT id FROM account WHERE account_id = $1', [
    'different-subject',
  ]);
  assert.equal(collisionAccounts.rows.length, 0);

  // First mobile login creates a new Google identity; no ID token is stored.
  input = await prepare('mobile-subject', 'mobile@example.invalid');
  const mobileCookie = await sessionCookie(await call());
  const mobileSession = await auth.api.getSession({
    headers: new Headers({ cookie: mobileCookie }),
  });
  assert.ok(mobileSession?.user.id);
  assert.notEqual(mobileSession.user.id, webUser.id);
  const account = await client.query<{
    user_id: string;
    id_token: string | null;
    access_token: string | null;
    refresh_token: string | null;
  }>(
    `SELECT user_id, id_token, access_token, refresh_token FROM account WHERE provider_id = 'google' AND account_id = $1`,
    ['mobile-subject'],
  );
  assert.equal(account.rows[0]?.user_id, mobileSession.user.id);
  assert.equal(account.rows[0]?.id_token, null);
  assert.equal(account.rows[0]?.access_token, null);
  assert.equal(account.rows[0]?.refresh_token, null);
  const signOut = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { origin: baseURL, cookie: mobileCookie },
    }),
  );
  assert.equal(signOut.status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: mobileCookie }) }), null);
  input = await prepare('mobile-subject', 'mobile@example.invalid');
  const repeatedCookie = await sessionCookie(await call());
  assert.equal(
    (await auth.api.getSession({ headers: new Headers({ cookie: repeatedCookie }) }))?.user.id,
    mobileSession.user.id,
  );
  console.log(
    'Isolated candidate mapped identities, issued and revoked a session; no real Google or mobile login tested.',
  );
} finally {
  globalThis.fetch = originalFetch;
  await client.close();
}
