import { requireOptionalNativeModule, type NativeModule } from 'expo';
import type { LabCapabilities, LabEvents } from './OpenFindBleLab.types';

declare class OpenFindBleLabModule extends NativeModule<LabEvents> {
  getCapabilities(): LabCapabilities;
  startBroadcast(): string;
  startScan(): string;
  stop(): void;
}

// Missing in Expo Go, old builds and unsupported platforms; never crash the app.
export default requireOptionalNativeModule<OpenFindBleLabModule>('OpenFindBleLab');
