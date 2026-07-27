'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage(null);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken: token }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus('error');
        setMessage(data.error);
      } else {
        setStatus('done');
        setMessage('Connected! Head back to the dashboard and hit "Sync now".');
        setToken('');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Try again.');
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 max-w-lg mx-auto">
      <Link href="/dashboard" className="text-xs text-ledger-muted hover:text-ledger-ink">
        ← Back to dashboard
      </Link>
      <h1 className="font-display text-2xl text-ledger-greenDeep mt-3 mb-1">Connect your card</h1>
      <p className="text-sm text-ledger-muted mb-6">
        This uses SimpleFIN Bridge — a read-only connection, it can never move money.
      </p>

      <ol className="text-sm space-y-2 mb-6 list-decimal list-inside text-ledger-ink">
        <li>
          Go to{' '}
          <a
            href="https://bridge.simplefin.org"
            target="_blank"
            rel="noreferrer"
            className="text-ledger-green underline"
          >
            bridge.simplefin.org
          </a>{' '}
          and create an account (~$15/year).
        </li>
        <li>Connect your Chase account through their secure flow.</li>
        <li>Generate a "setup token" — a one-time-use code.</li>
        <li>Paste it below.</li>
      </ol>

      <form onSubmit={handleConnect} className="card p-6 space-y-4">
        <div>
          <label className="block text-xs text-ledger-muted mb-1">Setup token</label>
          <textarea
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={3}
            className="w-full border border-ledger-rule rounded-sm px-3 py-2 text-sm font-mono"
            placeholder="Paste the token from SimpleFIN Bridge"
          />
        </div>
        {message && (
          <p className={`text-sm ${status === 'error' ? 'text-ledger-rust' : 'text-ledger-green'}`}>
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full bg-ledger-greenDeep text-white rounded-sm py-2.5 text-sm font-medium hover:bg-ledger-green transition-colors disabled:opacity-50"
        >
          {status === 'saving' ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </main>
  );
}
