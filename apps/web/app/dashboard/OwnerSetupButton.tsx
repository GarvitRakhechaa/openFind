'use client';

import { useState } from 'react';

export default function OwnerSetupButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function setup() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/owner/setup', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'x-openfind-action': 'setup' },
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      if (response.status === 401) setError('Your session has expired. Please sign in again.');
      else if (response.status === 409)
        setError('Account setup needs review. No existing account was linked.');
      else if (response.status === 429)
        setError('Too many attempts. Please wait before trying again.');
      else setError('Account setup is temporarily unavailable. Please try again later.');
    } catch {
      setError('Account setup is temporarily unavailable. Please try again later.');
    }
    setLoading(false);
  }
  return (
    <div>
      <button className="auth-button" type="button" disabled={loading} onClick={setup}>
        {loading ? 'Setting up…' : 'Set up account'}
      </button>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
