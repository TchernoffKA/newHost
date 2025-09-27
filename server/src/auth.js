import jwt from 'jsonwebtoken';
import { verifyInitData } from './telegram.js';
import { upsertTelegramUser, upsertEmailUser } from './users.js';
import { Issuer } from 'openid-client';
import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const INITDATA_MAX_AGE_SEC = Number(process.env.TG_INITDATA_MAX_AGE_SEC || 24 * 60 * 60);

export function signAccessToken(user) {
  const payload = {
    sub: user.id,
    role: user.system_role || 'user',
    telegram_id: user.telegram_id || null,
    email: user.email || null
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwtFromRequest(req) {
  const auth = req.header('authorization') || req.header('Authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch {
    return null;
  }
}

// Middleware: принимает либо Bearer JWT, либо Telegram initData в x-telegram-init-data
export async function authMiddleware(req, res, next) {
  // 1) JWT
  const decoded = verifyJwtFromRequest(req);
  if (decoded && decoded.sub) {
    req.user = { id: Number(decoded.sub), system_role: decoded.role || 'user' };
    return next();
  }

  // 2) Telegram initData
  const initData = req.header('x-telegram-init-data') || req.query.init_data;
  if (initData) {
    const verified = verifyInitData(initData);
    if (verified && verified.user) {
      // проверка свежести подписи
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
  }

  // 3) Dev fallback
  if (process.env.DEV_TELEGRAM_ID) {
    const fake = { id: Number(process.env.DEV_TELEGRAM_ID), username: 'dev' };
    const user = await upsertTelegramUser(fake);
    req.user = user;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

export async function issueJwtFromTelegram(initDataRaw) {
  const verified = verifyInitData(initDataRaw);
  if (!verified || !verified.user) {
    return null;
  }
  if (verified.authDate && Math.abs(Date.now() / 1000 - Number(verified.authDate)) > INITDATA_MAX_AGE_SEC) {
    return null;
  }
  const user = await upsertTelegramUser(verified.user);
  const token = signAccessToken(user);
  return { token, user };
}

// ===== Google OAuth (OIDC) =====
let googleClientPromise = null;
async function getGoogleClient() {
  if (googleClientPromise) return googleClientPromise;
  const discoveryUrl = process.env.OAUTH_GOOGLE_ISSUER || 'https://accounts.google.com';
  const issuer = await Issuer.discover(discoveryUrl);
  const client = new issuer.Client({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uris: [process.env.OAUTH_GOOGLE_REDIRECT_URI],
    response_types: ['code']
  });
  googleClientPromise = Promise.resolve(client);
  return client;
}

// ===== PKCE helpers and in-memory store =====
const pkceStore = new Map(); // state -> { verifier, createdAt }
const PKCE_TTL_MS = 10 * 60 * 1000; // 10 минут

function generateRandomUrlSafeBase64(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function generatePkcePair() {
  const verifier = generateRandomUrlSafeBase64(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function savePkceVerifier(state, verifier) {
  pkceStore.set(state, { verifier, createdAt: Date.now() });
}

function takePkceVerifier(state) {
  const entry = pkceStore.get(state);
  if (!entry) return null;
  pkceStore.delete(state);
  if (Date.now() - entry.createdAt > PKCE_TTL_MS) return null;
  return entry.verifier;
}

export async function getGoogleAuthorizationUrl(state) {
  const client = await getGoogleClient();
  const finalState = state || generateRandomUrlSafeBase64(24);
  const { verifier, challenge } = generatePkcePair();
  savePkceVerifier(finalState, verifier);
  const url = client.authorizationUrl({
    scope: 'openid email profile',
    state: finalState,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  return { url, state: finalState };
}

export async function handleGoogleCallback(params) {
  const client = await getGoogleClient();
  const redirectUri = process.env.OAUTH_GOOGLE_REDIRECT_URI;
  const verifier = takePkceVerifier(params.state);
  if (!verifier) {
    throw new Error('Invalid or expired OAuth state');
  }
  const tokenSet = await client.callback(redirectUri, params, { state: params.state }, { code_verifier: verifier });
  const claims = tokenSet.claims();
  const email = claims.email;
  const firstName = claims.given_name || null;
  const lastName = claims.family_name || null;
  const picture = claims.picture || null;
  if (!email) throw new Error('Email is required from Google');
  const user = await upsertEmailUser({ email, firstName, lastName, avatarUrl: picture });
  const token = signAccessToken(user);
  return { token, user };
}


