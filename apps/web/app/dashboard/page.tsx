import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '../../src/auth/server';
import SignOutButton from './SignOutButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const auth = getAuth();
  if (!auth) redirect('/sign-in');

  let session;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>
            Temporarily unavailable<span>.</span>
          </h1>
          <p className="auth-intro">
            We couldn&apos;t verify your session. Please try again later.
          </p>
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
        <div className="dashboard-notice">
          <strong>No devices to show yet.</strong>
          <p>Device registration, locations and recovery have not been implemented.</p>
        </div>
      </section>
    </main>
  );
}
