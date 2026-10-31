import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createMobileAuthRuntime, type RuntimeOptions } from '../src/auth/mobile-auth-runtime';
import { createBoundSessionStore } from '../src/auth/session-store';

const random = () => randomBytes(32).toString('base64url');
const id = random();
const nonce = random();
const verifier = random();
let saved: string | null = null;
let reads = 0;
let deletes = 0;
let available = true;
let failSet = false;
let failDelete = false;
let googleCancelled = false;
let offline = false;
let invalid = false;
let badSignOut = false;
const operations: string[] = [];
const storage: RuntimeOptions['storage'] = {
  isAvailableAsync: async () => available,
  getItemAsync: async () => {
    reads++;
    return saved;
  },
  setItemAsync: async (_key, value) => {
    saved = value;
    if (failSet) throw new Error('synthetic failure after write');
  },
  deleteItemAsync: async () => {
    deletes++;
    if (failDelete) throw new Error('synthetic failure');
    saved = null;
  },
};
const native: NonNullable<RuntimeOptions['native']> = {
  createAttemptProof: () => ({ verifier, verifierHash: 'a'.repeat(64) }),
  requestGoogleToken: async (client, receivedNonce) => {
    assert.equal(client, 'test.apps.googleusercontent.com');
    assert.equal(receivedNonce, nonce);
    return googleCancelled
      ? { status: 'cancelled' }
      : { status: 'ok', token: 'fake.google.id-token' };
  },
  apiRequest: async (base, operation, body, credential) => {
    assert.equal(base, 'https://test.example');
    operations.push(operation);
    if (offline) throw new Error('synthetic offline');
    if (operation === 'start') {
      assert.equal(credential, null);
      assert.deepEqual(JSON.parse(body!), { verifierHash: 'a'.repeat(64) });
      return { status: 200, body: JSON.stringify({ id, nonce }) };
    }
    if (operation === 'exchange') {
      assert.equal(credential, null);
      assert.deepEqual(JSON.parse(body!), { id, verifier, token: 'fake.google.id-token' });
      return { status: 200, body: '{"session":"fake-session"}' };
    }
    assert.equal(credential, 'fake-session');
    if (operation === 'session') {
      return invalid ? { status: 401, body: '' } : { status: 200, body: '{"authenticated":true}' };
    }
    return { status: 200, body: badSignOut ? '{}' : '{"signedOut":true}' };
  },
  clearProviderState: async () => true,
};
const options: RuntimeOptions = {
  enabled: true,
  platform: 'android',
  origin: 'https://TEST.EXAMPLE:443/',
  webClientId: 'test.apps.googleusercontent.com',
  native,
  storage,
};

const off = await createMobileAuthRuntime({ ...options, enabled: false });
assert.deepEqual(off, { status: 'unavailable', reason: 'disabled' });
assert.equal(reads, 0);
assert.equal(operations.length, 0);
assert.deepEqual(await createMobileAuthRuntime({ ...options, platform: 'ios' }), {
  status: 'unavailable',
  reason: 'platform',
});
for (const origin of [
  undefined,
  '',
  'http://test.example',
  'https://user@test.example',
  'https://test.example/path',
  'https://test.example?token=abc',
  'https://test.example#x',
  'https://test.example:0',
  'https://test.example:65536',
  'https://bad..example',
  'https://test.example\\@evil.example',
  'https://[::1]',
]) {
  assert.deepEqual(await createMobileAuthRuntime({ ...options, origin }), {
    status: 'unavailable',
    reason: 'config',
  });
}
for (const webClientId of [
  '',
  'wrong',
  'x.apps.googleusercontent.com.evil',
  ' x.apps.googleusercontent.com',
]) {
  assert.deepEqual(await createMobileAuthRuntime({ ...options, webClientId }), {
    status: 'unavailable',
    reason: 'config',
  });
}
assert.deepEqual(await createMobileAuthRuntime({ ...options, native: null }), {
  status: 'unavailable',
  reason: 'native',
});
available = false;
assert.deepEqual(await createMobileAuthRuntime(options), {
  status: 'unavailable',
  reason: 'storage',
});
available = true;
assert.equal(reads, 0);
assert.equal(operations.length, 0);

