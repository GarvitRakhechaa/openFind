import 'server-only';

import { getDb } from '../db';
import { createAuth } from './factory';

/** Require an explicit canonical origin. Never derive an OAuth callback origin from a request Host header. */
function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production')) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readConfig() {
  const baseURL = configuredOrigin(process.env.BETTER_AUTH_URL);
  const secret = process.env.BETTER_AUTH_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (
    !baseURL ||
    !secret ||
    secret.length < 32 ||
    !clientId ||
    !clientSecret ||
    !databaseUrl ||
    !/^postgres(?:ql)?:\/\//i.test(databaseUrl)
  )
    return null;
  return { baseURL, secret, clientId, clientSecret };
}

export function isAuthConfigured() {
  return readConfig() !== null;
}

/** Returns null when deployment is unconfigured; no credentials or dev bypass are provided. */
export function getAuth() {
  const config = readConfig();
  if (!config) return null;
  return createAuth(getDb(), config);
}
