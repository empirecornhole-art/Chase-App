import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';
import SetupHousehold from './SetupHousehold';
import { autoCreateNextPeriod } from '@/lib/periods';

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return <SetupHousehold />;
  }

  const householdId = membership.household_id;

  // If the most recent period already ended, start the next one automatically
  // (same amount, next 14 days) rather than waiting for tomorrow's cron run.
  await autoCreateNextPeriod(householdId);

  const today = new Date().toISOString().slice(0, 10);

  const { data: periods } = await supabase
    .from('budget_periods')
    .select('id, start_date, end_date, amount')
    .eq('household_id', householdId)
    .order('start_date', { ascending: false });

  const currentPeriod =
    (periods ?? []).find((p) => p.start_date <= today && today <= p.end_date) ??
    (periods ?? [])[0] ??
    null;

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, posted_at, amount, description, merchant, category, pending, excluded')
    .eq('household_id', householdId)
    .order('posted_at', { ascending: false })
    .limit(500);

  const { data: categoryBudgets } = await supabase
    .from('category_budgets')
    .select('id, period_id, category, amount')
    .eq('household_id', householdId);

  return (
    <DashboardClient
      householdId={householdId}
      currentPeriod={currentPeriod}
      allPeriods={periods ?? []}
      transactions={transactions ?? []}
      categoryBudgets={categoryBudgets ?? []}
    />
  );
}
