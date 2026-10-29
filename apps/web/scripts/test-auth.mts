import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { serializeSignedCookie } from 'better-call';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuth } from '../src/auth/factory';
import { isTrustedAuthPost } from '../src/auth/origin';
import * as schema from '../src/auth/schema';

const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as {
  entries: Array<{ tag: string }>;
};
const db = new PGlite();
const baseURL = 'http://localhost:3000';
const secret = randomBytes(32).toString('base64url');

try {
  assert.equal(
    isTrustedAuthPost(
      new Request(baseURL, { method: 'POST', headers: { origin: baseURL } }),
      baseURL,
    ),
    true,
  );
  assert.equal(
    isTrustedAuthPost(
      new Request(baseURL, { method: 'POST', headers: { origin: 'https://untrusted.example' } }),
      baseURL,
    ),
    false,
  );
  assert.equal(isTrustedAuthPost(new Request(baseURL, { method: 'POST' }), baseURL), false);
  assert.equal(
    isTrustedAuthPost(
      new Request(baseURL, {
        method: 'POST',
        headers: { origin: baseURL, 'sec-fetch-site': 'cross-site' },
      }),
      baseURL,
    ),
    false,
  );
  for (const entry of journal.entries) {
    await db.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  // Synthetic Google configuration and PGlite data; no real Google callback occurs.
  const auth = createAuth(drizzle(db, { schema }), {
    baseURL,
    secret,
    clientId: 'synthetic-google-client-id',
    clientSecret: 'synthetic-google-client-secret',
  });
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { origin: baseURL, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: '/dashboard' }),
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url?: string };
  assert.ok(body.url, 'Google authorization URL should be returned');
  const authorization = new URL(body.url);
  assert.equal(authorization.hostname, 'accounts.google.com');
  assert.equal(
    authorization.searchParams.get('redirect_uri'),
    `${baseURL}/api/auth/callback/google`,
  );
  assert.ok(authorization.searchParams.get('state'), 'OAuth state must exist');
  assert.ok(authorization.searchParams.get('code_challenge'), 'PKCE challenge must exist');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');

  // Mobile token exchange is explicitly disabled pending the reviewed design.
  const idTokenResponse = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { origin: baseURL, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', idToken: { token: 'synthetic-token' } }),
    }),
  );
  assert.equal(idTokenResponse.status, 404, 'direct ID-token sign-in must remain disabled');
  const idTokenError = (await idTokenResponse.json()) as { code?: string };
  assert.equal(idTokenError.code, 'ID_TOKEN_NOT_SUPPORTED');
  console.log('Synthetic ID-token rejection:', idTokenError.code);

  const rejected = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: {
        origin: 'https://untrusted.example',
        'content-type': 'application/json',
        cookie: 'test=present',
      },
      body: JSON.stringify({ provider: 'google', callbackURL: '/dashboard' }),
    }),
  );
  assert.equal(rejected.status, 403, 'untrusted browser origins with cookies must be rejected');

  // Create a synthetic server-side session to test validation and revocation without Google.
  const context = await auth.$context;
  assert.equal(context.authCookies.sessionToken.attributes.httpOnly, true);
  const secureAuth = createAuth(drizzle(db, { schema }), {
    baseURL: 'https://openfind.example',
    secret,
    clientId: 'synthetic-google-client-id',
    clientSecret: 'synthetic-google-client-secret',
  });
  assert.equal((await secureAuth.$context).authCookies.sessionToken.attributes.secure, true);
  const syntheticUser = await context.internalAdapter.createUser(
    {
      name: 'Test user',
      email: 'test@example.invalid',
      emailVerified: true,
    },
    { method: 'admin' },
  );
  const syntheticSession = await context.internalAdapter.createSession(syntheticUser.id);
  assert.ok(syntheticSession);
  const signedCookie = await serializeSignedCookie(
    context.authCookies.sessionToken.name,
    syntheticSession.token,
    secret,
  );
  const cookie = signedCookie.split(';')[0];
  assert.ok(cookie);
  const verifiedSession = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(verifiedSession?.user.id, syntheticUser.id);
  const unsigned = await auth.api.getSession({
    headers: new Headers({ cookie: `${context.authCookies.sessionToken.name}=${randomUUID()}` }),
  });
  assert.equal(unsigned, null, 'forged cookie must not authenticate');
  const signOut = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { origin: baseURL, cookie },
    }),
  );
  assert.equal(signOut.status, 200);
  assert.equal(
    await auth.api.getSession({ headers: new Headers({ cookie }) }),
    null,
    'signed-out session must be revoked',
  );
  console.log(
    'OAuth initiation, origin checks and synthetic database session revocation passed. Real Google login was not tested.',
  );
} finally {
  await db.close();
}
