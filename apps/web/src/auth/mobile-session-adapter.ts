import 'server-only';

import { type BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { createAuth } from './factory';
import { issueMobileSessionCandidate } from './mobile-account-issuance';
import type { MobileExchangeBody } from './mobile-request';

type Db = Parameters<typeof createAuth>[0] & Parameters<typeof issueMobileSessionCandidate>[1];
type AuthConfig = Parameters<typeof createAuth>[1];
type Policy = Parameters<typeof issueMobileSessionCandidate>[3];

const signedCookieValue = /^[A-Za-z0-9._%+~-]{1,2048}$/;

/** Private, request-scoped Better Auth instance. The plugin is never registered
 * in the publicly mounted web auth handler. Input and issued token are scoped
 * to this invocation, preventing concurrent attempts from sharing state. */
export async function issueMobileSignedSession(
  db: Db,
  config: AuthConfig,
  policy: Policy,
  input: MobileExchangeBody,
): Promise<string | null> {
  let createdToken: string | undefined;
  const plugin = {
    id: 'openfind-private-mobile-issue',
    endpoints: {
      issuePrivateMobileSession: createAuthEndpoint(
        '/openfind-internal-mobile-issue',
        { method: 'POST' },
        async (ctx) => {
          const ok = await issueMobileSessionCandidate(ctx, db, input, policy, (token) => {
            createdToken = token;
          });
          if (!ok) ctx.setStatus(401);
          return ctx.json({ ok });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
  const auth = createAuth(db, config, [plugin], true);
  const context = await auth.$context;
  let delivered = false;
  try {
    const response = await auth.handler(
      new Request(`${config.baseURL}/api/auth/openfind-internal-mobile-issue`, {
        method: 'POST',
        headers: { origin: config.baseURL },
      }),
    );
    if (response.status !== 200) return null;
    const cookies = response.headers.getSetCookie();
    const expectedName = context.authCookies.sessionToken.name;
    const matches = cookies
      .map((cookie) => cookie.split(';', 1)[0] ?? '')
      .filter((cookie) => cookie.startsWith(`${expectedName}=`));
    if (matches.length !== 1) throw new Error('Session issuance failed');
    const value = matches[0]!.slice(expectedName.length + 1);
    if (!signedCookieValue.test(value)) throw new Error('Session issuance failed');
    // Check the exact signed cookie against Better Auth and the DB before
    // returning it to the native app. Never return the raw DB session token.
    const session = await auth.api.getSession({
      query: { disableCookieCache: true, disableRefresh: true },
      headers: new Headers({ cookie: `${expectedName}=${value}` }),
    });
    if (!session || !createdToken || session.session.token !== createdToken) {
      throw new Error('Session issuance failed');
    }
    delivered = true;
    return value;
  } finally {
    if (!delivered && createdToken) {
      // Best effort only: a DB outage may leave an orphan until expiry or
      // later revocation. Never expose/log the token or claim atomic issuance.
      try {
        await context.internalAdapter.deleteSession(createdToken);
      } catch {
        // Preserve the original failure without logging sensitive material.
      }
    }
  }
}

/** Resolve a signed credential without trusting any incoming browser cookie. */
async function resolveMobileSession(db: Db, config: AuthConfig, credential: string) {
  if (!signedCookieValue.test(credential)) return null;
  const auth = createAuth(db, config, [], true);
  const context = await auth.$context;
  const cookie = `${context.authCookies.sessionToken.name}=${credential}`;
  const session = await auth.api.getSession({
    query: { disableCookieCache: true, disableRefresh: true },
    headers: new Headers({ cookie }),
  });
  return session ? { session, context } : null;
}

export async function isMobileSessionValid(db: Db, config: AuthConfig, credential: string) {
  return (await resolveMobileSession(db, config, credential)) !== null;
}

/** Better Auth's sign-out catches DB deletion errors; use the verified token
 * directly and confirm deletion so a failed revoke is never reported as success. */
export async function revokeMobileSession(db: Db, config: AuthConfig, credential: string) {
  const resolved = await resolveMobileSession(db, config, credential);
  if (!resolved) return false;
  const token = resolved.session.session.token;
  await resolved.context.internalAdapter.deleteSession(token);
  if (await resolved.context.internalAdapter.findSession(token)) {
    throw new Error('Session revocation failed');
  }
  return true;
}
