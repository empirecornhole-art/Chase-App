import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

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
  if (!membership) return NextResponse.json({ lastSyncedAt: null, connected: false });

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from('simplefin_connections')
    .select('last_synced_at')
    .eq('household_id', membership.household_id)
    .maybeSingle();

  return NextResponse.json({
    lastSyncedAt: connection?.last_synced_at ?? null,
    connected: !!connection,
  });
}
