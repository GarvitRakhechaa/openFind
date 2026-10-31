import { handleMobileApi } from '../../../../src/auth/mobile-api-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handleMobileApi(request, 'session');
}
