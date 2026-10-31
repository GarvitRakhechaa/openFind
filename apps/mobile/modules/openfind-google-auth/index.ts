import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type GoogleTokenResult =
  | { status: 'ok'; token: string }
  | { status: 'busy' | 'unavailable' | 'invalid_input' | 'cancelled' };

declare class OpenFindGoogleAuthModule extends NativeModule {
  createAttemptProof(): { verifier: string; verifierHash: string };
  requestGoogleToken(webClientId: string, nonce: string): Promise<GoogleTokenResult>;
  apiRequest(
    base: string,
    operation: 'start' | 'exchange' | 'session' | 'sign-out',
    body: string | null,
    credential: string | null,
  ): Promise<{ status: number; body: string }>;
  clearProviderState(): Promise<boolean>;
}

// Optional: Expo Go or an older development build may not contain this module.
export default requireOptionalNativeModule<OpenFindGoogleAuthModule>('OpenFindGoogleAuth');
