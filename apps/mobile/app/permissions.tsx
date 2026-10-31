import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BleLab, { type LabCapabilities } from '../modules/openfind-ble-lab';
import { getLabRequirements, type LabPermission } from '../src/lab-permissions';
import { androidLabPermissions } from '../src/android-lab-permissions';

type Status = boolean | null;
type PermissionSnapshot = Partial<Record<LabPermission, Status>>;

const labels: Record<LabPermission, string> = {
  connect: 'Nearby devices: Bluetooth access',
  scan: 'Nearby devices: scan',
  advertise: 'Nearby devices: broadcast',
  coarseLocation: 'Approximate location',
  fineLocation: 'Precise location',
};
const unknownCapabilities: LabCapabilities = {
  bleSupported: null,
  bluetoothEnabled: null,
  advertisingSupported: null,
};
function statusText(value: Status | undefined, yes: string, no: string) {
  return value === true ? yes : value === false ? no : 'Unknown';
}
function safeBoolean(value: unknown): Status {
  return typeof value === 'boolean' ? value : null;
}

export default function PermissionsScreen() {
  const [permissions, setPermissions] = useState<PermissionSnapshot>({});
  const [capabilities, setCapabilities] = useState<LabCapabilities>(unknownCapabilities);
  const [nativeStatus, setNativeStatus] = useState('Checking native module…');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const api = Platform.OS === 'android' ? Number(Platform.Version) : 0;
  const requirements = getLabRequirements(api);
  const keys = [...new Set([...requirements.scan, ...requirements.broadcast])];

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (mounted.current) setLoading(true);
    const needed = getLabRequirements(Platform.OS === 'android' ? Number(Platform.Version) : 0);
    const all = [...new Set([...needed.scan, ...needed.broadcast])];
    const entries = await Promise.all(
      all.map(async (key) => {
        try {
          return [key, await PermissionsAndroid.check(androidLabPermissions[key])] as const;
        } catch {
          return [key, null] as const;
        }
      }),
    );
    let nextCapabilities = unknownCapabilities;
    let nextNativeStatus = 'Native module unavailable. Install a new Android development build.';
    try {
      if (Platform.OS === 'android' && BleLab && typeof BleLab.getCapabilities === 'function') {
        const result = BleLab.getCapabilities();
        nextCapabilities = {
          bleSupported: safeBoolean(result?.bleSupported),
          bluetoothEnabled: safeBoolean(result?.bluetoothEnabled),
          advertisingSupported: safeBoolean(result?.advertisingSupported),
        };
        nextNativeStatus = 'Native module available; capabilities are best-effort checks.';
      }
    } catch {
      nextNativeStatus = 'Could not read hardware status. No Bluetooth operation was started.';
    }
    if (!mounted.current || request !== generation.current) return;
    setPermissions(Object.fromEntries(entries));
    setCapabilities(nextCapabilities);
    setNativeStatus(nextNativeStatus);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      mounted.current = false;
      generation.current++;
      listener.remove();
    };
  }, [refresh]);

  async function openSettings() {
    setMessage('');
    try {
      await Linking.openSettings();
    } catch {
      setMessage('Could not open settings. Open this app’s permissions in Android Settings.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.label}>READ-ONLY STATUS</Text>
        <Text style={styles.title}>Permissions &amp; capabilities</Text>
        <Text style={styles.copy}>
          These checks do not request permissions, enable Bluetooth, start scanning or share
          location.
        </Text>
        {!requirements.supported ? (
          <Text style={styles.note}>
            This diagnostic status targets Android 7 or newer; device compatibility remains
            untested.
          </Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.heading}>Phone capabilities</Text>
              <Text style={styles.row}>
                BLE hardware:{' '}
                {statusText(capabilities.bleSupported, 'Reported supported', 'Not reported')}
              </Text>
              <Text style={styles.row}>
                Bluetooth: {statusText(capabilities.bluetoothEnabled, 'On', 'Off')}
              </Text>
              <Text style={styles.row}>
                BLE advertising:{' '}
                {statusText(
                  capabilities.advertisingSupported,
                  'Reported supported',
                  'Not reported',
                )}
              </Text>
              <Text style={styles.note}>
                {nativeStatus} Unknown does not mean unsupported. Bluetooth access may be needed to
                check adapter status.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.heading}>Permissions for the test</Text>
              {keys.map((key) => (
                <Text key={key} style={styles.row}>
                  {labels[key]}: {statusText(permissions[key], 'Granted', 'Not granted')}
                </Text>
              ))}
              <Text style={styles.note}>
                The current scan test requires precise and approximate location permissions, but it
                does not read location. Android 12+ also needs nearby-device permissions. Status can
                change in system settings.
              </Text>
            </View>
          </>
        )}
        <View style={styles.card}>
          <Text style={styles.heading}>Future participation</Text>
          <Text style={styles.row}>Protecting your phone: not available yet.</Text>
          <Text style={styles.row}>Helping find other phones: not available yet.</Text>
          <Text style={styles.note}>
            These will require separate informed opt-ins. Permission grants are not consent to
            participate; no opt-in is recorded on this screen.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void refresh()}
          style={[styles.button, loading && styles.disabled]}
        >
          <Text style={styles.buttonText}>{loading ? 'Checking…' : 'Refresh status'}</Text>
        </Pressable>
        {Platform.OS === 'android' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void openSettings()}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Open app settings</Text>
          </Pressable>
        ) : null}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.note}>
            {message}
          </Text>
        ) : null}
        <Text style={styles.note}>
          Hardware and permission checks are not proof that the radio test, background operation or
          phone finding will work. The development build and real-device testing remain pending.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f8fc' },
  page: { padding: 24, gap: 14 },
  label: { color: '#318171', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: '#142c42', fontSize: 29, fontWeight: '800' },
  copy: { color: '#596f80', fontSize: 15, lineHeight: 23 },
  card: {
    backgroundColor: '#fff',
    borderColor: '#dbe6ed',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  heading: { color: '#173d55', fontSize: 16, fontWeight: '700' },
  row: { color: '#334f60', fontSize: 14, lineHeight: 21 },
  note: { color: '#617482', fontSize: 13, lineHeight: 20 },
  button: { backgroundColor: '#176c62', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  secondary: {
    borderColor: '#9aacb8',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  secondaryText: { color: '#173d55', fontSize: 15, fontWeight: '700' },
});