const runtime = await createMobileAuthRuntime(options);
assert.equal(runtime.status, 'ready');
if (runtime.status !== 'ready') throw new Error('runtime unavailable');
const controller = runtime.controller;
assert.equal(await controller.checkSession(), 'signed-out');
googleCancelled = true;
assert.equal(await controller.signIn(), 'cancelled');
assert.equal(saved, null);
assert.deepEqual(operations, ['start']);
googleCancelled = false;
operations.length = 0;
assert.equal(await controller.signIn(), 'authenticated');
assert.deepEqual(JSON.parse(saved!), {
  version: 1,
  origin: 'https://test.example',
  credential: 'fake-session',
});
assert.ok(!saved!.includes('fake.google.id-token'));
assert.equal(await controller.checkSession(), 'authenticated');
assert.equal(await controller.signOut(), 'signed-out');
assert.equal(saved, null);
assert.deepEqual(operations, ['start', 'exchange', 'session', 'sign-out']);

assert.equal(await controller.signIn(), 'authenticated');
invalid = true;
assert.equal(await controller.checkSession(), 'signed-out');
assert.equal(saved, null);
invalid = false;
assert.equal(await controller.signIn(), 'authenticated');
offline = true;
assert.equal(await controller.checkSession(), 'offline');
assert.notEqual(saved, null);
assert.equal(await controller.signOut(), 'local-only');
assert.equal(saved, null);
offline = false;
assert.equal(await controller.signIn(), 'authenticated');
badSignOut = true;
assert.equal(await controller.signOut(), 'local-only');
assert.equal(saved, null);
badSignOut = false;

// A different build-time API origin must never receive the old bearer.
assert.equal(await controller.signIn(), 'authenticated');
const original = saved;
const other = await createMobileAuthRuntime({ ...options, origin: 'https://other.example' });
assert.equal(other.status, 'ready');
if (other.status !== 'ready') throw new Error('runtime unavailable');
const count = operations.length;
assert.equal(await other.controller.checkSession(), 'error');
assert.equal(await other.controller.signIn(), 'failed');
assert.equal(await other.controller.signOut(), 'error');
assert.equal(saved, original);
assert.equal(operations.length, count);
await other.forgetLocalSession();
assert.equal(saved, null);
assert.equal(operations.length, count); // local-only: no server revocation

// Legacy, malformed and tampered records are retained but never sent.
for (const value of [
  'legacy-raw-token',
  '{}',
  '{',
  JSON.stringify({ version: 1, origin: 'https://test.example', credential: 'bad token' }),
]) {
  saved = value;
  assert.equal(await controller.checkSession(), 'error');
  assert.equal(saved, value);
  assert.equal(operations.length, count);
}
await runtime.forgetLocalSession();
const bound = createBoundSessionStore(storage, 'https://test.example');
await assert.rejects(() => bound.save('bad\ncredential'));
assert.equal(saved, null);

// Storage may write and then fail: no false sign-in, attempt deletion and revocation.
failSet = true;
assert.equal(await controller.signIn(), 'failed');
assert.equal(saved, null);
assert.equal(operations.at(-1), 'sign-out');
failSet = false;
assert.equal(await controller.signIn(), 'authenticated');
failDelete = true;
assert.equal(await controller.signOut(), 'error');
assert.notEqual(saved, null);
await assert.rejects(() => runtime.forgetLocalSession());
failDelete = false;
await runtime.forgetLocalSession();
assert.equal(saved, null);
assert.ok(deletes > 0);
console.log(
  'PASS: mobile runtime gates, native flow, origin-bound storage, failure and local-only handling',
);
