import { createNativeMobileAuth, type NativeBridge } from './native-mobile-auth';
import { createBoundSessionStore, type SecureKeyValueStore } from './session-store';

export type AuthRuntime =
  | { status: 'unavailable'; reason: 'disabled' | 'platform' | 'config' | 'native' | 'storage' }
  | {
      status: 'ready';
      controller: ReturnType<typeof createNativeMobileAuth>;
      forgetLocalSession: () => Promise<void>;
    };

export type RuntimeOptions = {
  enabled: boolean;
  platform: string;
  origin: string | undefined;
  webClientId: string | undefined;
  native: NativeBridge | null;
  storage: SecureKeyValueStore & { isAvailableAsync(): Promise<boolean> };
};

// Deliberately accepts ASCII DNS/IPv4 origins only. React Native's URL
// implementation differs from browsers, so do not rely on URL normalization.
function trustedOrigin(value: string | undefined): string | null {
  if (!value || value.length > 2048) return null;
  const match = /^https:\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?\/?$/.exec(value);
  if (!match || !match[1]) return null;
  const host = match[1].toLowerCase();
  if (
    host.length > 253 ||
    host
      .split('.')
      .some(
        (label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  )
    return null;
  const port = match[2] ? Number(match[2]) : 443;
  if (port < 1 || port > 65535) return null;
  return `https://${host}${port === 443 ? '' : `:${port}`}`;
}

/** Never read credentials or contact a server when the gate/config is off. */
export async function createMobileAuthRuntime(options: RuntimeOptions): Promise<AuthRuntime> {
  if (!options.enabled) return { status: 'unavailable', reason: 'disabled' };
  if (options.platform !== 'android') return { status: 'unavailable', reason: 'platform' };
  const origin = trustedOrigin(options.origin);
  const webClientId = options.webClientId;
  if (
    !origin ||
    !webClientId ||
    webClientId.length > 512 ||
    !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(webClientId)
  ) {
    return { status: 'unavailable', reason: 'config' };
  }
  if (!options.native) return { status: 'unavailable', reason: 'native' };
  try {
    if (!(await options.storage.isAvailableAsync())) {
      return { status: 'unavailable', reason: 'storage' };
    }
    const store = createBoundSessionStore(options.storage, origin);
    return {
      status: 'ready',
      controller: createNativeMobileAuth(options.native, store, { origin, webClientId }),
      forgetLocalSession: () => store.remove(),
    };
  } catch {
    return { status: 'unavailable', reason: 'storage' };
  }
}
