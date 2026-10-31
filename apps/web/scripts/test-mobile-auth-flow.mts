// Isolated integration fixture only: no Google account, public route, or phone.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { drizzle } from 'drizzle-orm/pglite';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { MobileAuthController } from '../../mobile/src/auth/mobile-auth-controller';
import { issueMobileSessionCandidate } from '../src/auth/mobile-account-issuance';
import { createMobileAttempt, hashMobileVerifier } from '../src/auth/mobile-attempt-verification';
import { createMobileExchangeHandler } from '../src/auth/mobile-exchange-handler';
import { createMobileStartHandler } from '../src/auth/mobile-start-handler';
import * as schema from '../src/auth/schema';

const base = 'https://fixture.example';
const policy = { webClientId: 'fixture-web-client', androidClientId: 'fixture-android-client' };
const client = new PGlite();
const db = drizzle(client, { schema });
const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as { entries: Array<{ tag: string }> };
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
  return Response.json({ keys: [{ ...jwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
};
let fixtureInput = { id: '', verifier: '', token: '' };
const fixturePlugin = {
  id: 'test-only-mobile-flow',
  endpoints: {
    issueFixture: createAuthEndpoint('/test-only-issue', { method: 'POST' }, async (ctx) => {
      const ok = await issueMobileSessionCandidate(ctx, db, fixtureInput, policy);
      if (!ok) ctx.setStatus(401);
      return ctx.json({ ok });
    }),
  },
} satisfies BetterAuthPlugin;
try {
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const auth = betterAuth({
    baseURL: base,
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
    plugins: [fixturePlugin],
  });
  const authContext = await auth.$context;
  const webUser = await authContext.internalAdapter.createUser(
    { name: 'Web user', email: 'fixture@example.invalid', emailVerified: true },
    { method: 'admin' },
  );
  await authContext.internalAdapter.createAccount({
    providerId: 'google',
    accountId: 'fixture-google-sub',
    userId: webUser.id,
  });
  const start = createMobileStartHandler({
    allowAttempt: async () => true,
    createAttempt: (hash) => createMobileAttempt(db, hash),
  });
  const exchange = createMobileExchangeHandler({
    allowAttempt: async () => true,
    issueSession: async (input) => {
      fixtureInput = input; // Fixture is serial and must never be used as a real adapter.
      const issued = await auth.handler(
        new Request(`${base}/api/auth/test-only-issue`, {
          method: 'POST',
          headers: { origin: base },
        }),
      );
      if (issued.status !== 200) return null;
      const header = issued.headers.get('set-cookie');
      const cookie = header?.split(';')[0];
      return cookie || null;
    },
  });
  let saved: string | null = null;
  let lastInput: { id: string; verifier: string; token: string } | undefined;
  const post = (path: string, body: object) =>
    new Request(`${base}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const controller = new MobileAuthController({
    createProof: () => {
      const verifier = randomBytes(32).toString('base64url');
      return { verifier, verifierHash: hashMobileVerifier(verifier) };
    },
    start: async (verifierHash) => {
      const result = await start(post('start', { verifierHash }));
      assert.equal(result.status, 200);
      return result.json() as Promise<{ id: string; nonce: string }>;
    },
    google: async (nonce) => ({
      status: 'ok',
      token: await new SignJWT({
        nonce,
        email: 'fixture@example.invalid',
        email_verified: true,
        name: 'Test',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
        .setIssuer('https://accounts.google.com')
        .setAudience(policy.webClientId)
        .setSubject('fixture-google-sub')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
    }),
    exchange: async (input) => {
      lastInput = input;
      const result = await exchange(post('exchange', input));
      assert.equal(result.status, 200);
      return ((await result.json()) as { session: string }).session;
    },
    read: async () => saved,
    save: async (session) => {
      saved = session;
    },
    remove: async () => {
      saved = null;
    },
    validate: async (session) =>
      (await auth.api.getSession({ headers: new Headers({ cookie: session }) }))
        ? 'valid'
        : 'invalid',
    revoke: async (session) => {
      const result = await auth.handler(
        new Request(`${base}/api/auth/sign-out`, {
          method: 'POST',
          headers: { origin: base, cookie: session },
        }),
      );
      assert.equal(result.status, 200);
    },
    clearProvider: async () => {},
  });
  assert.equal(await controller.signIn(), 'authenticated');
  assert.ok(saved);
  const issuedCookie = saved;
  assert.equal(
    (await auth.api.getSession({ headers: new Headers({ cookie: issuedCookie }) }))?.user.id,
    webUser.id,
  );
  assert.equal(await controller.checkSession(), 'authenticated');
  assert.ok(lastInput);
  assert.equal((await exchange(post('exchange', lastInput))).status, 401);
  assert.equal(await controller.signOut(), 'signed-out');
  assert.equal(saved, null);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: issuedCookie }) }), null);
  console.log('PASS: isolated mobile login, account binding, replay rejection and logout');
} finally {
  globalThis.fetch = originalFetch;
  await client.close();
}
