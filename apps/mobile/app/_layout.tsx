import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerStyle: { backgroundColor: '#f5f8fc' }, headerTintColor: '#142c42' }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Owner account' }} />
        <Stack.Screen name="ble-lab" options={{ title: 'Bluetooth test' }} />
        <Stack.Screen name="permissions" options={{ title: 'Permissions' }} />
        <Stack.Screen name="about" options={{ title: 'About OpenFind' }} />
      </Stack>
    </>
  );
}
