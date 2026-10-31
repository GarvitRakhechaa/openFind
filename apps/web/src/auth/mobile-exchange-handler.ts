import 'server-only';

import { readMobileAuthBody, type MobileExchangeBody } from './mobile-request';

// Used by the default-off mobile API with a shared limiter and HTTPS config.
// Production deployment, account issuance and transport still require review.
type ExchangeDependencies = {
  allowAttempt: (request: Request) => Promise<boolean>;
  issueSession: (input: MobileExchangeBody) => Promise<string | null>;
};

function response(status: number, body: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/** The returned credential is a bearer secret. Transport only over HTTPS. */
export function createMobileExchangeHandler(deps: ExchangeDependencies) {
  return async function exchange(request: Request): Promise<Response> {
    try {
      if (
        request.headers.has('origin') ||
        request.headers.has('cookie') ||
        request.headers.has('authorization')
      ) {
        return response(403, { error: 'Request rejected' });
      }
      if (request.method !== 'POST') return response(405, { error: 'Request rejected' });
      if ((await deps.allowAttempt(request)) !== true) {
        return response(429, { error: 'Request rejected' });
      }
      const body = await readMobileAuthBody(request, 'exchange');
      if (!body) return response(400, { error: 'Request rejected' });
      const session = await deps.issueSession(body);
      if (session === null) return response(401, { error: 'Request rejected' });
      if (typeof session !== 'string' || session.length < 1 || session.length > 2048) {
        return response(503, { error: 'Request unavailable' });
      }
      return response(200, { session });
    } catch {
      // Details may contain bearer credentials, provider tokens or DB queries.
      return response(503, { error: 'Request unavailable' });
    }
  };
}
