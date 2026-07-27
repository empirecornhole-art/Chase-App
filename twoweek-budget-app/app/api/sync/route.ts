import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAccounts } from '@/lib/simplefin';
import { categorize, DEFAULT_RULES } from '@/lib/categorize';

// Pulls fresh data for the *current signed-in user's* household.
// Used by the "Sync now" button on the dashboard.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No household found for this user' }, { status: 404 });
  }

  const result = await syncHousehold(membership.household_id);
  return NextResponse.json(result);
}

export async function syncHousehold(householdId: string) {
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from('simplefin_connections')
    .select('id, access_url')
    .eq('household_id', householdId)
    .single();

  if (!connection) {
    return { synced: 0, error: 'No SimpleFIN connection set up for this household yet' };
  }

  const { data: customRules } = await admin
    .from('category_rules')
    .select('keyword, category')
    .eq('household_id', householdId);

  const rules = [...(customRules ?? []), ...DEFAULT_RULES];

  const accounts = await fetchAccounts(connection.access_url);

  let synced = 0;
  for (const account of accounts) {
    const rows = account.transactions.map((t) => {
      const amountNum = parseFloat(t.amount);
      // SimpleFIN convention: negative = money out of the account.
      // We store spend as a positive number for simpler budget math.
      const spendAmount = -amountNum;
      const description = t.description || t.payee || 'Unknown';
      return {
        household_id: householdId,
        simplefin_id: t.id,
        posted_at: new Date(t.posted * 1000).toISOString().slice(0, 10),
        amount: spendAmount,
        description,
        merchant: t.payee ?? null,
        category: categorize(description, rules),
        account_name: account.name,
        pending: !!t.pending,
      };
    });

    if (rows.length > 0) {
      const { error } = await admin
        .from('transactions')
        .upsert(rows, { onConflict: 'household_id,simplefin_id' });
      if (!error) synced += rows.length;
    }
  }

  await admin
    .from('simplefin_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', connection.id);

  return { synced };
}
