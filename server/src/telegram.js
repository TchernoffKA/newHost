import crypto from 'node:crypto';

// Verify Telegram WebApp initData per https://core.telegram.org/bots/webapps#auth-data
export function verifyInitData(initDataRaw, botToken = process.env.TELEGRAM_BOT_TOKEN) {
  if (!initDataRaw || typeof initDataRaw !== 'string') return null;
  const urlParams = new URLSearchParams(initDataRaw);
  const dataCheckString = [...urlParams]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${key}=${val}`)
    .join('\n');
  const hash = urlParams.get('hash');
  if (!hash) return null;

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (hmac !== hash) return null;

  // Parse user JSON if present
  const userStr = urlParams.get('user');
  let user = null;
  try { user = userStr ? JSON.parse(userStr) : null; } catch { user = null; }
  const authDate = Number(urlParams.get('auth_date') || 0);
  const queryId = urlParams.get('query_id') || null;

  return { user, authDate, queryId };
}


