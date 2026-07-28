import webpush from 'web-push';
import { createAdminClient } from './supabase/server';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    'mailto:budget-app@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export async function sendPushToHousehold(
  householdId: string,
  payload: { title: string; body: string }
) {
  ensureConfigured();
  const admin = createAdminClient();

  const { data: members } = await admin
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId);
  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      // 404/410 means the subscription is no longer valid (uninstalled, permission revoked) — clean it up.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
}
