import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { validateInitData } from './utils/verifyTelegram.js';
let storageMode = 'json';
let listTasks, createTask, updateTaskSql, removeTask;
// 1) MySQL по MYSQL_* env
if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE) {
  try {
    const mod = await import('./db-mysql.js');
    listTasks = mod.listTasks;
    createTask = mod.createTask;
    updateTaskSql = mod.updateTask;
    removeTask = mod.removeTask;
    storageMode = 'mysql';
  } catch (_) {}
}
// 2) Postgres по DATABASE_URL
if (!listTasks && process.env.DATABASE_URL) {
  try {
    const mod = await import('./db-postgres.js');
    listTasks = mod.listTasks;
    createTask = mod.createTask;
    updateTaskSql = mod.updateTask;
    removeTask = mod.removeTask;
    storageMode = 'postgres';
  } catch (_) {}
}
// 3) SQLite, если доступен better-sqlite3
if (!listTasks) {
  try {
    const mod = await import('./db-sqlite.js');
    listTasks = mod.listTasks;
    createTask = mod.createTask;
    updateTaskSql = mod.updateTask;
    removeTask = mod.removeTask;
    storageMode = 'sqlite';
  } catch (_) {}
}
// 4) JSON fallback
if (!listTasks) {
  const mod = await import('./db.js');
  const { getUserTasks: listTasksJson, upsertUserTask: upsertJson, deleteUserTask: deleteJson, setUserTasks: setJson } = mod;
  listTasks = async (userId) => listTasksJson(userId);
  createTask = async (userId, task) => upsertJson(userId, task);
  updateTaskSql = async (userId, id, updates) => {
    const tasks = listTasksJson(userId);
    const idx = tasks.findIndex(t => String(t.id) === String(id));
    if (idx === -1) return null;
    const next = { ...tasks[idx], ...updates };
    tasks[idx] = next;
    setJson(userId, tasks);
    return next;
  };
  removeTask = async (userId, id) => deleteJson(userId, id);
}

const app = express();
const PORT = process.env.PORT || 8787;
const BOT_TOKEN = process.env.BOT_TOKEN || '';

app.use(cors());
app.use(express.json());
// Раздача статических файлов фронтенда с корня проекта
app.use(express.static(process.cwd()));

function auth(req, res, next) {
  const initData = req.header('x-telegram-init-data');
  const { ok, data, reason } = validateInitData(initData, BOT_TOKEN);
  if (!ok) return res.status(401).json({ error: 'unauthorized', reason });
  try {
    const userStr = data.user;
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user?.id) return res.status(401).json({ error: 'no-user' });
    req.user = { id: String(user.id), user };
    next();
  } catch (e) {
    return res.status(400).json({ error: 'bad-user' });
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

// Получить задачи текущего пользователя
app.get('/api/tasks', auth, async (req, res) => {
  const tasks = await listTasks(req.user.id);
  res.json(tasks);
});

// Создать задачу
app.post('/api/tasks', auth, async (req, res) => {
  const { title, due_at, project_id } = req.body || {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title-required' });
  }
  const task = {
    id: Date.now().toString(),
    text: title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
    scheduledAt: due_at || null,
    projectId: project_id || null
  };
  await createTask(req.user.id, task);
  res.status(201).json(task);
});

// Обновить задачу
app.patch('/api/tasks/:id', auth, async (req, res) => {
  const taskId = req.params.id;
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'title')) updates.text = String(req.body.title || '').trim();
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'due_at')) updates.scheduledAt = req.body.due_at || null;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'completed')) updates.completed = !!req.body.completed;

  const next = await updateTaskSql(req.user.id, taskId, updates);
  if (!next) return res.status(404).json({ error: 'not-found' });
  res.json(next);
});

// Удалить задачу
app.delete('/api/tasks/:id', auth, async (req, res) => {
  await removeTask(req.user.id, req.params.id);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (storage: ${storageMode})`);
});

// ---- Extra routes (available in MySQL mode if tables exist) ----
if (storageMode === 'mysql') {
  const mysqlMod = await import('./db-mysql.js');

  // Projects
  app.get('/api/projects', auth, async (req, res) => {
    const rows = await mysqlMod.listProjects(req.user.id);
    res.json(rows);
  });
  app.post('/api/projects', auth, async (req, res) => {
    const { name, color } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name-required' });
    const row = await mysqlMod.createProject(req.user.id, { name, color });
    res.status(201).json(row);
  });
  app.patch('/api/projects/:id', auth, async (req, res) => {
    const row = await mysqlMod.updateProject(req.user.id, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'not-found' });
    res.json(row);
  });
  app.delete('/api/projects/:id', auth, async (req, res) => {
    await mysqlMod.deleteProject(req.user.id, req.params.id);
    res.status(204).end();
  });

  // Tags
  app.get('/api/tags', auth, async (req, res) => {
    const rows = await mysqlMod.listTags(req.user.id);
    res.json(rows);
  });
  app.post('/api/tags', auth, async (req, res) => {
    const { name, color } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name-required' });
    const row = await mysqlMod.createTag(req.user.id, { name, color });
    res.status(201).json(row);
  });
  app.patch('/api/tags/:id', auth, async (req, res) => {
    const row = await mysqlMod.updateTag(req.user.id, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'not-found' });
    res.json(row);
  });
  app.delete('/api/tags/:id', auth, async (req, res) => {
    await mysqlMod.deleteTag(req.user.id, req.params.id);
    res.status(204).end();
  });

  // Task comments
  app.get('/api/tasks/:id/comments', auth, async (req, res) => {
    const rows = await mysqlMod.listTaskComments(req.user.id, req.params.id);
    res.json(rows);
  });
  app.post('/api/tasks/:id/comments', auth, async (req, res) => {
    const { content, parent_comment_id } = req.body || {};
    if (!content) return res.status(400).json({ error: 'content-required' });
    const row = await mysqlMod.addTaskComment(req.user.id, req.params.id, { content, parentCommentId: parent_comment_id });
    res.status(201).json(row);
  });
  app.delete('/api/tasks/:id/comments/:commentId', auth, async (req, res) => {
    await mysqlMod.deleteTaskComment(req.user.id, req.params.id, req.params.commentId);
    res.status(204).end();
  });

  // Task tags
  app.get('/api/tasks/:id/tags', auth, async (req, res) => {
    const rows = await mysqlMod.listTaskTags(req.user.id, req.params.id);
    res.json(rows);
  });
  app.post('/api/tasks/:id/tags', auth, async (req, res) => {
    const { tag_id } = req.body || {};
    if (!tag_id) return res.status(400).json({ error: 'tag_id-required' });
    await mysqlMod.addTaskTag(req.user.id, req.params.id, tag_id);
    res.status(201).json({ ok: true });
  });
  app.delete('/api/tasks/:id/tags/:tagId', auth, async (req, res) => {
    await mysqlMod.removeTaskTag(req.user.id, req.params.id, req.params.tagId);
    res.status(204).end();
  });
}


