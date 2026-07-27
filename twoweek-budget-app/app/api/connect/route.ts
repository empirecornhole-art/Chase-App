import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { claimSetupToken } from '@/lib/simplefin';

export async function POST(request: NextRequest) {
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
  if (!membership) return NextResponse.json({ error: 'No household found' }, { status: 404 });

  const { setupToken } = await request.json();
  if (!setupToken) return NextResponse.json({ error: 'Missing setup token' }, { status: 400 });

  try {
    const accessUrl = await claimSetupToken(setupToken.trim());
    const admin = createAdminClient();
    const { error } = await admin
      .from('simplefin_connections')
      .upsert(
        { household_id: membership.household_id, access_url: accessUrl },
        { onConflict: 'household_id' }
      );
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Could not connect — the setup token may have already been used.' },
      { status: 400 }
    );
  }
}
