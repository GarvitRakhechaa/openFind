import 'server-only';

import { readMobileAuthBody } from './mobile-request';

// Handler used by the default-off mobile API. The limiter uses shared storage;
// trusted proxy configuration and edge abuse controls still require review.
// A request header is not evidence of client identity.
type StartDependencies = {
  allowAttempt: (request: Request) => Promise<boolean>;
  createAttempt: (verifierHash: string) => Promise<{ id: string; nonce: string }>;
};

const base64url32 = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

function response(status: number, payload: Record<string, string>) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/** Creates an attempt, not a session; exposure is controlled by route config. */
export function createMobileStartHandler(deps: StartDependencies) {
  return async function start(request: Request): Promise<Response> {
    try {
      // The mobile client is not a browser and does not send cookies. This is
      // a defense-in-depth browser boundary, not proof of a genuine app.
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
      const body = await readMobileAuthBody(request, 'start');
      if (!body) return response(400, { error: 'Request rejected' });
      const attempt = await deps.createAttempt(body.verifierHash);
      if (!base64url32.test(attempt.id) || !base64url32.test(attempt.nonce)) {
        return response(503, { error: 'Request unavailable' });
      }
      return response(200, { id: attempt.id, nonce: attempt.nonce });
    } catch {
      // Never log requests, attempt identifiers, proof material or DB errors.
      return response(503, { error: 'Request unavailable' });
    }
  };
}
