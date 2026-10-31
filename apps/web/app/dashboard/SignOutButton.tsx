'use client';

import { useState } from 'react';
import { authClient } from '../../src/auth/client';

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setLoading(true);
    setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed');
      window.location.assign('/sign-in');
    } catch {
      setError('Unable to sign out. Please try again.');
      setLoading(false);
    }
  }
  return (
    <div>
      <button className="auth-logout" onClick={signOut} disabled={loading} type="button">
        {loading ? 'Signing out…' : 'Sign out'}
      </button>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
