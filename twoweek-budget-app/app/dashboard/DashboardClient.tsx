'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  fmtMoney,
  nextPeriodDefaults,
  periodSpend,
  categoryBreakdown,
  type BudgetPeriod,
  type Txn,
} from '@/lib/budget';

export default function DashboardClient({
  currentPeriod,
  allPeriods,
  transactions,
}: {
  currentPeriod: BudgetPeriod | null;
  allPeriods: BudgetPeriod[];
  transactions: Txn[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showNewPeriod, setShowNewPeriod] = useState(!currentPeriod);

  useEffect(() => {
    fetch('/api/sync-status')
      .then((r) => r.json())
      .then((d) => {
        setLastSyncedAt(d.lastSyncedAt);
        setConnected(d.connected);
      })
      .catch(() => {});
  }, []);

  const spend = currentPeriod ? periodSpend(transactions, currentPeriod) : 0;
  const remaining = currentPeriod ? currentPeriod.amount - spend : 0;
  const pctUsed = currentPeriod ? Math.min(100, (spend / currentPeriod.amount) * 100) : 0;
  const overBudget = remaining < 0;
  const breakdown = currentPeriod ? categoryBreakdown(transactions, currentPeriod) : [];

  const periodTxns = useMemo(
    () =>
      currentPeriod
        ? transactions
            .filter((t) => t.posted_at >= currentPeriod.start_date && t.posted_at <= currentPeriod.end_date)
            .sort((a, b) => (a.posted_at < b.posted_at ? 1 : -1))
        : [],
    [transactions, currentPeriod]
  );

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setSyncMsg(data.error);
      } else {
        setSyncMsg(`Synced ${data.synced} transactions.`);
        router.refresh();
      }
    } catch {
      setSyncMsg('Sync failed — check your connection and try again.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="min-h-screen pb-16">
      <header className="border-b border-ledger-rule bg-ledger-paper">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-ledger-muted">Household Budget</p>
            <h1 className="font-display text-xl text-ledger-greenDeep leading-tight">Two-Week Ledger</h1>
          </div>
          <button onClick={handleSignOut} className="text-xs text-ledger-muted hover:text-ledger-ink">
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 mt-6 space-y-6">
        {/* Sync bar */}
        <div className="flex items-center justify-between text-xs text-ledger-muted">
          <span>
            {connected === false ? (
              <>
                No card connected yet —{' '}
                <a href="/settings" className="text-ledger-green underline">
                  connect it
                </a>
              </>
            ) : lastSyncedAt ? (
              `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
            ) : (
              'Not synced yet'
            )}
          </span>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="border border-ledger-rule rounded-sm px-3 py-1.5 bg-white hover:border-ledger-green transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {syncMsg && <p className="text-xs text-ledger-rust -mt-4">{syncMsg}</p>}

        {/* Current period summary */}
        {currentPeriod ? (
          <section className="card p-6">
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-xs uppercase tracking-wide text-ledger-muted">
                {formatRange(currentPeriod.start_date, currentPeriod.end_date)}
              </p>
              <button
                onClick={() => setShowNewPeriod((s) => !s)}
                className="text-xs text-ledger-green hover:underline"
              >
                {showNewPeriod ? 'Cancel' : 'Start new period'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <Stat label="Budget" value={fmtMoney(currentPeriod.amount)} />
              <Stat label="Spent" value={fmtMoney(spend)} accent={overBudget ? 'rust' : undefined} />
              <Stat
                label={overBudget ? 'Over by' : 'Remaining'}
                value={fmtMoney(Math.abs(remaining))}
                accent={overBudget ? 'rust' : 'green'}
              />
            </div>

            <div className="mt-5 h-2 rounded-full bg-ledger-rule overflow-hidden">
              <div
                className={`h-full ${overBudget ? 'bg-ledger-rust' : 'bg-ledger-green'}`}
                style={{ width: `${pctUsed}%` }}
              />
            </div>
          </section>
        ) : (
          <section className="card p-6 text-center">
            <p className="text-sm text-ledger-muted mb-3">No budget period set up yet.</p>
          </section>
        )}

        {showNewPeriod && (
          <NewPeriodForm
            supabase={supabase}
            lastPeriod={allPeriods[0]}
            onCreated={() => {
              setShowNewPeriod(false);
              router.refresh();
            }}
          />
        )}

        {/* Category breakdown */}
        {currentPeriod && breakdown.length > 0 && (
          <section className="card p-6">
            <h2 className="font-display text-lg text-ledger-greenDeep mb-4">By category</h2>
            <div className="space-y-3">
              {breakdown.map((b) => (
                <div key={b.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{b.category}</span>
                    <span className="figure">{fmtMoney(b.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ledger-rule overflow-hidden">
                    <div
                      className="h-full bg-ledger-gold"
                      style={{ width: `${(b.total / breakdown[0].total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent transactions */}
        {currentPeriod && (
          <section className="card p-6">
            <h2 className="font-display text-lg text-ledger-greenDeep mb-4">
              Transactions this period
            </h2>
            {periodTxns.length === 0 ? (
              <p className="text-sm text-ledger-muted">
                Nothing synced for this period yet. Try "Sync now" above.
              </p>
            ) : (
              <div className="divide-y divide-ledger-rule">
                {periodTxns.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{t.description}</p>
                      <p className="text-xs text-ledger-muted">
                        {t.category}
                        {t.pending ? ' · pending' : ''} · {t.posted_at}
                      </p>
                    </div>
                    <span className="figure ml-3 shrink-0">{fmtMoney(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Export */}
        <section className="card p-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-ledger-greenDeep">Budget history</h2>
            <p className="text-xs text-ledger-muted mt-1">
              Every period's budget vs. actual spend, as a spreadsheet.
            </p>
          </div>
          <a
            href="/api/export"
            className="border border-ledger-rule rounded-sm px-3 py-1.5 text-sm bg-white hover:border-ledger-green transition-colors"
          >
            Export CSV
          </a>
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'rust' | 'green';
}) {
  const color =
    accent === 'rust' ? 'text-ledger-rust' : accent === 'green' ? 'text-ledger-green' : 'text-ledger-ink';
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ledger-muted mb-1">{label}</p>
      <p className={`figure text-xl ${color}`}>{value}</p>
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
}

function NewPeriodForm({
  supabase,
  lastPeriod,
  onCreated,
}: {
  supabase: ReturnType<typeof createClient>;
  lastPeriod?: BudgetPeriod;
  onCreated: () => void;
}) {
  const defaults = nextPeriodDefaults(lastPeriod);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [amount, setAmount] = useState(lastPeriod ? String(lastPeriod.amount) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user?.id)
      .single();

    if (!membership) {
      setSaving(false);
      return setError('Could not find your household.');
    }

    const { error: insertError } = await supabase.from('budget_periods').insert({
      household_id: membership.household_id,
      start_date: start,
      end_date: end,
      amount: parseFloat(amount),
      created_by: user?.id,
    });

    setSaving(false);
    if (insertError) return setError(insertError.message);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <h2 className="font-display text-lg text-ledger-greenDeep">New budget period</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-ledger-muted mb-1">Start date</label>
          <input
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full border border-ledger-rule rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ledger-muted mb-1">End date</label>
          <input
            type="date"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full border border-ledger-rule rounded-sm px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-ledger-muted mb-1">Budget amount</label>
        <input
          type="number"
          step="0.01"
          min="0"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full border border-ledger-rule rounded-sm px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-ledger-rust">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full bg-ledger-greenDeep text-white rounded-sm py-2.5 text-sm font-medium hover:bg-ledger-green transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save period'}
      </button>
    </form>
  );
}
