import type { SessionStore } from './native-mobile-auth';

const SESSION_KEY = 'openfind.mobile.session.v1';
const credentialPattern = /^[A-Za-z0-9._%+~-]{1,2048}$/;

export type SecureKeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/** Store credential and trusted API origin together; never send a credential
 * saved for one backend to another after a configuration change. */
export function createBoundSessionStore(
  storage: SecureKeyValueStore,
  origin: string,
): SessionStore {
  return {
    async read() {
      const raw = await storage.getItemAsync(SESSION_KEY);
      if (raw === null) return null;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error('Saved session unavailable');
      }
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('version' in value) ||
        value.version !== 1 ||
        !('origin' in value) ||
        value.origin !== origin ||
        !('credential' in value) ||
        typeof value.credential !== 'string' ||
        !credentialPattern.test(value.credential)
      ) {
        // Do not erase or transmit unknown/other-environment credentials.
        throw new Error('Saved session unavailable');
      }
      return value.credential;
    },
    async save(credential) {
      if (!credentialPattern.test(credential)) throw new Error('Invalid session');
      await storage.setItemAsync(SESSION_KEY, JSON.stringify({ version: 1, origin, credential }));
    },
    async remove() {
      await storage.deleteItemAsync(SESSION_KEY);
    },
  };
}
