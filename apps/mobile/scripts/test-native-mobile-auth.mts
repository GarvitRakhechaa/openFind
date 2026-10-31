import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createNativeMobileAuth } from '../src/auth/native-mobile-auth';

const id = randomBytes(32).toString('base64url');
const nonce = randomBytes(32).toString('base64url');
const verifier = randomBytes(32).toString('base64url');
const proof = { verifier, verifierHash: 'a'.repeat(64) };
const origin = 'https://example.invalid';
const clientId = 'example.apps.googleusercontent.com';
let stored: string | null = null;
let valid = true;
let signOutOffline = false;
const seen: string[] = [];
const controller = createNativeMobileAuth(
  {
    createAttemptProof: () => proof,
    requestGoogleToken: async (client, receivedNonce) => {
      assert.equal(client, clientId);
      assert.equal(receivedNonce, nonce);
      return { status: 'ok', token: 'fake.google.token' };
    },
    apiRequest: async (base, operation, body, credential) => {
      assert.equal(base, origin);
      seen.push(operation);
      if (operation === 'start') {
        assert.equal(credential, null);
        assert.deepEqual(JSON.parse(body as string), { verifierHash: proof.verifierHash });
        return { status: 200, body: JSON.stringify({ id, nonce }) };
      }
      if (operation === 'exchange') {
        assert.equal(credential, null);
        assert.deepEqual(JSON.parse(body as string), { id, verifier, token: 'fake.google.token' });
        return { status: 200, body: JSON.stringify({ session: 'fake-session' }) };
      }
      assert.equal(credential, 'fake-session');
      if (operation === 'session') {
        assert.equal(body, null);
        return valid ? { status: 200, body: '{"authenticated":true}' } : { status: 401, body: '' };
      }
      if (signOutOffline) throw new Error('offline');
      return { status: 200, body: '{"signedOut":true}' };
    },
    clearProviderState: async () => true,
  },
  {
    read: async () => stored,
    save: async (value) => {
      stored = value;
    },
    remove: async () => {
      stored = null;
    },
  },
  { origin, webClientId: clientId },
);
assert.equal(await controller.signIn(), 'authenticated');
assert.equal(stored, 'fake-session');
assert.equal(await controller.checkSession(), 'authenticated');
assert.equal(await controller.signOut(), 'signed-out');
assert.equal(stored, null);
assert.deepEqual(seen, ['start', 'exchange', 'session', 'sign-out']);
assert.equal(await controller.signIn(), 'authenticated');
valid = false;
assert.equal(await controller.checkSession(), 'signed-out');
assert.equal(stored, null);
assert.equal(await controller.signIn(), 'authenticated');
signOutOffline = true;
assert.equal(await controller.signOut(), 'local-only');
assert.equal(stored, null);
assert.throws(() =>
  createNativeMobileAuth({} as never, {} as never, { origin, webClientId: 'invalid' }),
);
console.log('PASS: native auth adapter contract, session validation and offline sign-out');
