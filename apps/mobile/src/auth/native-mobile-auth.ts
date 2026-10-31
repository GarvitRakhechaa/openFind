import { MobileAuthController, type GoogleResult } from './mobile-auth-controller';

// The native bridge performs HTTPS-only requests with no cookies or redirects.
// The actual Android runtime and backend still require staging/security review.
type Operation = 'start' | 'exchange' | 'session' | 'sign-out';
export type NativeBridge = {
  createAttemptProof(): { verifier: string; verifierHash: string };
  requestGoogleToken(webClientId: string, nonce: string): Promise<GoogleResult>;
  apiRequest(
    base: string,
    operation: Operation,
    body: string | null,
    credential: string | null,
  ): Promise<{ status: number; body: string }>;
  clearProviderState(): Promise<boolean>;
};
export type SessionStore = {
  read(): Promise<string | null>;
  save(session: string): Promise<void>;
  remove(): Promise<void>;
};

function parseObject(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response');
  return value as Record<string, unknown>;
}

/** Caller must provide a trusted build-time origin and public Google Web client ID. */
export function createNativeMobileAuth(
  native: NativeBridge,
  store: SessionStore,
  config: { origin: string; webClientId: string },
) {
  const { origin, webClientId } = config;
  if (
    typeof origin !== 'string' ||
    typeof webClientId !== 'string' ||
    !webClientId.endsWith('.apps.googleusercontent.com') ||
    webClientId !== webClientId.trim() ||
    webClientId.length > 512
  ) {
    throw new Error('Mobile auth configuration unavailable');
  }
  return new MobileAuthController({
    createProof: () => native.createAttemptProof(),
    start: async (verifierHash) => {
      const result = await native.apiRequest(
        origin,
        'start',
        JSON.stringify({ verifierHash }),
        null,
      );
      if (result.status !== 200) throw new Error('Login unavailable');
      const data = parseObject(result.body);
      if (typeof data.id !== 'string' || typeof data.nonce !== 'string') {
        throw new Error('Invalid response');
      }
      return { id: data.id, nonce: data.nonce };
    },
    google: (nonce) => native.requestGoogleToken(webClientId, nonce),
    exchange: async (input) => {
      const result = await native.apiRequest(origin, 'exchange', JSON.stringify(input), null);
      if (result.status !== 200) throw new Error('Login unavailable');
      const data = parseObject(result.body);
      if (typeof data.session !== 'string') throw new Error('Invalid response');
      return data.session;
    },
    read: () => store.read(),
    save: (session) => store.save(session),
    remove: () => store.remove(),
    validate: async (session) => {
      const result = await native.apiRequest(origin, 'session', null, session);
      if (result.status === 401) return 'invalid';
      if (result.status !== 200) throw new Error('Session unavailable');
      const data = parseObject(result.body);
      if (data.authenticated !== true) throw new Error('Invalid response');
      return 'valid';
    },
    revoke: async (session) => {
      const result = await native.apiRequest(origin, 'sign-out', '{}', session);
      if (result.status === 401) return; // already invalid or revoked
      if (result.status !== 200 || parseObject(result.body).signedOut !== true) {
        throw new Error('Sign-out unavailable');
      }
    },
    clearProvider: async () => {
      await native.clearProviderState();
    },
  });
}
