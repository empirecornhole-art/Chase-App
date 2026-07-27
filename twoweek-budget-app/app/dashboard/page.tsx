import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';

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
    return (
      <main className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl mb-2">No household found</h1>
          <p className="text-ledger-muted text-sm">
            Something went wrong linking your account to a household. Try signing out and back in.
          </p>
        </div>
      </main>
    );
  }

  const householdId = membership.household_id;
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
    .select('id, posted_at, amount, description, merchant, category, pending')
    .eq('household_id', householdId)
    .order('posted_at', { ascending: false })
    .limit(500);

  return (
    <DashboardClient
      currentPeriod={currentPeriod}
      allPeriods={periods ?? []}
      transactions={transactions ?? []}
    />
  );
}
