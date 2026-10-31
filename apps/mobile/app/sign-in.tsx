import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMobileAuthRuntime } from '../src/auth/mobile-auth-instance';
import type { AuthRuntime } from '../src/auth/mobile-auth-runtime';
import type { SessionStatus } from '../src/auth/mobile-auth-controller';

type ReadyRuntime = Extract<AuthRuntime, { status: 'ready' }>;
type CheckResult = { candidate: AuthRuntime; session: SessionStatus | null };
type ScreenState =
  | 'checking'
  | 'unavailable'
  | 'signed-out'
  | 'working'
  | 'authenticated'
  | 'offline'
  | 'storage-error'
  | 'local-only';

const unavailableMessage: Record<
  Extract<AuthRuntime, { status: 'unavailable' }>['reason'],
  string
> = {
  disabled: 'Mobile sign-in is disabled for this build.',
  platform: 'Mobile sign-in is available on Android only.',
  config: 'A valid HTTPS test server and Google Web client ID are required.',
  native:
    'This build does not include the Google sign-in native module. Install a new development build.',
  storage: 'Secure storage is unavailable. Unlock the phone and try again.',
};

export default function SignInScreen() {
  const [state, setState] = useState<ScreenState>('checking');
  const [message, setMessage] = useState('Checking your sign-in status…');
  const runtime = useRef<ReadyRuntime | null>(null);
  const active = useRef(false);
  const mounted = useRef(false);
  const checkInFlight = useRef<Promise<CheckResult> | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (active.current) return;
    const current = generation.current;
    setState('checking');
    setMessage('Checking your sign-in status…');
    try {
      let pending = checkInFlight.current;
      if (!pending) {
        pending = (async (): Promise<CheckResult> => {
          const candidate = await getMobileAuthRuntime();
          return {
            candidate,
            session:
              candidate.status === 'ready' ? await candidate.controller.checkSession() : null,
          };
        })();
        checkInFlight.current = pending;
        void pending.then(
          () => {
            if (checkInFlight.current === pending) checkInFlight.current = null;
          },
          () => {
            if (checkInFlight.current === pending) checkInFlight.current = null;
          },
        );
      }
      const { candidate, session: result } = await pending;
      if (generation.current !== current) return;
      if (candidate.status === 'unavailable') {
        runtime.current = null;
        setState('unavailable');
        setMessage(unavailableMessage[candidate.reason]);
        return;
      }
      runtime.current = candidate;
      if (result === 'authenticated') {
        setState('authenticated');
        setMessage('Your session was verified by the server.');
      } else if (result === 'signed-out') {
        setState('signed-out');
        setMessage('Sign in with the same Google account as your web dashboard.');
      } else if (result === 'offline') {
        setState('offline');
        setMessage('The server could not be reached. Your saved session has not been verified.');
      } else if (result === 'busy') {
        setState('unavailable');
        setMessage('Another sign-in operation is in progress. Try again in a moment.');
      } else {
        setState('storage-error');
        setMessage(
          'The saved session could not be checked. It may belong to a different server or secure storage may be unavailable.',
        );
      }
    } catch {
      if (generation.current === current) {
        setState('storage-error');
        setMessage('Sign-in status is unavailable. Try again.');
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    void refresh();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [refresh]);

  const signIn = async () => {
    if (!mounted.current || active.current || checkInFlight.current || !runtime.current) return;
    active.current = true;
    const current = generation.current;
    setState('working');
    setMessage('Connecting to Google and verifying your account…');
    try {
      const result = await runtime.current.controller.signIn();
      if (generation.current !== current) return;
      if (result === 'authenticated') {
        setState('authenticated');
        setMessage('Your session was verified by the server.');
      } else if (result === 'cancelled') {
        setState('signed-out');
        setMessage('Google sign-in was cancelled.');
      } else {
        setState('storage-error');
        setMessage(
          'Sign-in could not be completed. Retry to check for a saved session. If session creation or storage failed, server revocation may not have been confirmed.',
        );
      }
    } catch {
      if (generation.current === current) {
        setState('storage-error');
        setMessage('Sign-in could not be completed. Retry to check for a saved session.');
      }
    } finally {
      active.current = false;
    }
  };

  const signOut = async () => {
    if (!mounted.current || active.current || checkInFlight.current || !runtime.current) return;
    active.current = true;
    const current = generation.current;
    setState('working');
    setMessage('Signing out…');
    try {
      const result = await runtime.current.controller.signOut();
      if (generation.current !== current) return;
      if (result === 'signed-out') {
        setState('signed-out');
        setMessage(
          'Signed out from this phone. Any available session was revoked or was already invalid.',
        );
      } else if (result === 'local-only') {
        setState('local-only');
        setMessage(
          'The saved session was removed from this phone, but server revocation could not be confirmed. It may remain active until it expires.',
        );
      } else {
        setState('storage-error');
        setMessage('Sign-out could not be completed. Try again; local removal is not confirmed.');
      }
    } catch {
      if (generation.current === current) {
        setState('storage-error');
        setMessage('Sign-out could not be completed. Try again.');
      }
    } finally {
      active.current = false;
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'OpenFind will try to revoke the server session. If the server cannot be reached, the saved session will still be removed from this phone but may remain active on the server until it expires.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', onPress: () => void signOut() },
      ],
    );
  };

  const forgetLocal = () => {
    Alert.alert(
      'Forget saved sign-in?',
      'This only removes the credential from this phone. It does not revoke the server session, which may remain active until it expires.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove from phone',
          style: 'destructive',
          onPress: () => {
            if (!mounted.current || active.current || checkInFlight.current || !runtime.current)
              return;
            active.current = true;
            const current = generation.current;
            setState('working');
            void runtime.current
              .forgetLocalSession()
              .then(
                () => {
                  if (generation.current === current) {
                    setState('local-only');
                    setMessage(
                      'The saved session was removed from this phone. The server session was not revoked and may remain active until it expires.',
                    );
                  }
                },
                () => {
                  if (generation.current === current) {
                    setState('storage-error');
                    setMessage('Could not remove the saved session. Try again.');
                  }
                },
              )
              .finally(() => {
                active.current = false;
              });
          },
        },
      ],
    );
  };

  const canSignIn = state === 'signed-out' || state === 'local-only';
  const canSignOut = state === 'authenticated' || state === 'offline';
  const canRetry = state === 'unavailable' || state === 'offline' || state === 'storage-error';
  const statusTitle =
    state === 'authenticated'
      ? 'Signed in'
      : state === 'offline'
        ? 'Session not verified'
        : state === 'local-only'
          ? 'Removed from phone'
          : state === 'unavailable'
            ? 'Sign-in unavailable'
            : state === 'storage-error'
              ? 'Session needs attention'
              : state === 'checking' || state === 'working'
                ? 'Please wait'
                : 'Not signed in';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>OWNER ACCOUNT</Text>
        <Text style={styles.title}>Sign in with Google</Text>
        <Text style={styles.description}>
          Use your Google account to connect to your OpenFind web account. Mobile sign-in requires a
          configured test server.
        </Text>
        <View style={styles.notice} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <Text style={styles.noticeTitle}>{statusTitle}</Text>
          <Text style={styles.noticeText}>{message}</Text>
        </View>
        <Pressable
          style={[styles.button, !canSignIn && styles.disabledButton]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSignIn }}
          disabled={!canSignIn}
          onPress={() => void signIn()}
        >
          <Text style={styles.buttonText}>Continue with Google</Text>
        </Pressable>
        {canSignOut && (
          <Pressable style={styles.secondary} accessibilityRole="button" onPress={confirmSignOut}>
            <Text style={styles.secondaryText}>Sign out</Text>
          </Pressable>
        )}
        {canRetry && (
          <Pressable
            style={styles.secondary}
            accessibilityRole="button"
            onPress={() => void refresh()}
          >
            <Text style={styles.secondaryText}>Retry</Text>
          </Pressable>
        )}
        {state === 'storage-error' && runtime.current && (
          <Pressable style={styles.secondary} accessibilityRole="button" onPress={forgetLocal}>
            <Text style={styles.secondaryText}>Remove saved sign-in from phone</Text>
          </Pressable>
        )}
        <Text style={styles.caption}>Device finding is not available in this build.</Text>
        <Link href="/" style={styles.back}>
          ← Back to home
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f8fc' },
  page: { paddingHorizontal: 24, paddingTop: 46, paddingBottom: 32 },
  eyebrow: { color: '#318171', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: {
    color: '#142c42',
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 16,
  },
  description: { color: '#596f80', fontSize: 15, lineHeight: 24, marginTop: 16 },
  notice: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe6ed',
    borderRadius: 18,
    padding: 20,
    marginTop: 28,
  },
  noticeTitle: { color: '#173d55', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  noticeText: { color: '#617482', fontSize: 14, lineHeight: 21 },
  button: {
    marginTop: 22,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#176c62',
    padding: 16,
  },
  disabledButton: { backgroundColor: '#becbc6' },
  buttonText: { color: '#f6faf7', fontSize: 15, fontWeight: '700' },
  secondary: { marginTop: 16, paddingVertical: 10 },
  secondaryText: { color: '#176c62', fontSize: 15, fontWeight: '700' },
  caption: { color: '#81958b', fontSize: 12, lineHeight: 18, marginTop: 16 },
  back: { color: '#176c62', fontSize: 14, fontWeight: '700', marginTop: 30, paddingVertical: 8 },
});
