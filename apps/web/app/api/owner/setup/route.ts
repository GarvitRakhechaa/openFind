import { getAuth } from '../../../../src/auth/server';
import { handleOwnerSetup } from '../../../../src/auth/owner-setup-handler';
import { getDb } from '../../../../src/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = getAuth();
    if (auth) {
      // getAuth validates this as a canonical origin before returning an auth instance.
      const canonicalOrigin = new URL(process.env.BETTER_AUTH_URL as string).origin;
      return await handleOwnerSetup(request, { auth, db: getDb(), canonicalOrigin });
    }
  } catch {
    // Fail closed, without exposing configuration or database errors.
  }
  return Response.json(
    { ok: false, error: 'Account setup is temporarily unavailable.' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}
