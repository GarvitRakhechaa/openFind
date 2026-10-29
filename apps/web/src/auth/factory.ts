import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import * as authSchema from './schema';

type AuthConfig = { baseURL: string; secret: string; clientId: string; clientSecret: string };

/** Shared configuration; callers must validate origin and secrets before invoking. */
export function createAuth(db: Parameters<typeof drizzleAdapter>[0], config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        // Mobile ID-token sign-in is deliberately disabled until a reviewed,
        // replay-resistant handoff is implemented. Web OAuth redirects remain enabled.
        disableIdTokenSignIn: true,
      },
    },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    advanced: { useSecureCookies: config.baseURL.startsWith('https://') },
  });
}
