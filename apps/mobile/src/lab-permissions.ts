// Requirements for the existing foreground BLE diagnostic ONLY, not the
// unfinished finding network. This module never requests OS permissions.
export type LabPermission = 'connect' | 'scan' | 'advertise' | 'coarseLocation' | 'fineLocation';

export function getLabRequirements(api: number): {
  supported: boolean;
  scan: LabPermission[];
  broadcast: LabPermission[];
} {
  if (!Number.isInteger(api) || api < 29) return { supported: false, scan: [], broadcast: [] };
  const location: LabPermission[] = ['coarseLocation', 'fineLocation'];
  if (api >= 31) {
    return {
      supported: true,
      scan: ['connect', 'scan', ...location],
      broadcast: ['connect', 'advertise'],
    };
  }
  return { supported: true, scan: location, broadcast: [] };
}
