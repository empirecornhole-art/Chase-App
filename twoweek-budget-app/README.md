# Two-Week Ledger

A shared budgeting dashboard for you and your partner: set a spend limit for a
2-week period, connect your Chase card, and see spend / remaining / category
breakdown update automatically. Works as an installable web app on iPhone,
Android, Mac, and Windows (no app store needed).

## How it works

- **Data source:** [SimpleFIN Bridge](https://bridge.simplefin.org) (~$15/year) — a
  read-only connection to Chase and most other US banks. It cannot move money.
- **Refresh:** SimpleFIN refreshes daily, and Chase itself can take 1–3 days to
  post pending charges — so this is "auto-updating daily," not instant. There's
  a manual "Sync now" button for on-demand pulls, plus an automatic daily sync
  via Vercel Cron.
- **Categorization:** rule-based keyword matching (see `lib/categorize.ts`),
  editable per household via the `category_rules` table.
- **Sharing:** you and your partner each get your own login, both scoped to
  the same household via a shared household ID.
- **Export:** `/api/export` downloads a CSV with one row per budget period —
  budget, actual spend, difference, and over/under status — for Excel/Sheets/Numbers.

---

## 1. Supabase setup

1. Create a new Supabase project (you said you already have an account — just
   spin up a new project for this app).
2. Go to **SQL Editor > New query**, paste in the entire contents of
   `supabase/schema.sql`, and run it. This creates all tables and security
   policies.
3. Go to **Project Settings > API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret —
     never put it in client-side code; this project only uses it in server
     API routes, which is correct)
4. Go to **Authentication > Providers** and make sure Email is enabled. For a
   2-person personal app, you can also turn off "Confirm email" under
   **Authentication > Settings** if you'd rather skip the verification email step.

## 2. SimpleFIN setup

1. Go to [bridge.simplefin.org](https://bridge.simplefin.org) and create an account.
2. Connect your Chase card through their secure linking flow.
3. Generate a **setup token** (one-time-use code).
4. Keep this for step 4 below — you'll paste it into the app itself, not into
   an env variable, since it needs to be claimed once via SimpleFIN's API.

## 3. Deploy to Vercel

1. Push this project to a GitHub repo (or drag-and-drop deploy via Vercel CLI).
2. In Vercel, import the project.
3. Under **Settings > Environment Variables**, add everything from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` — make up any random string (e.g. run `openssl rand -hex 16`)
4. Deploy. Vercel will automatically pick up `vercel.json`, which schedules
   `/api/cron` to run once daily (13:00 UTC by default — edit the cron
   schedule in `vercel.json` if you want a different time).

## 4. Push notifications (optional)

Two-Week Ledger can send a push notification straight to your phone when:
- You've used 80% of your budget with 3+ days still left in the period ("heads up")
- You go over budget

**Important iOS limitation:** push notifications on iPhone only work if the app is
installed to your Home Screen (Add to Home Screen) — they will **not** work if you
just open the site in a regular Safari tab. Android/Chrome doesn't have this
restriction.

**Setup:**
1. Add the two VAPID keys from `.env.example` to your Vercel environment
   variables (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`) — these
   were generated specifically for this app and are ready to use as-is, no
   need to generate your own.
2. Deploy.
3. On each phone, open the app (from the Home Screen icon on iPhone) and tap
   **"🔕 Enable alerts"** in the top-right of the dashboard. Your browser will
   ask for notification permission — allow it.
4. That's it — alerts check automatically once a day (same daily cron as
   syncing) and also right after you hit "Sync now."

Each phone/browser that taps "Enable alerts" gets its own subscription, so
both of you can turn this on independently on your own devices.

## 5. First-time app setup

1. Visit your deployed app → **Create account** tab. Leave "household code"
   blank — this makes you the first member and creates a household.
2. After signup, you'll see a message with your **household code** — copy it.
3. Have your partner sign up too, pasting that household code in during
   their signup. Now you're both looking at the same data.
4. Go to **Settings** (linked from the dashboard) and paste in the SimpleFIN
   setup token from step 2 above to connect your Chase card.
5. Back on the dashboard, hit **Sync now**, then **Start new period** to set
   your first 2-week budget amount.

That's it — from here it auto-syncs daily, and either of you can adjust the
budget amount each period or hit Sync now anytime.

## Notes / things you may want to tweak

- **Categories:** starter keyword rules live in `lib/categorize.ts`. Add more
  as you notice "Uncategorized" transactions — either edit that file and
  redeploy, or insert rows into the `category_rules` table directly via
  Supabase's table editor (household members can manage their own rules).
- **Local development:** copy `.env.example` to `.env.local`, fill it in, run
  `npm install` then `npm run dev`.
- **PWA install:** open the deployed URL in Safari (iPhone) or Chrome
  (Android/desktop) and use "Add to Home Screen" / "Install app" — the
  `manifest.json` and icons are already set up for this.
