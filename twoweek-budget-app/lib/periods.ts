import { createAdminClient } from '@/lib/supabase/server';
import { nextPeriodDefaults, isoDate } from '@/lib/budget';

// If a household's most recent period has already ended, start the next one
// automatically with the same budget amount, so nobody has to remember to
// set up each new 2-week cycle by hand. Runs daily via cron; also safe to
// call multiple times (won't create duplicates).
export async function autoCreateNextPeriod(householdId: string) {
  const admin = createAdminClient();
  const today = isoDate(new Date());

  const { data: lastPeriod } = await admin
    .from('budget_periods')
    .select('id, start_date, end_date, amount')
    .eq('household_id', householdId)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastPeriod || lastPeriod.end_date >= today) {
    // No periods yet, or the current one hasn't ended — nothing to do.
    return { created: false };
  }

  const { start, end } = nextPeriodDefaults(lastPeriod);

  // Guard against double-creation if this runs more than once for the same day.
  const { data: existing } = await admin
    .from('budget_periods')
    .select('id')
    .eq('household_id', householdId)
    .eq('start_date', start)
    .maybeSingle();

  if (existing) {
    return { created: false };
  }

  const { error } = await admin.from('budget_periods').insert({
    household_id: householdId,
    start_date: start,
    end_date: end,
    amount: lastPeriod.amount,
  });

  return { created: !error, start, end, amount: lastPeriod.amount };
}
