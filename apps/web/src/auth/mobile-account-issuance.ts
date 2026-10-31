import 'server-only';

import { setSessionCookie } from 'better-auth/cookies';
import { handleOAuthUserInfo } from 'better-auth/oauth2';
import { verifyAndConsumeMobileAttempt } from './mobile-attempt-verification';

// Private issuance helper used behind the default-off mobile API. Real-device,
// Neon concurrency, deployment and independent security review remain required.
type EndpointContext = Parameters<typeof handleOAuthUserInfo>[0];
type Db = Parameters<typeof verifyAndConsumeMobileAttempt>[0];
type Input = Parameters<typeof verifyAndConsumeMobileAttempt>[1];
type Policy = Parameters<typeof verifyAndConsumeMobileAttempt>[2];

/**
 * Consume the verified attempt before using Better Auth's OAuth account logic.
 * False means no cookie was issued. Errors must fail closed at the caller and
 * must not be logged with request bodies, tokens, cookies, or database params.
 */
export async function issueMobileSessionCandidate(
  ctx: EndpointContext,
  db: Db,
  input: Input,
  policy: Policy,
  onSessionCreated?: (token: string) => void,
): Promise<boolean> {
  // This candidate never implicitly links an account based on email, must not
  // create an account cookie, and must use the existing Web Google client.
  const google = ctx.context.socialProviders.find((provider) => provider.id === 'google');
  if (
    ctx.context.options.account?.accountLinking?.enabled !== false ||
    ctx.context.options.account?.storeAccountCookie === true ||
    google?.options?.disableIdTokenSignIn !== true ||
    google.options.clientId !== policy.webClientId
  ) {
    throw new Error('Unsafe mobile auth configuration');
  }
  const verified = await verifyAndConsumeMobileAttempt(db, input, policy);
  if (!verified) return false;

  // Google ID tokens are deliberately omitted; only the provider+sub identity
  // and verified profile enter Better Auth's OAuth account handling.
  const result = await handleOAuthUserInfo(ctx, {
    userInfo: {
      id: verified.subject,
      name: verified.name,
      email: verified.email,
      emailVerified: true,
    },
    account: { providerId: 'google', accountId: verified.subject },
    requireExactAccountBinding: true,
    trustProviderByName: false,
  });
  if (result.error || !result.data) return false;
  try {
    // Private request-scoped callback allows cleanup if cookie delivery fails.
    onSessionCreated?.(result.data.session.token);
    await setSessionCookie(ctx, result.data);
  } catch (error) {
    // Best effort only: a failed database operation may leave a revocable
    // orphan session. The production failure strategy still needs review.
    await ctx.context.internalAdapter.deleteSession(result.data.session.token);
    throw error;
  }
  return true;
}
