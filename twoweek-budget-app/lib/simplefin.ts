// Minimal client for the SimpleFIN protocol (https://www.simplefin.org/protocol.html)
// SimpleFIN Bridge (bridge.simplefin.org) is the $15/year service that connects to
// Chase (and most other US banks) and exposes a simple, read-only HTTP API.

export interface SimpleFinTransaction {
  id: string;
  posted: number; // unix timestamp (seconds)
  amount: string; // negative = money out, per SimpleFIN spec
  description: string;
  payee?: string;
  pending?: boolean;
}

export interface SimpleFinAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  transactions: SimpleFinTransaction[];
}

/**
 * One-time step: exchange the setup token (from your SimpleFIN Bridge dashboard)
 * for a durable access URL. The access URL has the form
 * https://username:password@bridge.simplefin.org/simplefin
 * and must be stored securely — it is a bearer credential.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  const claimUrl = Buffer.from(setupToken, 'base64').toString('utf-8');

  const res = await fetch(claimUrl, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`SimpleFIN claim failed: ${res.status} ${await res.text()}`);
  }
  const accessUrl = (await res.text()).trim();
  if (!accessUrl.startsWith('http')) {
    throw new Error('SimpleFIN claim did not return a valid access URL');
  }
  return accessUrl;
}

/**
 * Fetch accounts + transactions using a stored access URL.
 * startDate limits how far back to pull (defaults to 35 days, enough to
 * safely cover the current + previous 2-week period without re-pulling everything).
 */
export async function fetchAccounts(
  accessUrl: string,
  startDate?: Date
): Promise<SimpleFinAccount[]> {
  const url = new URL(accessUrl);
  const auth = Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString(
    'base64'
  );
  url.username = '';
  url.password = '';

  const start = startDate ?? new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
  const endpoint = `${url.origin}${url.pathname}/accounts?start-date=${Math.floor(
    start.getTime() / 1000
  )}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    throw new Error(`SimpleFIN fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.accounts as SimpleFinAccount[];
}
