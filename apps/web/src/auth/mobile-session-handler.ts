import 'server-only';

import { readMobileAuthBody } from './mobile-request';

type Dependencies = {
  allowRequest: (request: Request, operation: 'session' | 'sign-out') => Promise<boolean>;
  validate: (credential: string) => Promise<boolean>;
  revoke: (credential: string) => Promise<boolean>;
};

function result(status: number, body: Record<string, string | boolean>) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function bearer(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return /^Bearer ([A-Za-z0-9._%+~-]{1,2048})$/.exec(header)?.[1] ?? null;
}

/** Native bearer credentials only; browsers and ambient cookies are rejected. */
export function createMobileSessionHandlers(deps: Dependencies) {
  return async function handle(request: Request, operation: 'session' | 'sign-out') {
    try {
      if (request.headers.has('origin') || request.headers.has('cookie')) {
        return result(403, { error: 'Request rejected' });
      }
      if (request.method !== (operation === 'session' ? 'GET' : 'POST')) {
        return result(405, { error: 'Request rejected' });
      }
      if (!(await deps.allowRequest(request, operation))) {
        return result(429, { error: 'Request rejected' });
      }
      const credential = bearer(request);
      if (!credential) return result(401, { error: 'Request rejected' });
      if (operation === 'sign-out' && !(await readMobileAuthBody(request, 'empty'))) {
        return result(400, { error: 'Request rejected' });
      }
      const ok = await (operation === 'session'
        ? deps.validate(credential)
        : deps.revoke(credential));
      if (!ok) return result(401, { error: 'Request rejected' });
      return operation === 'session'
        ? result(200, { authenticated: true })
        : result(200, { signedOut: true });
    } catch {
      return result(503, { error: 'Request unavailable' });
    }
  };
}
