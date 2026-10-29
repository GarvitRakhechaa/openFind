import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Text style={styles.markText}>O</Text>
          </View>
          <Text style={styles.brand}>OpenFind</Text>
        </View>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ANDROID APP FOUNDATION</Text>
          <Text style={styles.title}>A little help goes a long way.</Text>
          <Text style={styles.description}>
            OpenFind is being built to help people find their phones with help from nearby,
            participating Android devices.
          </Text>
        </View>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.status}>EARLY DEVELOPMENT</Text>
          </View>
          <Text style={styles.cardTitle}>Finding is not active yet</Text>
          <Text style={styles.cardText}>
            Bluetooth discovery, accounts, location reporting, and the owner dashboard are not
            implemented in this build. Please don’t rely on it to find a lost phone.
          </Text>
        </View>
        <Link href="/about" style={styles.link}>
          Learn about the project →
        </Link>
        <Text style={styles.footer}>Built with privacy and community in mind.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f8fc' },
  page: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 32, flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#173d55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: '#ffffff', fontSize: 19, fontWeight: '800' },
  brand: { color: '#173d55', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  hero: { paddingTop: 70, paddingBottom: 34 },
  eyebrow: {
    color: '#318171',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 15,
  },
  title: { color: '#142c42', fontSize: 39, lineHeight: 45, fontWeight: '800', letterSpacing: -1.5 },
  description: { color: '#596f80', fontSize: 16, lineHeight: 25, marginTop: 18 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe6ed',
    backgroundColor: '#ffffff',
    padding: 22,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d59438' },
  status: { color: '#9e6720', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { color: '#173d55', fontSize: 18, fontWeight: '700', marginBottom: 9 },
  cardText: { color: '#617482', fontSize: 14, lineHeight: 21 },
  link: { color: '#176c62', fontSize: 15, fontWeight: '700', marginTop: 25, paddingVertical: 8 },
  footer: { color: '#8b9ba7', fontSize: 12, marginTop: 'auto', paddingTop: 45 },
});
