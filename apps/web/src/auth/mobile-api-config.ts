import 'server-only';

import { readAuthConfig } from './server';

/** Default off. Mobile bearer material must only be sent over HTTPS. */
export function readMobileApiConfig() {
  if (process.env.OPENFIND_MOBILE_AUTH_ENABLED !== 'true') return null;
  const auth = readAuthConfig();
  const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
  const rateSecret = process.env.MOBILE_AUTH_RATE_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const clientId = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
  if (
    !auth ||
    !auth.baseURL.startsWith('https://') ||
    !clientId.test(auth.clientId) ||
    !androidClientId ||
    !clientId.test(androidClientId) ||
    !rateSecret ||
    rateSecret.length < 32 ||
    rateSecret === auth.secret ||
    !cronSecret ||
    cronSecret.length < 32 ||
    cronSecret === auth.secret ||
    cronSecret === rateSecret
  ) {
    return null;
  }
  return { auth, androidClientId, rateSecret, onVercel: process.env.VERCEL === '1' };
}
