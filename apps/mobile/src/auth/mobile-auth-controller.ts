// Orchestration with explicit dependencies. The mobile UI uses an HTTPS-only
// native transport; Android and real backend integration still require tests.
// Never log credential material.
export type GoogleResult =
  | { status: 'ok'; token: string }
  | { status: 'cancelled' | 'busy' | 'unavailable' | 'invalid_input' };
type StoredSession = string;
export type SessionStatus = 'authenticated' | 'signed-out' | 'offline' | 'busy' | 'error';
export type SignInResult = 'authenticated' | 'cancelled' | 'busy' | 'failed';
export type SignOutResult = 'signed-out' | 'local-only' | 'busy' | 'error';

export type MobileAuthDependencies = {
  createProof: () => { verifier: string; verifierHash: string };
  start: (verifierHash: string) => Promise<{ id: string; nonce: string }>;
  google: (nonce: string) => Promise<GoogleResult>;
  exchange: (data: { id: string; verifier: string; token: string }) => Promise<StoredSession>;
  read: () => Promise<StoredSession | null>;
  save: (session: StoredSession) => Promise<void>;
  remove: () => Promise<void>;
  validate: (session: StoredSession) => Promise<'valid' | 'invalid'>;
  revoke: (session: StoredSession) => Promise<void>;
  clearProvider: () => Promise<void>;
};

const canonical32 = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const hash = /^[a-f0-9]{64}$/;
const validSession = (session: unknown): session is string =>
  typeof session === 'string' && session.length > 0 && session.length <= 2048;

export class MobileAuthController {
  private active = false;
  constructor(private readonly deps: MobileAuthDependencies) {}

  async signIn(): Promise<SignInResult> {
    if (this.active) return 'busy';
    this.active = true;
    try {
      // Avoid silently replacing an existing session and orphaning it.
      if (await this.deps.read()) return 'failed';
      const proof = this.deps.createProof();
      if (!canonical32.test(proof.verifier) || !hash.test(proof.verifierHash)) return 'failed';
      const attempt = await this.deps.start(proof.verifierHash);
      if (!canonical32.test(attempt.id) || !canonical32.test(attempt.nonce)) return 'failed';
      const result = await this.deps.google(attempt.nonce);
      if (result.status === 'cancelled') return 'cancelled';
      if (result.status !== 'ok' || !result.token || result.token.length > 8192) return 'failed';
      const session = await this.deps.exchange({
        id: attempt.id,
        verifier: proof.verifier,
        token: result.token,
      });
      if (!validSession(session)) return 'failed';
      try {
        await this.deps.save(session);
      } catch {
        // A storage operation may have written the value before failing.
        try {
          await this.deps.remove();
        } catch {
          // We cannot guarantee that a local credential was erased.
        }
        // The server may have created a session. Best-effort revoke; the caller
        // still receives failure even if revocation itself is unavailable.
        try {
          await this.deps.revoke(session);
        } catch {
          // Server expiry and later revocation are still required.
        }
        return 'failed';
      }
      return 'authenticated';
    } catch {
      return 'failed';
    } finally {
      this.active = false;
    }
  }

  async checkSession(): Promise<SessionStatus> {
    if (this.active) return 'busy';
    this.active = true;
    try {
      const session = await this.deps.read();
      if (session === null) return 'signed-out';
      if (!validSession(session)) {
        await this.deps.remove();
        return 'signed-out';
      }
      let status: 'valid' | 'invalid';
      try {
        status = await this.deps.validate(session);
      } catch {
        return 'offline';
      }
      if (status === 'valid') return 'authenticated';
      if (status !== 'invalid') return 'error';
      await this.deps.remove();
      return 'signed-out';
    } catch {
      return 'error';
    } finally {
      this.active = false;
    }
  }

  async signOut(): Promise<SignOutResult> {
    if (this.active) return 'busy';
    this.active = true;
    try {
      const session = await this.deps.read();
      let revoked = session === null;
      if (session !== null && validSession(session)) {
        try {
          await this.deps.revoke(session);
          revoked = true;
        } catch {
          revoked = false;
        }
      }
      // Local removal proceeds even offline; failure must not be reported as
      // successful logout. Server revocation is NOT assured when offline.
      await this.deps.remove();
      try {
        await this.deps.clearProvider();
      } catch {
        // This clears provider selection only, not the OpenFind session.
      }
      return revoked ? 'signed-out' : 'local-only';
    } catch {
      return 'error';
    } finally {
      this.active = false;
    }
  }
}
