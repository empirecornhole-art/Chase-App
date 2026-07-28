import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncHousehold } from '@/lib/sync';
import { checkAndSendBudgetAlerts } from '@/lib/notifications';

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
  await checkAndSendBudgetAlerts(membership.household_id);
  return NextResponse.json(result);
}
