import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>OWNER ACCOUNT</Text>
        <Text style={styles.title}>Sign in with Google</Text>
        <Text style={styles.description}>
          Mobile sign-in is being prepared. You&apos;ll eventually use the same Google account as
          your OpenFind web dashboard.
        </Text>

        <View style={styles.notice} accessibilityRole="summary">
          <Text style={styles.noticeTitle}>Not connected yet</Text>
          <Text style={styles.noticeText}>
            For your security, sign-in is disabled until the mobile session handoff has been
            reviewed and tested. No account details are collected on this screen.
          </Text>
        </View>

        <View
          style={styles.disabledButton}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
        >
          <Text style={styles.disabledButtonText}>Continue with Google</Text>
        </View>

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
  disabledButton: {
    marginTop: 22,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#becbc6',
    padding: 16,
  },
  disabledButtonText: { color: '#f6faf7', fontSize: 15, fontWeight: '700' },
  caption: { color: '#81958b', fontSize: 12, lineHeight: 18, marginTop: 16 },
  back: { color: '#176c62', fontSize: 14, fontWeight: '700', marginTop: 30, paddingVertical: 8 },
});
