import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>Finding, together.</Text>
        <Text style={styles.text}>
          The planned OpenFind network will let consenting users help locate nearby devices using
          Bluetooth. A phone must be set up before it is lost, and a helper needs the app too.
        </Text>
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Not available yet</Text>
          <Text style={styles.text}>
            This is an early app shell, not a working finding service. Location reports will be
            approximate and availability will depend on Android, Bluetooth and nearby participants.
          </Text>
        </View>
        <Text style={styles.text}>
          Privacy, recovery and misuse protections still require design and security review before a
          public launch.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f8fc' },
  page: { padding: 24, gap: 20 },
  title: { color: '#142c42', fontSize: 31, fontWeight: '800', letterSpacing: -0.8 },
  text: { color: '#596f80', fontSize: 15, lineHeight: 24 },
  note: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe6ed',
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    gap: 9,
  },
  noteTitle: { color: '#173d55', fontWeight: '700', fontSize: 16 },
});
