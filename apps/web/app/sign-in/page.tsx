import Link from 'next/link';
import { isAuthConfigured } from '../../src/auth/server';
import SignInButton from './SignInButton';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  const available = isAuthConfigured();
  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        <span className="brand-mark">O</span>
        <span>
          openfind<span className="brand-dot">.</span>
        </span>
      </Link>
      <section className="auth-card" aria-labelledby="sign-in-heading">
        <p className="eyebrow">
          <span className="eyebrow-line" /> OWNER ACCOUNT
        </p>
        <h1 id="sign-in-heading">
          Welcome back<span>.</span>
        </h1>
        <p className="auth-intro">Sign in to your OpenFind account using Google.</p>
        <SignInButton available={available} />
        {!available ? (
          <p className="auth-notice">Sign-in isn’t configured in this environment yet.</p>
        ) : null}
        <p className="auth-footnote">
          OpenFind is in development. Device finding and recovery are not available yet.
        </p>
      </section>
      <Link className="auth-back" href="/">
        ← Back to OpenFind
      </Link>
    </main>
  );
}
