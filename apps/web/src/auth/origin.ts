/** Web-only policy: require the explicit configured origin on browser POSTs. */
export function isTrustedAuthPost(request: Request, canonicalOrigin: string): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return origin === canonicalOrigin && fetchSite !== 'cross-site';
}
