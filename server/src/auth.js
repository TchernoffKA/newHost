import { verifyInitData } from './telegram.js';
import { upsertTelegramUser } from './users.js';

const INITDATA_MAX_AGE_SEC = Number(process.env.TG_INITDATA_MAX_AGE_SEC || 24 * 60 * 60);

export async function authMiddleware(req, res, next) {
  const initData = req.header('x-telegram-init-data') || req.query.init_data;
  if (!initData) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const verified = verifyInitData(initData);
  if (!verified || !verified.user) {
    return res.status(401).json({ error: 'Invalid Telegram initData' });
  }

  if (verified.authDate && Math.abs(Date.now() / 1000 - Number(verified.authDate)) > INITDATA_MAX_AGE_SEC) {
    return res.status(401).json({ error: 'InitData expired' });
  }

  try {
    const user = await upsertTelegramUser(verified.user);
    req.user = user;
    return next();
  } catch (e) {
    return res.status(500).json({ error: 'Auth failed', details: String(e?.message || e) });
  }
}


