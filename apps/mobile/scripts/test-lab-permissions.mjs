import assert from 'node:assert/strict';
import { getLabRequirements } from '../src/lab-permissions.ts';

assert.deepEqual(getLabRequirements(28), { supported: false, scan: [], broadcast: [] });
assert.deepEqual(getLabRequirements(Number.NaN), { supported: false, scan: [], broadcast: [] });
assert.deepEqual(getLabRequirements(29), {
  supported: true,
  scan: ['coarseLocation', 'fineLocation'],
  broadcast: [],
});
assert.deepEqual(getLabRequirements(30), getLabRequirements(29));
assert.deepEqual(getLabRequirements(31), {
  supported: true,
  scan: ['connect', 'scan', 'coarseLocation', 'fineLocation'],
  broadcast: ['connect', 'advertise'],
});
assert.deepEqual(getLabRequirements(36), getLabRequirements(31));
console.log(
  'Diagnostic permission policy checks passed. No Android device or permissions were tested.',
);
