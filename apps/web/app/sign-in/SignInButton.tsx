'use client';

import { useState } from 'react';
import { authClient } from '../../src/auth/client';

export default function SignInButton({ available }: { available: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setLoading(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
      });
      if (result.error) {
        setError('Unable to sign in. Please try again later.');
        setLoading(false);
      }
    } catch {
      setError('Unable to sign in. Please try again later.');
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="auth-button"
        type="button"
        onClick={signIn}
        disabled={!available || loading}
      >
        {loading ? 'Connecting…' : 'Continue with Google'}
      </button>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
