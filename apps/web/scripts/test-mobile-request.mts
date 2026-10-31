import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readMobileAuthBody } from '../src/auth/mobile-request';

const baseURL = 'https://openfind.example/mobile-auth';
const value = randomBytes(32).toString('base64url');
const verifierHash = 'a'.repeat(64);
const validStart = { verifierHash };
const validExchange = { id: value, verifier: value, token: 'a.b.c' };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(baseURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
function streamRequest(body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request(baseURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

assert.deepEqual(await readMobileAuthBody(request(validStart), 'start'), validStart);
assert.deepEqual(await readMobileAuthBody(request(validExchange), 'exchange'), validExchange);
assert.deepEqual(
  await readMobileAuthBody(
    request(validStart, { 'content-type': 'application/json; charset=UTF-8' }),
    'start',
  ),
  validStart,
);
assert.deepEqual(
  await readMobileAuthBody(request(validStart, { 'content-length': '1' }), 'start'),
  validStart,
);
assert.equal(await readMobileAuthBody(new Request(baseURL), 'start'), null);
assert.equal(
  await readMobileAuthBody(request(validStart, { 'content-type': 'text/plain' }), 'start'),
  null,
);
assert.equal(
  await readMobileAuthBody(
    request(validStart, { 'content-type': 'application/json; charset=utf-16' }),
    'start',
  ),
  null,
);
assert.equal(
  await readMobileAuthBody(request(validStart, { 'content-encoding': 'gzip' }), 'start'),
  null,
);
assert.equal(
  await readMobileAuthBody(request(validStart, { 'content-length': '12289' }), 'start'),
  null,
);
assert.equal(
  await readMobileAuthBody(request(validStart, { 'content-length': '-1' }), 'start'),
  null,
);
for (const bad of [
  null,
  [],
  {},
  { verifierHash: 'bad' },
  { ...validStart, extra: true },
  { ...validStart, verifierHash: `${verifierHash}\n` },
]) {
  assert.equal(await readMobileAuthBody(request(bad), 'start'), null);
}
for (const bad of [
  { ...validExchange, id: 'bad' },
  { ...validExchange, verifier: 'bad' },
  { ...validExchange, token: 'x'.repeat(8193) },
  { ...validExchange, token: 'a.b.c\n' },
  { ...validExchange, token: 'a.b' },
  { ...validExchange, extra: 'unexpected' },
  { id: value, verifier: value },
]) {
  assert.equal(await readMobileAuthBody(request(bad), 'exchange'), null);
}
const malformed = new Request(baseURL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{',
});
assert.equal(await readMobileAuthBody(malformed, 'start'), null);
const invalidUtf8 = streamRequest(
  new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array([0xff]));
      c.close();
    },
  }),
);
assert.equal(await readMobileAuthBody(invalidUtf8, 'start'), null);
const alreadyRead = request(validStart);
await alreadyRead.text();
assert.equal(await readMobileAuthBody(alreadyRead, 'start'), null);

let largeCancelled = false;
const oversized = streamRequest(
  new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(12_289));
    },
    cancel() {
      largeCancelled = true;
    },
  }),
  { 'content-length': '1' },
);
assert.equal(await readMobileAuthBody(oversized, 'start'), null);
assert.equal(largeCancelled, true, 'actual stream limit must apply despite a false length');

let emptyChunksCancelled = false;
const tooManyChunks = streamRequest(
  new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(0));
    },
    cancel() {
      emptyChunksCancelled = true;
    },
  }),
);
assert.equal(await readMobileAuthBody(tooManyChunks, 'start'), null);
assert.equal(emptyChunksCancelled, true);

let timeoutCancelled = false;
const stalled = streamRequest(
  new ReadableStream({
    cancel() {
      timeoutCancelled = true;
    },
  }),
);
assert.equal(await readMobileAuthBody(stalled, 'start'), null);
assert.equal(timeoutCancelled, true, 'stalled request stream should be cancelled');
console.log('Mobile request boundary tests passed; real Google login was not tested.');
