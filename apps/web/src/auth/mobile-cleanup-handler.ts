import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

type Cleanup = () => Promise<{ attempts: number; buckets: number }>;

/** Scheduled cleanup. No IDs, session material or database errors in output. */
export function createMobileCleanupHandler(secret: string | undefined, cleanup: Cleanup) {
  return async (request: Request) => {
    const response = (status: number, body: Record<string, number | string>) =>
      Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    if (!secret || secret.length < 32) return response(503, { error: 'Unavailable' });
    if (request.method !== 'GET') return response(405, { error: 'Request rejected' });
    const supplied = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${secret}`;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(supplied), digest(expected))) {
      return response(401, { error: 'Request rejected' });
    }
    try {
      const count = await cleanup();
      // A full batch might mean backlog. Return a failure status so monitoring
      // can alert; counts contain no identifiers or credentials.
      if (count.attempts >= 5000 || count.buckets >= 5000) {
        return response(503, {
          error: 'Cleanup backlog',
          attemptsDeleted: count.attempts,
          bucketsDeleted: count.buckets,
        });
      }
      return response(200, { attemptsDeleted: count.attempts, bucketsDeleted: count.buckets });
    } catch {
      return response(503, { error: 'Unavailable' });
    }
  };
}
