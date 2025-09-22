import express from 'express';
import { issueJwtFromTelegram, getGoogleAuthorizationUrl, handleGoogleCallback } from './auth.js';

export const authRouter = express.Router();

// Выдача JWT по Telegram initData (в body.init_data или заголовке x-telegram-init-data)
authRouter.post('/telegram', async (req, res) => {
  const initData = req.body?.init_data || req.header('x-telegram-init-data') || req.query.init_data;
  try {
    const result = await issueJwtFromTelegram(initData);
    if (!result) return res.status(401).json({ error: 'Invalid Telegram initData' });
    res.json({ token: result.token, user: sanitizeUser(result.user) });
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', details: String(e?.message || e) });
  }
});

// START Google OAuth (optional, будет работать после настройки env и миграции)
authRouter.get('/google', async (req, res) => {
  try {
    const state = req.query.state || undefined;
    const { url, state: finalState } = await getGoogleAuthorizationUrl(state);
    res.json({ url, state: finalState });
  } catch (e) {
    res.status(500).json({ error: 'OAuth init failed', details: String(e?.message || e) });
  }
});

// Google OAuth callback (optional)
authRouter.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const result = await handleGoogleCallback({ code, state });
    res.json({ token: result.token, user: sanitizeUser(result.user) });
  } catch (e) {
    res.status(400).json({ error: 'OAuth callback failed', details: String(e?.message || e) });
  }
});

function sanitizeUser(user) {
  if (!user) return null;
  const { id, username, first_name, last_name, email, avatar_url, system_role } = user;
  return { id, username, first_name, last_name, email, avatar_url, system_role };
}


