import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { periodSpend, fmtMoney, type BudgetPeriod, type Txn } from '@/lib/budget';

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();
  if (!membership) return NextResponse.json({ error: 'No household' }, { status: 404 });

  const { data: periods } = await supabase
    .from('budget_periods')
    .select('id, start_date, end_date, amount')
    .eq('household_id', membership.household_id)
    .order('start_date', { ascending: true });

  const { data: txns } = await supabase
    .from('transactions')
    .select('id, posted_at, amount, description, merchant, category, pending')
    .eq('household_id', membership.household_id);

  const rows: string[] = [];
  rows.push(
    ['Period Start', 'Period End', 'Budget', 'Actual Spend', 'Difference', 'Status']
      .map(csvEscape)
      .join(',')
  );

  for (const period of (periods ?? []) as BudgetPeriod[]) {
    const spend = periodSpend((txns ?? []) as Txn[], period);
    const diff = period.amount - spend; // positive = under budget, negative = over
    const status = diff >= 0 ? 'Under budget' : 'Over budget';
    rows.push(
      [
        period.start_date,
        period.end_date,
        period.amount.toFixed(2),
        spend.toFixed(2),
        diff.toFixed(2),
        status,
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="budget-history-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
