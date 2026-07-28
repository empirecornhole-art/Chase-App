'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  fmtMoney,
  nextPeriodDefaults,
  periodSpend,
  categoryBreakdown,
  isoDate,
  type BudgetPeriod,
  type Txn,
} from '@/lib/budget';
import { DEFAULT_RULES } from '@/lib/categorize';

export default function DashboardClient({
  householdId,
  currentPeriod,
  allPeriods,
  transactions,
}: {
  householdId: string;
  currentPeriod: BudgetPeriod | null;
  allPeriods: BudgetPeriod[];
  transactions: Txn[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncIsError, setSyncIsError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showNewPeriod, setShowNewPeriod] = useState(!currentPeriod);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(
    currentPeriod?.id ?? allPeriods[0]?.id ?? null
  );
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [savingAmount, setSavingAmount] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullActive, setPullActive] = useState(false);
  const [trendMonths, setTrendMonths] = useState<3 | 6>(3);

  useEffect(() => {
    fetch('/api/sync-status')
      .then((r) => r.json())
      .then((d) => {
        setLastSyncedAt(d.lastSyncedAt);
        setConnected(d.connected);
      })
      .catch(() => {});
  }, []);

  // Custom pull-to-refresh — standalone/installed PWAs on iOS Safari don't
  // get the browser's native pull-to-refresh gesture or a visible reload
  // button, so we build a minimal version of both here.
  const touchStartY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const PULL_THRESHOLD = 70;

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      touchStartY.current = window.scrollY === 0 ? e.touches[0].clientY : null;
    }
    function onTouchMove(e: TouchEvent) {
      if (touchStartY.current === null || window.scrollY > 0) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta > 0) {
        const capped = Math.min(delta * 0.5, 100);
        pullRef.current = capped;
        setPullDistance(capped);
        setPullActive(true);
      }
    }
    function onTouchEnd() {
      if (pullRef.current > PULL_THRESHOLD) {
        window.location.reload();
        return;
      }
      pullRef.current = 0;
      touchStartY.current = null;
      setPullDistance(0);
      setPullActive(false);
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Keep the dropdown selection valid whenever the period list changes
  // (e.g. after deleting a period or creating a new one via router.refresh()).
  useEffect(() => {
    const stillExists = allPeriods.some((p) => p.id === selectedPeriodId);
    if (!stillExists) {
      setSelectedPeriodId(currentPeriod?.id ?? allPeriods[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPeriods, currentPeriod]);

  // The period currently being viewed — defaults to today's period, but can
  // be switched to any past or future period via the dropdown below.
  const viewedPeriod = allPeriods.find((p) => p.id === selectedPeriodId) ?? null;
  const today = isoDate(new Date());

  const spend = viewedPeriod ? periodSpend(transactions, viewedPeriod) : 0;
  const remaining = viewedPeriod ? viewedPeriod.amount - spend : 0;
  const pctUsed = viewedPeriod ? Math.min(100, (spend / viewedPeriod.amount) * 100) : 0;
  const overBudget = remaining < 0;
  const breakdown = viewedPeriod ? categoryBreakdown(transactions, viewedPeriod) : [];

  const periodTxns = useMemo(
    () =>
      viewedPeriod
        ? transactions
            .filter((t) => t.posted_at >= viewedPeriod.start_date && t.posted_at <= viewedPeriod.end_date)
            .sort((a, b) => (a.posted_at < b.posted_at ? 1 : -1))
        : [],
    [transactions, viewedPeriod]
  );

  const knownCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.category));
    DEFAULT_RULES.forEach((r) => set.add(r.category));
    set.delete('Uncategorized');
    return Array.from(set).sort();
  }, [transactions]);

  const trendData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - trendMonths);
    const cutoffStr = isoDate(cutoff);

    return allPeriods
      .filter((p) => p.start_date >= cutoffStr)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
      .map((p) => ({
        id: p.id,
        label: formatRange(p.start_date, p.end_date),
        shortLabel: new Date(p.start_date + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
        }),
        budget: p.amount,
        spend: periodSpend(transactions, p),
      }));
  }, [allPeriods, transactions, trendMonths]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setSyncIsError(true);
        setSyncMsg(data.error);
      } else {
        setSyncIsError(false);
        setSyncMsg(`Synced ${data.synced} transactions.`);
        router.refresh();
      }
    } catch {
      setSyncIsError(true);
      setSyncMsg('Sync failed — check your connection and try again.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!viewedPeriod) return;
    setDeleting(true);
    const { error } = await supabase.from('budget_periods').delete().eq('id', viewedPeriod.id);
    setDeleting(false);
    setConfirmingDelete(false);
    if (!error) {
      setSelectedPeriodId(null);
      router.refresh();
    }
  }

  async function handleSaveAmount() {
    if (!viewedPeriod) return;
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount < 0) return;
    setSavingAmount(true);
    const { error } = await supabase
      .from('budget_periods')
      .update({ amount })
      .eq('id', viewedPeriod.id);
    setSavingAmount(false);
    if (!error) {
      setEditingAmount(false);
      router.refresh();
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="min-h-screen pb-16">
      {pullActive && (
        <div
          className="flex items-center justify-center overflow-hidden bg-ledger-bg text-xs text-ledger-muted transition-[height]"
          style={{ height: pullDistance }}
        >
          {pullDistance > PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      <header className="border-b border-ledger-rule bg-ledger-paper">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-ledger-muted">Household Budget</p>
            <h1 className="font-display text-xl text-ledger-greenDeep leading-tight">Two-Week Ledger</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-ledger-muted hover:text-ledger-ink flex items-center gap-1"
              aria-label="Refresh page"
            >
              ↻ Refresh
            </button>
            <button onClick={handleSignOut} className="text-xs text-ledger-muted hover:text-ledger-ink">
              Sign out
            </button>
          </div>
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
        {syncMsg && (
          <p className={`text-xs -mt-4 ${syncIsError ? 'text-ledger-rust' : 'text-ledger-green'}`}>
            {syncMsg}
          </p>
        )}

        {/* Period picker */}
        {allPeriods.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <select
              value={selectedPeriodId ?? ''}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="flex-1 border border-ledger-rule rounded-sm px-3 py-2 text-sm bg-white"
            >
              {allPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatRange(p.start_date, p.end_date)}
                  {p.start_date <= today && today <= p.end_date ? ' (current)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowNewPeriod((s) => !s)}
              className="text-xs text-ledger-green hover:underline whitespace-nowrap"
            >
              {showNewPeriod ? 'Cancel' : '+ New period'}
            </button>
          </div>
        )}

        {/* Period summary */}
        {viewedPeriod ? (
          <section className="card p-6">
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-xs uppercase tracking-wide text-ledger-muted">
                {formatRange(viewedPeriod.start_date, viewedPeriod.end_date)}
              </p>
              {confirmingDelete ? (
                <span className="text-xs flex items-center gap-2">
                  <span className="text-ledger-muted">Delete this period?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-ledger-rust hover:underline font-medium"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="text-ledger-muted hover:underline"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="text-xs text-ledger-muted hover:text-ledger-rust"
                >
                  Delete period
                </button>
              )}
            </div>

            {editingAmount ? (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[11px] uppercase tracking-wide text-ledger-muted">Budget</span>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAmount()}
                  className="border border-ledger-rule rounded-sm px-2 py-1 text-sm w-28 figure"
                />
                <button
                  onClick={handleSaveAmount}
                  disabled={savingAmount}
                  className="text-xs text-ledger-green hover:underline"
                >
                  {savingAmount ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingAmount(false)}
                  className="text-xs text-ledger-muted hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 mt-4">
                <button
                  onClick={() => {
                    setAmountInput(String(viewedPeriod.amount));
                    setEditingAmount(true);
                  }}
                  className="text-left"
                >
                  <Stat label="Budget (tap to edit)" value={fmtMoney(viewedPeriod.amount)} />
                </button>
                <Stat label="Spent" value={fmtMoney(spend)} accent={overBudget ? 'rust' : undefined} />
                <Stat
                  label={overBudget ? 'Over by' : 'Remaining'}
                  value={fmtMoney(Math.abs(remaining))}
                  accent={overBudget ? 'rust' : 'green'}
                />
              </div>
            )}

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
            onCreated={(newId) => {
              setShowNewPeriod(false);
              setSelectedPeriodId(newId);
              router.refresh();
            }}
          />
        )}

        {/* Spend trend */}
        {trendData.length > 1 && (
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-ledger-greenDeep">Spend trend</h2>
              <div className="flex text-xs border border-ledger-rule rounded-sm overflow-hidden">
                <button
                  onClick={() => setTrendMonths(3)}
                  className={`px-2.5 py-1 ${
                    trendMonths === 3 ? 'bg-ledger-greenDeep text-white' : 'bg-white text-ledger-muted'
                  }`}
                >
                  3 months
                </button>
                <button
                  onClick={() => setTrendMonths(6)}
                  className={`px-2.5 py-1 border-l border-ledger-rule ${
                    trendMonths === 6 ? 'bg-ledger-greenDeep text-white' : 'bg-white text-ledger-muted'
                  }`}
                >
                  6 months
                </button>
              </div>
            </div>
            <TrendChart data={trendData} />
            <div className="flex items-center gap-4 mt-3 text-[11px] text-ledger-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-ledger-muted" style={{ borderTop: '1px dashed' }} />
                Budget
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-ledger-green" />
                Spend (under budget)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-ledger-rust" />
                Spend (over budget)
              </span>
            </div>
          </section>
        )}

        {/* Category breakdown */}
        {viewedPeriod && breakdown.length > 0 && (
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

        {/* Transactions for the viewed period */}
        {viewedPeriod && (
          <section className="card p-6">
            <h2 className="font-display text-lg text-ledger-greenDeep mb-4">
              Transactions this period
              {periodTxns.length > 0 && (
                <span className="text-xs font-body font-normal text-ledger-muted ml-2">
                  ({periodTxns.length})
                </span>
              )}
            </h2>
            {periodTxns.length === 0 ? (
              <p className="text-sm text-ledger-muted">
                Nothing synced for this period yet. Try "Sync now" above.
              </p>
            ) : (
              <div className="divide-y divide-ledger-rule max-h-[360px] overflow-y-auto pr-1">
                {periodTxns.map((t) => (
                  <TransactionRow
                    key={t.id}
                    txn={t}
                    supabase={supabase}
                    householdId={householdId}
                    knownCategories={knownCategories}
                    onSaved={() => router.refresh()}
                  />
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

function TransactionRow({
  txn,
  supabase,
  householdId,
  knownCategories,
  onSaved,
}: {
  txn: Txn;
  supabase: ReturnType<typeof createClient>;
  householdId: string;
  knownCategories: string[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [remember, setRemember] = useState(true);
  const [saving, setSaving] = useState(false);

  async function saveCategory(category: string) {
    const trimmed = category.trim();
    if (!trimmed) return;
    setSaving(true);

    await supabase.from('transactions').update({ category: trimmed }).eq('id', txn.id);

    // Optionally remember this so future purchases from the same merchant
    // get auto-categorized the same way next sync.
    const keyword = (txn.merchant || txn.description).toLowerCase().slice(0, 60);
    if (remember && keyword) {
      await supabase
        .from('category_rules')
        .upsert(
          { household_id: householdId, keyword, category: trimmed },
          { onConflict: 'household_id,keyword' }
        );
    }

    setSaving(false);
    setEditing(false);
    setAddingNew(false);
    setNewCategory('');
    onSaved();
  }

  return (
    <div className="py-2.5 flex items-center justify-between text-sm gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate">{txn.description}</p>

        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-ledger-muted hover:text-ledger-green underline decoration-dotted"
          >
            {txn.category}
            {txn.pending ? ' · pending' : ''} · {txn.posted_at}
          </button>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {!addingNew ? (
              <select
                autoFocus
                defaultValue=""
                disabled={saving}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setAddingNew(true);
                  } else if (e.target.value) {
                    saveCategory(e.target.value);
                  }
                }}
                className="border border-ledger-rule rounded-sm px-2 py-1 text-xs bg-white"
              >
                <option value="" disabled>
                  Choose category…
                </option>
                {knownCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__new__">+ New category…</option>
              </select>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveCategory(newCategory);
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                  className="border border-ledger-rule rounded-sm px-2 py-1 text-xs w-36"
                />
                <button
                  type="submit"
                  disabled={saving || !newCategory.trim()}
                  className="text-xs text-ledger-green hover:underline disabled:opacity-50"
                >
                  Save
                </button>
              </form>
            )}

            <label className="flex items-center gap-1.5 text-[11px] text-ledger-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3 w-3"
              />
              Remember for future "{txn.merchant || txn.description}" purchases
            </label>

            <button
              onClick={() => {
                setEditing(false);
                setAddingNew(false);
              }}
              className="text-[11px] text-ledger-muted hover:underline block"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <span className="figure ml-3 shrink-0">{fmtMoney(txn.amount)}</span>
    </div>
  );
}

function TrendChart({
  data,
}: {
  data: { id: string; label: string; shortLabel: string; budget: number; spend: number }[];
}) {
  const width = 640;
  const height = 220;
  const padLeft = 48;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal = Math.max(...data.map((d) => Math.max(d.budget, d.spend)), 1) * 1.1;

  const x = (i: number) => padLeft + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / maxVal) * innerH;

  const budgetPoints = data.map((d, i) => `${x(i)},${y(d.budget)}`).join(' ');
  const spendPoints = data.map((d, i) => `${x(i)},${y(d.spend)}`).join(' ');

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => maxVal * f);
  // Show every label if few points, else thin them out so they don't overlap.
  const labelEvery = data.length > 8 ? Math.ceil(data.length / 6) : 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Spend vs budget trend">
      {gridLines.map((v) => (
        <g key={v}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={y(v)}
            y2={y(v)}
            stroke="#DAD5C7"
            strokeWidth={1}
          />
          <text x={padLeft - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#7A7A6E">
            {fmtMoney(v).replace('.00', '')}
          </text>
        </g>
      ))}

      <polyline
        points={budgetPoints}
        fill="none"
        stroke="#7A7A6E"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <polyline points={spendPoints} fill="none" stroke="#2F5D45" strokeWidth={2} />

      {data.map((d, i) => (
        <circle
          key={d.id}
          cx={x(i)}
          cy={y(d.spend)}
          r={3.5}
          fill={d.spend > d.budget ? '#B5502F' : '#2F5D45'}
        >
          <title>
            {d.label}: {fmtMoney(d.spend)} spent of {fmtMoney(d.budget)} budgeted
          </title>
        </circle>
      ))}

      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text
            key={d.id}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize={9}
            fill="#7A7A6E"
          >
            {d.shortLabel}
          </text>
        ) : null
      )}
    </svg>
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
  onCreated: (newId: string) => void;
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

    const newId = crypto.randomUUID();
    const { error: insertError } = await supabase.from('budget_periods').insert({
      id: newId,
      household_id: membership.household_id,
      start_date: start,
      end_date: end,
      amount: parseFloat(amount),
      created_by: user?.id,
    });

    setSaving(false);
    if (insertError) return setError(insertError.message);
    onCreated(newId);
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
