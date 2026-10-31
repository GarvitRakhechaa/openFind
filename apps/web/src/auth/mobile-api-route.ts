import 'server-only';

import { getDb } from '../db';
import { readMobileApiConfig } from './mobile-api-config';
import { allowMobileApiRequest, type MobileOperation } from './mobile-api-rate-limit';
import { createMobileAttempt } from './mobile-attempt-verification';
import { createMobileStartHandler } from './mobile-start-handler';
import { createMobileExchangeHandler } from './mobile-exchange-handler';
import { createMobileSessionHandlers } from './mobile-session-handler';
import {
  isMobileSessionValid,
  issueMobileSignedSession,
  revokeMobileSession,
} from './mobile-session-adapter';

function unavailable() {
  return Response.json(
    { error: 'Request unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}

type ApiDependencies = {
  readConfig: typeof readMobileApiConfig;
  database: () => Parameters<typeof issueMobileSignedSession>[0];
};

/** The dependency boundary allows the actual dispatcher to be tested with an
 * isolated database; public routes use only the configured Neon factory. */
export function createMobileApiDispatcher(deps: ApiDependencies) {
  return async function handleMobileApi(request: Request, operation: MobileOperation) {
    try {
      const config = deps.readConfig();
      if (!config) return unavailable();
      // Never infer our canonical origin from a client-supplied header. Ingress
      // must preserve the external URL; validate this assumption on Vercel.
      if (new URL(request.url).origin !== config.auth.baseURL) return unavailable();
      const db = deps.database();
      const allow = (req: Request, op: MobileOperation) =>
        allowMobileApiRequest(db, req, op, config.rateSecret, config.onVercel);
      if (operation === 'start') {
        return createMobileStartHandler({
          allowAttempt: (req) => allow(req, 'start'),
          createAttempt: (hash) => createMobileAttempt(db, hash),
        })(request);
      }
      if (operation === 'exchange') {
        return createMobileExchangeHandler({
          allowAttempt: (req) => allow(req, 'exchange'),
          issueSession: (input) =>
            issueMobileSignedSession(
              db,
              config.auth,
              { webClientId: config.auth.clientId, androidClientId: config.androidClientId },
              input,
            ),
        })(request);
      }
      return createMobileSessionHandlers({
        allowRequest: (req, op) => allow(req, op),
        validate: (credential) => isMobileSessionValid(db, config.auth, credential),
        revoke: (credential) => revokeMobileSession(db, config.auth, credential),
      })(request, operation);
    } catch {
      // Do not echo request bodies, bearer secrets, DB errors or provider tokens.
      return unavailable();
    }
  };
}

/** Real routes are guarded off unless all trusted configuration exists. */
export const handleMobileApi = createMobileApiDispatcher({
  readConfig: readMobileApiConfig,
  database: getDb,
});
