export interface BudgetPeriod {
  id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  amount: number;
}

export interface Txn {
  id: string;
  posted_at: string;
  amount: number;
  description: string;
  merchant: string | null;
  category: string;
  pending: boolean;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Default next period: 14 days starting the day after the last period ends
// (or today, if there is no previous period).
export function nextPeriodDefaults(lastPeriod?: BudgetPeriod): { start: string; end: string } {
  const start = lastPeriod
    ? new Date(new Date(lastPeriod.end_date + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000)
    : new Date();
  const end = new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000);
  return { start: isoDate(start), end: isoDate(end) };
}

export function periodSpend(txns: Txn[], period: BudgetPeriod): number {
  return txns
    .filter(
      (t) =>
        t.posted_at >= period.start_date &&
        t.posted_at <= period.end_date &&
        t.amount > 0 // positive = money out, per our stored convention
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

export function categoryBreakdown(txns: Txn[], period: BudgetPeriod): { category: string; total: number }[] {
  const inPeriod = txns.filter(
    (t) => t.posted_at >= period.start_date && t.posted_at <= period.end_date && t.amount > 0
  );
  const map = new Map<string, number>();
  for (const t of inPeriod) {
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  return Array.from(map.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}
