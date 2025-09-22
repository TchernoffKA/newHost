import express from 'express';
import { verifyInitData } from './telegram.js';
import { upsertTelegramUser } from './users.js';
import { listTasks, createTask, updateTask, deleteTask } from './tasks.js';

export const router = express.Router();

function mapRowToFront(row) {
  return {
    id: String(row.id),
    text: row.title,
    completed: row.status === 'completed',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    scheduledAt: row.due_at ? new Date(row.due_at).toISOString() : null
  };
}

// Auth middleware using Telegram initData in header 'x-telegram-init-data'
router.use(async (req, res, next) => {
  const initData = req.header('x-telegram-init-data') || req.query.init_data;
  // Dev fallback: emulate telegram user via env DEV_TELEGRAM_ID
  if (!initData && process.env.DEV_TELEGRAM_ID) {
    const fake = { id: Number(process.env.DEV_TELEGRAM_ID), username: 'dev' };
    const user = await upsertTelegramUser(fake);
    req.user = user;
    return next();
  }
  const verified = verifyInitData(initData);
  if (!verified || !verified.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const user = await upsertTelegramUser(verified.user);
    req.user = user;
    next();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', details: String(e?.message || e) });
  }
});

router.get('/tasks', async (req, res) => {
  const tasks = await listTasks(req.user.id);
  res.json(tasks.map(mapRowToFront));
});

router.post('/tasks', async (req, res) => {
  const payload = req.body || {};
  // accept front shape { text, scheduledAt }
  const created = await createTask(req.user.id, {
    title: payload.title || payload.text,
    description: payload.description || null,
    due_at: payload.due_at || payload.scheduledAt || null,
    priority: payload.priority || 3,
    project_id: payload.project_id || null
  });
  res.status(201).json(mapRowToFront(created));
});

router.patch('/tasks/:id', async (req, res) => {
  const b = req.body || {};
  const updates = {};
  if (typeof b.text === 'string') updates.title = b.text;
  if (typeof b.title === 'string') updates.title = b.title;
  if (typeof b.completed === 'boolean') updates.status = b.completed ? 'completed' : 'active';
  if (b.scheduledAt !== undefined) updates.due_at = b.scheduledAt;
  if (b.due_at !== undefined) updates.due_at = b.due_at;
  const updated = await updateTask(req.user.id, Number(req.params.id), updates);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(mapRowToFront(updated));
});

router.delete('/tasks/:id', async (req, res) => {
  await deleteTask(req.user.id, Number(req.params.id));
  res.status(204).end();
});


