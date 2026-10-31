import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  MobileAuthController,
  type MobileAuthDependencies,
} from '../src/auth/mobile-auth-controller';

const newValue = () => randomBytes(32).toString('base64url');
let saved: string | null = null;
let googleCalls = 0;
let exchangeCalls = 0;
let revocations = 0;
let clearCalls = 0;
let offline = false;
const nonce = newValue();
const id = newValue();
const verifier = newValue();
const verifierHash = createHash('sha256')
  .update('openfind:mobile-auth:verifier:v1\0')
  .update(verifier)
  .digest('hex');
const deps: MobileAuthDependencies = {
  createProof: () => ({ verifier, verifierHash }),
  start: async (hash) => {
    assert.equal(hash, verifierHash);
    return { id, nonce };
  },
  google: async (actualNonce) => {
    assert.equal(actualNonce, nonce);
    googleCalls += 1;
    return { status: 'ok', token: 'test.google.token' };
  },
  exchange: async (input) => {
    exchangeCalls += 1;
    assert.deepEqual(input, { id, verifier, token: 'test.google.token' });
    return 'test-session';
  },
  read: async () => saved,
  save: async (value) => {
    saved = value;
  },
  remove: async () => {
    saved = null;
  },
  validate: async () => {
    if (offline) throw new Error('offline');
    return 'valid';
  },
  revoke: async () => {
    if (offline) throw new Error('offline');
    revocations += 1;
  },
  clearProvider: async () => {
    clearCalls += 1;
  },
};
const controller = new MobileAuthController(deps);
assert.equal(await controller.checkSession(), 'signed-out');
assert.equal(await controller.signIn(), 'authenticated');
assert.equal(saved, 'test-session');
assert.equal(await controller.checkSession(), 'authenticated');
assert.equal(await controller.signIn(), 'failed');
assert.equal(googleCalls, 1);
assert.equal(exchangeCalls, 1);
assert.equal(await controller.signOut(), 'signed-out');
assert.equal(saved, null);
assert.equal(revocations, 1);
assert.equal(clearCalls, 1);
const cancelled = new MobileAuthController({
  ...deps,
  google: async () => ({ status: 'cancelled' }),
});
assert.equal(await cancelled.signIn(), 'cancelled');
assert.equal(exchangeCalls, 1);
const invalidAttempt = new MobileAuthController({
  ...deps,
  start: async () => ({ id: 'bad', nonce }),
});
assert.equal(await invalidAttempt.signIn(), 'failed');
assert.equal(googleCalls, 1);
const saveFailed = new MobileAuthController({
  ...deps,
  save: async () => {
    throw new Error('storage failed');
  },
});
assert.equal(await saveFailed.signIn(), 'failed');
assert.equal(revocations, 2);
saved = 'existing-session';
offline = true;
assert.equal(await controller.checkSession(), 'offline');
assert.equal(saved, 'existing-session');
assert.equal(await controller.signOut(), 'local-only');
assert.equal(saved, null);
offline = false;
saved = 'invalid-session';
const invalid = new MobileAuthController({ ...deps, validate: async () => 'invalid' });
assert.equal(await invalid.checkSession(), 'signed-out');
assert.equal(saved, null);
let finishStart: ((value: { id: string; nonce: string }) => void) | undefined;
const waiting = new MobileAuthController({
  ...deps,
  start: () =>
    new Promise((resolve) => {
      finishStart = resolve;
    }),
});
const ongoing = waiting.signIn();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(await waiting.signIn(), 'busy');
assert.equal(await waiting.signOut(), 'busy');
assert.ok(finishStart);
finishStart({ id, nonce });
assert.equal(await ongoing, 'authenticated');
console.log('PASS: mobile auth controller synthetic lifecycle and offline logout');
