// ISOLATED SPIKE ONLY: This creates an unauthenticated fixture endpoint in an
// in-memory test instance. Never register it in the production auth factory.
// It DOES NOT implement Google verification, a challenge, or mobile login.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/auth/schema';

const baseURL = 'https://openfind.example';
const fixtureEmail = 'spike@example.invalid';
const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as { entries: Array<{ tag: string }> };
const db = new PGlite();

// No listener is opened. Only auth.handler(Request) is called by this script.
const fixturePlugin = {
  id: 'test-only-session-spike',
  endpoints: {
    issueFixtureSession: createAuthEndpoint(
      '/test-only-session-spike',
      { method: 'POST' },
      async (ctx) => {
        // Fixture identity originates from the test database, not the request.
        const result = await ctx.context.internalAdapter.findUserByEmail(fixtureEmail);
        if (!result) throw new Error('Fixture user missing');
        const session = await ctx.context.internalAdapter.createSession(result.user.id);
        if (!session) throw new Error('Fixture session creation failed');
        await setSessionCookie(ctx, { session, user: result.user });
        return ctx.json({ success: true });
      },
    ),
  },
} satisfies BetterAuthPlugin;

try {
  for (const entry of journal.entries) {
    await db.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const auth = betterAuth({
    baseURL,
    secret: randomBytes(32).toString('base64url'),
    database: drizzleAdapter(drizzle(db, { schema }), { provider: 'pg', schema }),
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: true },
    plugins: [fixturePlugin],
  });
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: 'Fixture', email: fixtureEmail, emailVerified: true },
    { method: 'admin' },
  );
  const issued = await auth.handler(
    new Request(`${baseURL}/api/auth/test-only-session-spike`, {
      method: 'POST',
      headers: { origin: baseURL },
    }),
  );
  assert.equal(issued.status, 200);
  assert.deepEqual(await issued.json(), { success: true });
  const setCookie = issued.headers.get('set-cookie');
  assert.ok(setCookie, 'plugin should set a session cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  const cookie = setCookie.split(';')[0];
  assert.ok(cookie);
  assert.equal((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id, user.id);
  const signOut = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { origin: baseURL, cookie },
    }),
  );
  assert.equal(signOut.status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  console.log(
    'Isolated plugin fixture: cookie-backed session validated and revoked. No mobile authentication tested.',
  );
} finally {
  await db.close();
}
