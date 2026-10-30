import { PermissionsAndroid } from 'react-native';
import type { LabPermission } from './lab-permissions';

export const androidLabPermissions: Record<
  LabPermission,
  (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]
> = {
  connect: PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  scan: PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  advertise: PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
  coarseLocation: PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  fineLocation: PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
};
