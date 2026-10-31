// Isolated PGlite + synthetic Google integration. No real Android or Neon.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAuth } from '../src/auth/factory';
import { createMobileAttempt, hashMobileVerifier } from '../src/auth/mobile-attempt-verification';
import {
  allowMobileApiRequest,
  cleanupMobileApiData,
  mobileClientBucket,
} from '../src/auth/mobile-api-rate-limit';
import { createMobileStartHandler } from '../src/auth/mobile-start-handler';
import { createMobileExchangeHandler } from '../src/auth/mobile-exchange-handler';
import { createMobileSessionHandlers } from '../src/auth/mobile-session-handler';
import {
  isMobileSessionValid,
  issueMobileSignedSession,
  revokeMobileSession,
} from '../src/auth/mobile-session-adapter';
import { createMobileCleanupHandler } from '../src/auth/mobile-cleanup-handler';
import { createMobileApiDispatcher, handleMobileApi } from '../src/auth/mobile-api-route';
import { readMobileApiConfig } from '../src/auth/mobile-api-config';
import * as schema from '../src/auth/schema';
import { createMobileAuthRuntime } from '../../mobile/src/auth/mobile-auth-runtime';

const baseURL = 'https://fixture.example';
const config = {
  baseURL,
  secret: randomBytes(32).toString('base64url'),
  clientId: 'fixture-web-client.apps.googleusercontent.com',
  clientSecret: 'fixture-secret',
};
const policy = { webClientId: config.clientId, androidClientId: 'fixture-android-client' };
const rateSecret = randomBytes(32).toString('base64url');
const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as { entries: Array<{ tag: string }> };
const client = new PGlite();
const db = drizzle(client, { schema });
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
  return Response.json({ keys: [{ ...jwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
};
const ip = '203.0.113.12';
const jsonReq = (path: string, body: object, headers: Record<string, string> = {}) =>
  new Request(`${baseURL}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...headers },
    body: JSON.stringify(body),
  });
const sessionReq = (credential: string, headers: Record<string, string> = {}) =>
  new Request(`${baseURL}/session`, {
    method: 'GET',
    headers: { authorization: `Bearer ${credential}`, 'x-real-ip': ip, ...headers },
  });
try {
  for (const entry of journal.entries)
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  const auth = createAuth(db, config);
  const context = await auth.$context;
  const webUser = await context.internalAdapter.createUser(
    { name: 'Web user', email: 'fixture@example.invalid', emailVerified: true },
    { method: 'admin' },
  );
  await context.internalAdapter.createAccount({
    providerId: 'google',
    accountId: 'same-google-subject',
    userId: webUser.id,
  });
  const allow = (req: Request, op: 'start' | 'exchange' | 'session' | 'sign-out') =>
    allowMobileApiRequest(db, req, op, rateSecret, true);
  const start = createMobileStartHandler({
    allowAttempt: (req) => allow(req, 'start'),
    createAttempt: (hash) => createMobileAttempt(db, hash),
  });
  const exchange = createMobileExchangeHandler({
    allowAttempt: (req) => allow(req, 'exchange'),
    issueSession: (input) => issueMobileSignedSession(db, config, policy, input),
  });
  const sessions = createMobileSessionHandlers({
    allowRequest: allow,
    validate: (value) => isMobileSessionValid(db, config, value),
    revoke: (value) => revokeMobileSession(db, config, value),
  });
  const verifier = randomBytes(32).toString('base64url');
  const startResponse = await start(
    jsonReq('start', { verifierHash: hashMobileVerifier(verifier) }),
  );
  assert.equal(startResponse.status, 200);
  assert.equal(startResponse.headers.get('cache-control'), 'no-store');
  const { id, nonce } = (await startResponse.json()) as { id: string; nonce: string };
  const token = await new SignJWT({
    nonce,
    email: 'fixture@example.invalid',
    email_verified: true,
    name: 'Test',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(policy.webClientId)
    .setSubject('same-google-subject')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const input = { id, verifier, token };
  const wrong = await exchange(
    jsonReq('exchange', { ...input, verifier: randomBytes(32).toString('base64url') }),
  );
  assert.equal(wrong.status, 401);
  const good = await exchange(jsonReq('exchange', input));
  assert.equal(good.status, 200);
  const { session } = (await good.json()) as { session: string };
  assert.ok(
    session.length > 32 && !session.includes('=') && !session.includes('same-google-subject'),
  );
  assert.equal((await exchange(jsonReq('exchange', input))).status, 401);
  assert.equal((await sessions(sessionReq(session), 'session')).status, 200);
  assert.equal((await sessions(sessionReq(session, { origin: baseURL }), 'session')).status, 403);
  assert.equal((await sessions(sessionReq(session, { cookie: 'x=y' }), 'session')).status, 403);
  assert.equal((await sessions(sessionReq(`${session}tampered`), 'session')).status, 401);
  assert.equal(
    (await exchange(jsonReq('exchange', input, { authorization: 'Bearer x' }))).status,
    403,
  );
  const cookieName = context.authCookies.sessionToken.name;
  const resolved = await auth.api.getSession({
    headers: new Headers({ cookie: `${cookieName}=${session}` }),
  });
  assert.equal(resolved?.user.id, webUser.id);
  const internalPublic = await auth.handler(
    new Request(`${baseURL}/api/auth/openfind-internal-mobile-issue`, {
      method: 'POST',
      headers: { origin: baseURL },
    }),
  );
  assert.equal(internalPublic.status, 404);
  assert.equal(
    (
      await sessions(
        jsonReq('sign-out', { extra: 1 }, { authorization: `Bearer ${session}` }),
        'sign-out',
      )
    ).status,
    400,
  );
  assert.equal(
    (await sessions(jsonReq('sign-out', {}, { authorization: `Bearer ${session}` }), 'sign-out'))
      .status,
    200,
  );
  assert.equal((await sessions(sessionReq(session), 'session')).status, 401);
  const broken = createMobileSessionHandlers({
    allowRequest: async () => true,
    validate: async () => {
      throw new Error('secret');
    },
    revoke: async () => {
      throw new Error('secret');
    },
  });
  assert.equal((await broken(sessionReq(session), 'session')).status, 503);
  assert.equal(
    (await broken(jsonReq('sign-out', {}, { authorization: `Bearer ${session}` }), 'sign-out'))
      .status,
    503,
  );
  const outside = new Request(baseURL, { headers: { 'x-real-ip': ip } });
  assert.equal(
    mobileClientBucket(outside, false, rateSecret),
    mobileClientBucket(new Request(baseURL), false, rateSecret),
  );
  assert.notEqual(
    mobileClientBucket(outside, true, rateSecret),
    mobileClientBucket(outside, false, rateSecret),
  );
  assert.equal(
    mobileClientBucket(
      new Request(baseURL, { headers: { 'x-real-ip': '2001:0db8:0:0:0:0:0:1' } }),
      true,
      rateSecret,
    ),
    mobileClientBucket(
      new Request(baseURL, { headers: { 'x-real-ip': '2001:db8::1' } }),
      true,
      rateSecret,
    ),
  );
  // Exercise the exact route dispatcher, not just independently injected handlers.
  const dispatch = createMobileApiDispatcher({
    readConfig: () => ({
      auth: config,
      androidClientId: policy.androidClientId,
      rateSecret,
      onVercel: true,
    }),
    database: () => db,
  });
  const dispatchIp = { 'x-real-ip': '198.51.100.42' };
  const v2 = randomBytes(32).toString('base64url');
  const start2 = await dispatch(
    jsonReq('api/mobile-auth/start', { verifierHash: hashMobileVerifier(v2) }, dispatchIp),
    'start',
  );
  assert.equal(start2.status, 200);
  const a2 = (await start2.json()) as { id: string; nonce: string };
  const google2 = await new SignJWT({
    nonce: a2.nonce,
    email: 'fixture@example.invalid',
    email_verified: true,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(policy.webClientId)
    .setSubject('same-google-subject')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const sameAttempt = { id: a2.id, verifier: v2, token: google2 };
  const raced = await Promise.all(
    Array.from({ length: 5 }, () =>
      dispatch(jsonReq('api/mobile-auth/exchange', sameAttempt, dispatchIp), 'exchange'),
    ),
  );
  assert.equal(raced.filter((item) => item.status === 200).length, 1);
  assert.equal(raced.filter((item) => item.status === 401).length, 4);
  const winner = raced.find((item) => item.status === 200)!;
  const signed2 = ((await winner.json()) as { session: string }).session;
  assert.equal((await dispatch(sessionReq(signed2, dispatchIp), 'session')).status, 200);
  assert.equal(
    (
      await dispatch(
        jsonReq(
          'api/mobile-auth/sign-out',
          {},
          { ...dispatchIp, authorization: `Bearer ${signed2}` },
        ),
        'sign-out',
      )
    ).status,
    200,
  );
  assert.equal((await dispatch(sessionReq(signed2, dispatchIp), 'session')).status, 401);

  // Connect the real client controller/adapter/storage envelope to the actual
  // dispatcher using an in-process native bridge and synthetic Google JWT.
  let savedEnvelope: string | null = null;
  let sentCredential: string | null = null;
  const callOrder: string[] = [];
  const mobile = await createMobileAuthRuntime({
    enabled: true,
    platform: 'android',
    origin: baseURL,
    webClientId: config.clientId,
    storage: {
      isAvailableAsync: async () => true,
      getItemAsync: async () => savedEnvelope,
      setItemAsync: async (_key, value) => {
        savedEnvelope = value;
      },
      deleteItemAsync: async () => {
        savedEnvelope = null;
      },
    },
    native: {
      createAttemptProof: () => {
        const verifier = randomBytes(32).toString('base64url');
        return { verifier, verifierHash: hashMobileVerifier(verifier) };
      },
      requestGoogleToken: async (audience, receivedNonce) => ({
        status: 'ok',
        token: await new SignJWT({
          nonce: receivedNonce,
          email: 'fixture@example.invalid',
          email_verified: true,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
          .setIssuer('https://accounts.google.com')
          .setAudience(audience)
          .setSubject('same-google-subject')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey),
      }),
      apiRequest: async (origin, operation, body, credential) => {
        assert.equal(origin, baseURL);
        callOrder.push(operation);
        if (credential) sentCredential = credential;
        const headers: Record<string, string> = { 'x-real-ip': '198.51.100.77' };
        if (credential) headers.authorization = `Bearer ${credential}`;
        if (body) headers['content-type'] = 'application/json';
        const response = await dispatch(
          new Request(`${origin}/api/mobile-auth/${operation}`, {
            method: operation === 'session' ? 'GET' : 'POST',
            headers,
            body,
          }),
          operation,
        );
        return { status: response.status, body: await response.text() };
      },
      clearProviderState: async () => true,
    },
  });
  assert.equal(mobile.status, 'ready');
  if (mobile.status !== 'ready') throw new Error('mobile runtime unavailable');
  assert.equal(await mobile.controller.checkSession(), 'signed-out');
  assert.equal(await mobile.controller.signIn(), 'authenticated');
  assert.ok(savedEnvelope);
  assert.equal((JSON.parse(savedEnvelope!) as { origin: string }).origin, baseURL);
  assert.equal(await mobile.controller.checkSession(), 'authenticated');
  assert.ok(sentCredential);
  const savedCredential = sentCredential;
  assert.equal(await mobile.controller.signOut(), 'signed-out');
  assert.equal(savedEnvelope, null);
  assert.deepEqual(callOrder, ['start', 'exchange', 'session', 'sign-out']);
  assert.equal(
    (await dispatch(sessionReq(savedCredential!, { 'x-real-ip': '198.51.100.77' }), 'session'))
      .status,
    401,
  );

  const disabled = createMobileApiDispatcher({
    readConfig: () => null,
    database: () => {
      throw new Error('must not connect');
    },
  });
  assert.equal((await disabled(jsonReq('start', {}), 'start')).status, 503);
  const unavailableDb = createMobileApiDispatcher({
    readConfig: () => ({
      auth: config,
      androidClientId: policy.androidClientId,
      rateSecret,
      onVercel: true,
    }),
    database: () => {
      throw new Error('private db details');
    },
  });
  const dbFailure = await unavailableDb(jsonReq('start', {}), 'start');
  assert.equal(dbFailure.status, 503);
  assert.ok(!(await dbFailure.text()).includes('private db details'));
  assert.equal(
    (await dispatch(new Request('https://other.invalid/start', { method: 'POST' }), 'start'))
      .status,
    503,
  );
  const previousFlag = process.env.OPENFIND_MOBILE_AUTH_ENABLED;
  delete process.env.OPENFIND_MOBILE_AUTH_ENABLED;
  try {
    assert.equal((await handleMobileApi(jsonReq('start', {}), 'start')).status, 503);
  } finally {
    if (previousFlag === undefined) delete process.env.OPENFIND_MOBILE_AUTH_ENABLED;
    else process.env.OPENFIND_MOBILE_AUTH_ENABLED = previousFlag;
  }
  const names = [
    'OPENFIND_MOBILE_AUTH_ENABLED',
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_ANDROID_CLIENT_ID',
    'DATABASE_URL',
    'MOBILE_AUTH_RATE_SECRET',
    'CRON_SECRET',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      OPENFIND_MOBILE_AUTH_ENABLED: 'true',
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: config.secret,
      GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'fixture',
      GOOGLE_ANDROID_CLIENT_ID: 'android.apps.googleusercontent.com',
      DATABASE_URL: 'postgres://example.invalid/db',
      MOBILE_AUTH_RATE_SECRET: rateSecret,
      CRON_SECRET: randomBytes(32).toString('base64url'),
    });
    assert.ok(readMobileApiConfig());
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    assert.equal(readMobileApiConfig(), null);
    process.env.BETTER_AUTH_URL = baseURL;
    process.env.MOBILE_AUTH_RATE_SECRET = config.secret;
    assert.equal(readMobileApiConfig(), null);
    process.env.MOBILE_AUTH_RATE_SECRET = rateSecret;
    delete process.env.CRON_SECRET;
    assert.equal(readMobileApiConfig(), null);
    process.env.OPENFIND_MOBILE_AUTH_ENABLED = 'false';
    assert.equal(readMobileApiConfig(), null);
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  const limiterClient = new Request(baseURL, { headers: { 'x-real-ip': '198.51.100.88' } });
  const outcomes = await Promise.all(
    Array.from({ length: 12 }, () =>
      allowMobileApiRequest(db, limiterClient, 'start', rateSecret, true),
    ),
  );
  assert.equal(outcomes.filter(Boolean).length, 8);
  const rows = await client.query<{ key: string }>(
    "SELECT key FROM rate_limit WHERE key LIKE 'openfind-mobile-v2:%'",
  );
  assert.ok(rows.rows.every((row) => !row.key.includes(ip)));
  await client.query(
    "UPDATE rate_limit SET last_request = 0 WHERE key LIKE 'openfind-mobile-v2:%'",
  );
  await client.query(
    "UPDATE mobile_auth_attempts SET created_at = now() - interval '10 minutes', expires_at = now() - interval '9 minutes', consumed_at = NULL",
  );
  const cronSecret = randomBytes(32).toString('base64url');
  const cron = createMobileCleanupHandler(cronSecret, () => cleanupMobileApiData(db));
  assert.equal((await cron(new Request(`${baseURL}/cleanup`))).status, 401);
  const cleanup = await cron(
    new Request(`${baseURL}/cleanup`, { headers: { authorization: `Bearer ${cronSecret}` } }),
  );
  assert.equal(cleanup.status, 200);
  const deleted = (await cleanup.json()) as { attemptsDeleted: number; bucketsDeleted: number };
  assert.ok(deleted.attemptsDeleted >= 1);
  assert.ok(deleted.bucketsDeleted >= 1);
  const staleId = randomBytes(32).toString('base64url');
  await client.query(
    "INSERT INTO mobile_auth_attempts(id, nonce_hash, verifier_hash, created_at, expires_at) VALUES ($1, $2, $2, now() - interval '10 minutes', now() - interval '9 minutes')",
    [staleId, 'a'.repeat(64)],
  );
  await client.query(
    "INSERT INTO rate_limit(id, key, count, last_request) VALUES ('openfind-mobile-v2:stale', 'openfind-mobile-v2:stale', 1, 0)",
  );
  assert.equal(
    await allowMobileApiRequest(
      db,
      new Request(baseURL, { headers: { 'x-real-ip': '198.51.100.99' } }),
      'start',
      rateSecret,
      true,
      () => true,
    ),
    true,
  );
  assert.equal(
    (await client.query('SELECT id FROM mobile_auth_attempts WHERE id = $1', [staleId])).rows
      .length,
    0,
  );
  assert.equal(
    (await client.query("SELECT id FROM rate_limit WHERE id = 'openfind-mobile-v2:stale'")).rows
      .length,
    0,
  );
  const backlog = createMobileCleanupHandler(cronSecret, async () => ({
    attempts: 5000,
    buckets: 0,
  }));
  assert.equal(
    (
      await backlog(
        new Request(`${baseURL}/cleanup`, { headers: { authorization: `Bearer ${cronSecret}` } }),
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await createMobileCleanupHandler(undefined, async () => ({ attempts: 0, buckets: 0 }))(
        new Request(`${baseURL}/cleanup`),
      )
    ).status,
    503,
  );
  console.log(
    'PASS: isolated backend start, exchange, session, revocation, abuse limits and cleanup',
  );
} finally {
  globalThis.fetch = originalFetch;
  await client.close();
}
