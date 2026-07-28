import { createAdminClient } from './supabase/server';
import { fmtMoney, isoDate } from './budget';
import { sendPushToHousehold } from './push';

export async function checkAndSendBudgetAlerts(householdId: string) {
  const admin = createAdminClient();
  const today = isoDate(new Date());

  const { data: period } = await admin
    .from('budget_periods')
    .select('id, start_date, end_date, amount, heads_up_notified, over_budget_notified')
    .eq('household_id', householdId)
    .lte('start_date', today)
    .gte('end_date', today)
    .maybeSingle();

  if (!period) return;

  const { data: txns } = await admin
    .from('transactions')
    .select('amount, excluded')
    .eq('household_id', householdId)
    .gte('posted_at', period.start_date)
    .lte('posted_at', period.end_date);

  const spend = (txns ?? [])
    .filter((t) => t.amount > 0 && !t.excluded)
    .reduce((sum, t) => sum + t.amount, 0);

  const pctUsed = (spend / period.amount) * 100;
  const end = new Date(period.end_date + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  const daysRemaining = Math.round((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (spend > period.amount && !period.over_budget_notified) {
    await sendPushToHousehold(householdId, {
      title: 'Over budget',
      body: `You've spent ${fmtMoney(spend)} of your ${fmtMoney(period.amount)} budget for this period.`,
    });
    await admin.from('budget_periods').update({ over_budget_notified: true }).eq('id', period.id);
  } else if (pctUsed >= 80 && daysRemaining >= 3 && !period.heads_up_notified) {
    await sendPushToHousehold(householdId, {
      title: 'Budget heads up',
      body: `You've used ${Math.round(pctUsed)}% of your budget with ${daysRemaining} days left in this period.`,
    });
    await admin.from('budget_periods').update({ heads_up_notified: true }).eq('id', period.id);
  }
}
