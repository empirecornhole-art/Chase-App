import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  const { data: txns } = await supabase
    .from('transactions')
    .select('posted_at, description, merchant, category, amount, pending, excluded')
    .eq('household_id', membership.household_id)
    .order('posted_at', { ascending: false });

  const rows: string[] = [];
  rows.push(
    ['Date', 'Description', 'Merchant', 'Category', 'Amount', 'Pending', 'Excluded from budget']
      .map(csvEscape)
      .join(',')
  );

  for (const t of txns ?? []) {
    rows.push(
      [
        t.posted_at,
        t.description,
        t.merchant ?? '',
        t.category,
        t.amount.toFixed(2),
        t.pending ? 'Yes' : 'No',
        t.excluded ? 'Yes' : 'No',
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="transactions-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
