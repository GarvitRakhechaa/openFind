import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '../../src/auth/server';
import { resolveMappedOwner } from '../../src/auth/owner';
import { listOwnedDevicesCandidate } from '../../src/auth/owned-devices';
import { getDb } from '../../src/db';
import OwnerSetupButton from './OwnerSetupButton';
import SignOutButton from './SignOutButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const auth = getAuth();
  if (!auth) redirect('/sign-in');
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  let mapped = false;
  let deviceList: Awaited<ReturnType<typeof listOwnedDevicesCandidate>> = null;
  try {
    const requestHeaders = await headers();
    session = await auth.api.getSession({ headers: requestHeaders });
    if (session) {
      const db = getDb();
      mapped = Boolean(await resolveMappedOwner(auth, db, requestHeaders));
      if (mapped) {
        deviceList = await listOwnedDevicesCandidate(auth, db, requestHeaders);
        if (!deviceList) session = null;
      }
    }
  } catch {
    // Fail closed, without logging database errors or rendering private content.
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>
            Temporarily unavailable<span>.</span>
          </h1>
          <p className="auth-intro">We couldn’t load your dashboard. Please try again later.</p>
          <Link className="auth-back" href="/">
            Back to OpenFind
          </Link>
        </section>
      </main>
    );
  }
  if (!session) redirect('/sign-in');
  return (
    <main className="auth-page dashboard-page">
      <header className="dashboard-header">
        <Link className="brand" href="/">
          <span className="brand-mark">O</span>
          <span>
            openfind<span className="brand-dot">.</span>
          </span>
        </Link>
        <SignOutButton />
      </header>
      <section className="auth-card" aria-labelledby="dashboard-heading">
        <p className="eyebrow">
          <span className="eyebrow-line" /> OWNER DASHBOARD
        </p>
        <h1 id="dashboard-heading">
          You&apos;re signed in<span>.</span>
        </h1>
        <p className="auth-intro">{session.user.email}</p>
        {!mapped ? (
          <div className="dashboard-notice">
            <strong>Set up your OpenFind account.</strong>
            <p>
              Link this sign-in to a new OpenFind account. Existing unmatched accounts are never
              linked automatically.
            </p>
            <OwnerSetupButton />
          </div>
        ) : (
          <div className="dashboard-notice">
            <strong>
              {deviceList?.devices.length ? 'Your devices' : 'No devices to show yet.'}
            </strong>
            {deviceList?.devices.length ? (
              <ul>
                {deviceList.devices.map((device) => (
                  <li key={device.id}>
                    {device.displayName} — {device.enrollmentStatus}, {device.lostStatus}
                  </li>
                ))}
              </ul>
            ) : null}
            {deviceList?.hasMore ? <p>Only the first 100 devices are shown.</p> : null}
            <p>Device registration, locations and recovery have not been implemented.</p>
          </div>
        )}
      </section>
    </main>
  );
}
