import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { syncHousehold } from '@/lib/sync';

// Called automatically once a day by Vercel Cron (see vercel.json).
// Protected by CRON_SECRET so nobody else can trigger it.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: households } = await admin.from('simplefin_connections').select('household_id');

  const results = [];
  for (const h of households ?? []) {
    const result = await syncHousehold(h.household_id);
    results.push({ household_id: h.household_id, ...result });
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}
