import * as SecureStore from 'expo-secure-store';

// Android Keystore-backed encrypted storage. Backup exclusions are configured
// separately; neither protects against every compromised-device scenario.
export const platformSecureStorage = {
  isAvailableAsync: () => SecureStore.isAvailableAsync(),
  getItemAsync: (key: string) => SecureStore.getItemAsync(key),
  setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key),
};
