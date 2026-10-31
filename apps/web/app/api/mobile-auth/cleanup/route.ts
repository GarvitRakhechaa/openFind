import { getDb } from '../../../../src/db';
import { readMobileApiConfig } from '../../../../src/auth/mobile-api-config';
import { cleanupMobileApiData } from '../../../../src/auth/mobile-api-rate-limit';
import { createMobileCleanupHandler } from '../../../../src/auth/mobile-cleanup-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = readMobileApiConfig();
  if (!config) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (new URL(request.url).origin !== config.auth.baseURL) {
    return Response.json(
      { error: 'Unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return createMobileCleanupHandler(process.env.CRON_SECRET, () => cleanupMobileApiData(getDb()))(
    request,
  );
}
