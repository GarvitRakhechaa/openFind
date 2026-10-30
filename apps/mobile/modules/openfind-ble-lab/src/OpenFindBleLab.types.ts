export type LabEvent = {
  kind: 'broadcasting' | 'scanning' | 'detected' | 'stopped' | 'error';
  message: string;
};

export type LabEvents = { onLabEvent(event: LabEvent): void };

export type LabCapabilities = {
  bleSupported: boolean | null;
  bluetoothEnabled: boolean | null;
  advertisingSupported: boolean | null;
};
