import crypto from 'crypto';

// Верификация initData по спецификации Telegram Mini Apps
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app

export function parseInitData(initDataRaw) {
  const pairs = new URLSearchParams(initDataRaw);
  const data = {};
  for (const [key, value] of pairs) {
    data[key] = value;
  }
  return data;
}

export function buildDataCheckString(dataObj) {
  const entries = Object.entries(dataObj)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return entries.join('\n');
}

export function validateInitData(initDataRaw, botToken) {
  if (!initDataRaw || !botToken) return { ok: false, reason: 'missing' };
  const data = parseInitData(initDataRaw);
  const { hash } = data;
  if (!hash) return { ok: false, reason: 'no-hash' };

  const checkString = buildDataCheckString(data);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const ok = crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash));
  return { ok, data };
}


