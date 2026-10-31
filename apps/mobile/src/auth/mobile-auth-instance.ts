import { Platform } from 'react-native';
import native from '../../modules/openfind-google-auth';
import { createMobileAuthRuntime, type AuthRuntime } from './mobile-auth-runtime';
import { platformSecureStorage } from './secure-session';

// EXPO_PUBLIC values are visible to everyone in the app bundle. They are not
// secrets. Expo inlines these static dot-notation references at bundle time.
const enabled = process.env.EXPO_PUBLIC_OPENFIND_AUTH_ENABLED === 'true';
const origin = process.env.EXPO_PUBLIC_OPENFIND_API_ORIGIN;
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
let pending: Promise<AuthRuntime> | undefined;

/** One controller per app process prevents overlapping screen operations. */
export function getMobileAuthRuntime(): Promise<AuthRuntime> {
  if (!pending) {
    const current = createMobileAuthRuntime({
      enabled,
      platform: Platform.OS,
      origin,
      webClientId,
      native,
      storage: platformSecureStorage,
    });
    pending = current;
    // An unavailable keystore may become available later; permit a retry.
    void current.then((result) => {
      if (result.status === 'unavailable' && result.reason === 'storage' && pending === current) {
        pending = undefined;
      }
    });
  }
  return pending;
}
