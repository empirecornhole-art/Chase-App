'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SetupHousehold() {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [householdCode, setHouseholdCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setError(null);
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return setError('Your session expired — try signing in again.');
    }

    const householdId = crypto.randomUUID();

    const { error: hhError } = await supabase
      .from('households')
      .insert({ id: householdId, name: 'Our Household' });

    if (hhError) {
      setLoading(false);
      return setError(hhError.message);
    }

    const { error: memberError } = await supabase
      .from('household_members')
      .insert({ user_id: user.id, household_id: householdId });

    setLoading(false);

    if (memberError) {
      return setError(memberError.message);
    }

    setNotice(`Household created! Share this code with your partner: ${householdId}`);
    setTimeout(() => {
      router.refresh();
    }, 4000);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return setError('Your session expired — try signing in again.');
    }

    const { error: memberError } = await supabase
      .from('household_members')
      .insert({ user_id: user.id, household_id: householdCode.trim() });

    setLoading(false);

    if (memberError) {
      return setError(
        'Could not join that household — double check the code your partner shared.'
      );
    }

    router.refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-[0.2em] uppercase text-ledger-muted mb-2">
            One more step
          </p>
          <h1 className="font-display text-2xl text-ledger-greenDeep">Set up your household</h1>
        </div>

        <div className="card p-6">
          <div className="flex gap-4 mb-6 border-b border-ledger-rule text-sm">
            <button
              className={`pb-3 -mb-px border-b-2 ${
                tab === 'create'
                  ? 'border-ledger-green text-ledger-greenDeep font-medium'
                  : 'border-transparent text-ledger-muted'
              }`}
              onClick={() => setTab('create')}
            >
              I'm first
            </button>
            <button
              className={`pb-3 -mb-px border-b-2 ${
                tab === 'join'
                  ? 'border-ledger-green text-ledger-greenDeep font-medium'
                  : 'border-transparent text-ledger-muted'
              }`}
              onClick={() => setTab('join')}
            >
              Join partner
            </button>
          </div>

          {tab === 'create' ? (
            <div className="space-y-4">
              <p className="text-sm text-ledger-muted">
                Creates a new household. You'll get a code to share with your partner so they can
                join the same budget.
              </p>
              {notice && <p className="text-sm text-ledger-green">{notice}</p>}
              {error && <p className="text-sm text-ledger-rust">{error}</p>}
              {!notice && (
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full bg-ledger-greenDeep text-white rounded-sm py-2.5 text-sm font-medium hover:bg-ledger-green transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating…' : 'Create household'}
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-xs text-ledger-muted mb-1">Household code</label>
                <input
                  type="text"
                  required
                  value={householdCode}
                  onChange={(e) => setHouseholdCode(e.target.value)}
                  placeholder="Paste the code your partner shared"
                  className="w-full border border-ledger-rule rounded-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ledger-green text-sm"
                />
              </div>
              {error && <p className="text-sm text-ledger-rust">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-ledger-greenDeep text-white rounded-sm py-2.5 text-sm font-medium hover:bg-ledger-green transition-colors disabled:opacity-50"
              >
                {loading ? 'Joining…' : 'Join household'}
              </button>
            </form>
          )}

          <button
            onClick={handleSignOut}
            className="w-full text-center text-xs text-ledger-muted hover:text-ledger-ink mt-5"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
