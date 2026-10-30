import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BleLab, { type LabEvent } from '../modules/openfind-ble-lab';
import { getLabRequirements } from '../src/lab-permissions';
import { androidLabPermissions } from '../src/android-lab-permissions';

type Mode = 'broadcast' | 'scan';

async function requestPermissions(mode: Mode): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const requirements = getLabRequirements(Number(Platform.Version));
  if (!requirements.supported) return false;
  const permissions = requirements[mode].map((permission) => androidLabPermissions[permission]);
  if (permissions.length === 0) return true;
  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export default function BleLabScreen() {
  const [message, setMessage] = useState('Choose Broadcast on one phone and Scan on the other.');
  const [detections, setDetections] = useState(0);
  const [busy, setBusy] = useState(false);
  const runningAction = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const subscription = BleLab?.addListener('onLabEvent', (event: LabEvent) => {
      if (!mounted.current) return;
      setMessage(event.message);
      if (event.kind === 'detected') setDetections((count) => count + 1);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        BleLab?.stop();
        if (mounted.current) setMessage('Test stopped when the app left the foreground.');
      }
    });
    return () => {
      mounted.current = false;
      subscription?.remove();
      appState.remove();
      BleLab?.stop();
    };
  }, []);

  async function start(mode: Mode) {
    if (runningAction.current) return;
    if (!BleLab || Platform.OS !== 'android') {
      setMessage('Native BLE module is missing. Install a new Android development build.');
      return;
    }
    runningAction.current = true;
    setBusy(true);
    setDetections(0);
    setMessage('Checking permissions…');
    try {
      const granted = await requestPermissions(mode);
      if (!mounted.current) return;
      if (!granted) {
        setMessage('Required permission denied. Review app permissions in Android settings.');
        return;
      }
      if (AppState.currentState !== 'active') {
        setMessage('Return to this screen and try again.');
        return;
      }
      setMessage('Requesting Bluetooth operation…');
      if (mode === 'broadcast') BleLab.startBroadcast();
      else BleLab.startScan();
    } catch {
      if (mounted.current) setMessage('Could not start the test. Check Bluetooth and permissions.');
    } finally {
      runningAction.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function stop() {
    try {
      BleLab?.stop();
      setMessage('Test stopped.');
    } catch {
      setMessage('Could not stop cleanly. Close the app and turn Bluetooth off if needed.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.label}>TWO-PHONE DIAGNOSTIC</Text>
        <Text style={styles.title}>Bluetooth test</Text>
        <Text style={styles.copy}>
          Keep both Android phones nearby with this screen open. On one phone tap Broadcast; on the
          other tap Scan.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {message}
          </Text>
          <Text style={styles.count}>Detection events: {detections}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void start('broadcast')}
          style={[styles.button, busy && styles.disabled]}
        >
          <Text style={styles.buttonText}>Broadcast test beacon</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void start('scan')}
          style={[styles.button, busy && styles.disabled]}
        >
          <Text style={styles.buttonText}>Scan for test beacon</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={stop}
          style={[styles.stop, busy && styles.disabled]}
        >
          <Text style={styles.stopText}>Stop test</Text>
        </Pressable>
        <Text style={styles.note}>
          Temporary test only. The beacon has a fixed test identifier and is visible to nearby
          scanners. No account, location, device address or report is sent to a server. Android may
          request location permission for Bluetooth scanning; this test does not read location.
        </Text>
        <Text style={styles.note}>
          The test is designed to stop after 60 seconds or when the app leaves the foreground.
          Detection is not guaranteed and does not measure background reliability.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f8fc' },
  page: { padding: 24, gap: 14 },
  label: { color: '#318171', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: '#142c42', fontSize: 31, fontWeight: '800' },
  copy: { color: '#596f80', fontSize: 15, lineHeight: 23 },
  card: {
    backgroundColor: '#fff',
    borderColor: '#dbe6ed',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  cardTitle: { color: '#173d55', fontSize: 16, fontWeight: '700' },
  status: { color: '#334f60', fontSize: 15, lineHeight: 22 },
  count: { color: '#617482', fontSize: 13 },
  button: { backgroundColor: '#176c62', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  stop: {
    borderWidth: 1,
    borderColor: '#9aacb8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  stopText: { color: '#173d55', fontSize: 15, fontWeight: '700' },
  note: { color: '#617482', fontSize: 13, lineHeight: 20 },
});
