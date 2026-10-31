import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createMobileExchangeHandler } from '../src/auth/mobile-exchange-handler';

const id = randomBytes(32).toString('base64url');
const verifier = randomBytes(32).toString('base64url');
const input = { id, verifier, token: 'a.b.c' };
const request = (value: unknown, headers: Record<string, string> = {}) =>
  new Request('https://example.invalid/mobile/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(value),
  });
let calls = 0;
const handler = createMobileExchangeHandler({
  allowAttempt: async () => true,
  issueSession: async (body) => {
    calls += 1;
    assert.deepEqual(body, input);
    return 'fake-session';
  },
});
const success = await handler(request(input));
assert.equal(success.status, 200);
assert.deepEqual(await success.json(), { session: 'fake-session' });
assert.equal(success.headers.get('cache-control'), 'no-store');
assert.equal((await handler(request({ ...input, extra: 1 }))).status, 400);
assert.equal((await handler(request(input, { origin: 'https://example.invalid' }))).status, 403);
assert.equal((await handler(request(input, { cookie: 'test=1' }))).status, 403);
assert.equal((await handler(new Request('https://example.invalid'))).status, 405);
assert.equal(calls, 1);
const rejected = createMobileExchangeHandler({
  allowAttempt: async () => true,
  issueSession: async () => null,
});
assert.equal((await rejected(request(input))).status, 401);
const denied = createMobileExchangeHandler({
  allowAttempt: async () => false,
  issueSession: async () => {
    throw new Error('must not execute');
  },
});
assert.equal((await denied(request(input))).status, 429);
const broken = createMobileExchangeHandler({
  allowAttempt: async () => true,
  issueSession: async () => {
    throw new Error('private-token');
  },
});
const failure = await broken(request(input));
assert.equal(failure.status, 503);
assert.ok(!(await failure.text()).includes('private-token'));
console.log('PASS: mobile exchange handler synthetic request and failure boundaries');
