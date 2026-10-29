import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '../../../../src/auth/server';
import { isTrustedAuthPost } from '../../../../src/auth/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable() {
  return Response.json(
    { error: 'Authentication is not configured.' },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function GET(request: Request) {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).GET(request) : unavailable();
}

export async function POST(request: Request) {
  const auth = getAuth();
  if (!auth) return unavailable();
  const canonicalOrigin = new URL(process.env.BETTER_AUTH_URL as string).origin;
  if (!isTrustedAuthPost(request, canonicalOrigin)) {
    return Response.json({ error: 'Origin not allowed.' }, { status: 403 });
  }
  return toNextJsHandler(auth).POST(request);
}
