/** Liveness only: no database, auth provider or finding-network checks exist yet. */
export function GET() {
  return Response.json(
    { status: 'ok', service: 'openfind-web' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
