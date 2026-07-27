'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdCode, setHouseholdCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/dashboard');
    router.refresh();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !data.user) {
      setLoading(false);
      return setError(signUpError?.message ?? 'Sign up failed');
    }

    let householdId = householdCode.trim();

    if (!householdId) {
      // First member: create a new household
      const { data: household, error: hhError } = await supabase
        .from('households')
        .insert({ name: 'Our Household' })
        .select('id')
        .single();
      if (hhError || !household) {
        setLoading(false);
        return setError(hhError?.message ?? 'Could not create household');
      }
      householdId = household.id;
    }

    const { error: memberError } = await supabase
      .from('household_members')
      .insert({ user_id: data.user.id, household_id: householdId });
    if (memberError) {
      setLoading(false);
      return setError(
        'Account created, but joining the household failed — double check the household code your partner shared.'
      );
    }

    setLoading(false);

    if (!data.session) {
      setNotice(
        `Account created! Check ${email} to confirm your address, then sign in. Your household code is: ${householdId}`
      );
      setMode('signin');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-[0.2em] uppercase text-ledger-muted mb-2">
            Household Budget
          </p>
          <h1 className="font-display text-3xl text-ledger-greenDeep">Two-Week Ledger</h1>
        </div>

        <div className="card p-6">
          <div className="flex gap-4 mb-6 border-b border-ledger-rule text-sm">
            <button
              className={`pb-3 -mb-px border-b-2 ${
                mode === 'signin'
                  ? 'border-ledger-green text-ledger-greenDeep font-medium'
                  : 'border-transparent text-ledger-muted'
              }`}
              onClick={() => setMode('signin')}
            >
              Sign in
            </button>
            <button
              className={`pb-3 -mb-px border-b-2 ${
                mode === 'signup'
                  ? 'border-ledger-green text-ledger-greenDeep font-medium'
                  : 'border-transparent text-ledger-muted'
              }`}
              onClick={() => setMode('signup')}
            >
              Create account
            </button>
          </div>

          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs text-ledger-muted mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-ledger-rule rounded-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ledger-green"
              />
            </div>
            <div>
              <label className="block text-xs text-ledger-muted mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-ledger-rule rounded-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ledger-green"
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-ledger-muted mb-1">
                  Household code <span className="text-ledger-muted">(leave blank if you're first)</span>
                </label>
                <input
                  type="text"
                  value={householdCode}
                  onChange={(e) => setHouseholdCode(e.target.value)}
                  placeholder="Paste the code your partner shared"
                  className="w-full border border-ledger-rule rounded-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ledger-green text-sm"
                />
              </div>
            )}

            {error && <p className="text-sm text-ledger-rust">{error}</p>}
            {notice && <p className="text-sm text-ledger-green">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ledger-greenDeep text-white rounded-sm py-2.5 text-sm font-medium hover:bg-ledger-green transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
