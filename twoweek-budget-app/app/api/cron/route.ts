import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { syncHousehold } from '@/lib/sync';
import { autoCreateNextPeriod } from '@/lib/periods';

// Called automatically once a day by Vercel Cron (see vercel.json).
// Protected by CRON_SECRET so nobody else can trigger it.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Sync transactions for every household with a card connected.
  const { data: connections } = await admin.from('simplefin_connections').select('household_id');
  const syncResults = [];
  for (const h of connections ?? []) {
    const result = await syncHousehold(h.household_id);
    syncResults.push({ household_id: h.household_id, ...result });
  }

  // Auto-start the next budget period for every household whose current one ended.
  const { data: allHouseholds } = await admin.from('households').select('id');
  const periodResults = [];
  for (const h of allHouseholds ?? []) {
    const result = await autoCreateNextPeriod(h.id);
    if (result.created) periodResults.push({ household_id: h.id, ...result });
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    syncResults,
    periodsCreated: periodResults,
  });
}
