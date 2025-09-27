import mysql from 'mysql2/promise';

let pool = null;

export function getPool() {
  if (!pool) {
    const {
      MYSQL_HOST,
      MYSQL_PORT = '3306',
      MYSQL_USER,
      MYSQL_PASSWORD,
      MYSQL_DATABASE,
      MYSQL_SSL
    } = process.env;
    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
      throw new Error('MYSQL_* env vars are not set');
    }
    const ssl = MYSQL_SSL === '1' || /require|true/i.test(String(MYSQL_SSL || '')) ? { rejectUnauthorized: false } : undefined;
    pool = mysql.createPool({
      host: MYSQL_HOST,
      port: Number(MYSQL_PORT),
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl
    });
  }
  return pool;
}

export async function migrate() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      text TEXT NOT NULL,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      scheduled_at DATETIME NULL,
      INDEX idx_tasks_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// ---- Tasks with dual-schema support (simple | dump) ----
let __taskSchema = null; // 'simple'|'dump'|null
async function columnExists(table, column) {
  const p = getPool();
  const [rows] = await p.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function detectTaskSchema() {
  if (__taskSchema) return __taskSchema;
  if (await columnExists('tasks', 'title')) __taskSchema = 'dump';
  else if (await columnExists('tasks', 'text')) __taskSchema = 'simple';
  else __taskSchema = null;
  return __taskSchema;
}

async function resolveInternalUserId(telegramId) {
  if (!(await tableExists('users'))) return telegramId;
  const p = getPool();
  const [rows] = await p.query('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
  if (rows.length) return rows[0].id;
  const [ins] = await p.query('INSERT INTO users (telegram_id, username, first_name, last_name, system_role) VALUES (?, NULL, NULL, NULL, "user")', [telegramId]);
  return ins.insertId;
}

export async function listTasks(userId) {
  const schema = await detectTaskSchema();
  const p = getPool();
  if (schema === 'dump') {
    const internalUserId = await resolveInternalUserId(userId);
    const [rows] = await p.query(
      'SELECT id, title, status, due_at, created_at, project_id FROM tasks WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC',
      [internalUserId]
    );
    return rows.map(r => ({
      id: String(r.id),
      text: r.title,
      completed: r.status === 'completed',
      createdAt: new Date(r.created_at).toISOString(),
      scheduledAt: r.due_at ? new Date(r.due_at).toISOString() : null,
      projectId: r.project_id ? String(r.project_id) : null
    }));
  }
  if (schema === 'simple') {
    const [rows] = await p.query(
      'SELECT id, text, completed, created_at AS createdAt, scheduled_at AS scheduledAt FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(r => ({ ...r, completed: !!r.completed }));
  }
  return [];
}

export async function createTask(userId, task) {
  const schema = await detectTaskSchema();
  const p = getPool();
  if (schema === 'dump') {
    const internalUserId = await resolveInternalUserId(userId);
    const status = task.completed ? 'completed' : 'active';
    const [res] = await p.query(
      'INSERT INTO tasks (user_id, project_id, title, description, status, priority, due_at, completed_at, is_deleted, created_at) VALUES (?, ?, ?, NULL, ?, 3, ?, NULL, 0, NOW())',
      [internalUserId, task.projectId || null, task.text, status, task.scheduledAt ? task.scheduledAt.replace('T',' ').replace('Z','') : null]
    );
    const id = res.insertId;
    return { ...task, id: String(id) };
  }
  if (schema === 'simple') {
    await p.query(
      'INSERT INTO tasks (id, user_id, text, completed, created_at, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)',
      [task.id, userId, task.text, task.completed ? 1 : 0, task.createdAt.replace('T',' ').replace('Z',''), task.scheduledAt ? task.scheduledAt.replace('T',' ').replace('Z','') : null]
    );
    return task;
  }
  return task;
}

export async function updateTask(userId, id, updates) {
  const schema = await detectTaskSchema();
  const p = getPool();
  if (schema === 'dump') {
    const internalUserId = await resolveInternalUserId(userId);
    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(updates, 'text')) { fields.push('title = ?'); values.push(updates.text); }
    if (Object.prototype.hasOwnProperty.call(updates, 'scheduledAt')) { fields.push('due_at = ?'); values.push(updates.scheduledAt ? updates.scheduledAt.replace('T',' ').replace('Z','') : null); }
    if (Object.prototype.hasOwnProperty.call(updates, 'completed')) { fields.push('status = ?'); values.push(updates.completed ? 'completed' : 'active'); }
    if (Object.prototype.hasOwnProperty.call(updates, 'projectId')) { fields.push('project_id = ?'); values.push(updates.projectId || null); }
    if (!fields.length) return null;
    values.push(id, internalUserId);
    await p.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    const [rows] = await p.query('SELECT id, title, status, due_at, created_at, project_id FROM tasks WHERE id = ? AND user_id = ?', [id, internalUserId]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      text: r.title,
      completed: r.status === 'completed',
      createdAt: new Date(r.created_at).toISOString(),
      scheduledAt: r.due_at ? new Date(r.due_at).toISOString() : null,
      projectId: r.project_id ? String(r.project_id) : null
    };
  }
  if (schema === 'simple') {
    const [cur] = await p.query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
    if (!cur.length) return null;
    const row = cur[0];
    const next = {
      text: updates.text ?? row.text,
      completed: typeof updates.completed === 'boolean' ? (updates.completed ? 1 : 0) : row.completed,
      scheduled_at: updates.scheduledAt === undefined ? row.scheduled_at : updates.scheduledAt ? updates.scheduledAt.replace('T',' ').replace('Z','') : null
    };
    await p.query('UPDATE tasks SET text = ?, completed = ?, scheduled_at = ? WHERE id = ? AND user_id = ?', [
      next.text,
      next.completed,
      next.scheduled_at,
      id,
      userId
    ]);
    const [rows] = await p.query(
      'SELECT id, text, completed, created_at AS createdAt, scheduled_at AS scheduledAt FROM tasks WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    const r = rows[0];
    return r ? { ...r, completed: !!r.completed } : null;
  }
  return null;
}

export async function removeTask(userId, id) {
  const schema = await detectTaskSchema();
  const p = getPool();
  if (schema === 'dump') {
    const internalUserId = await resolveInternalUserId(userId);
    await p.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, internalUserId]);
  } else if (schema === 'simple') {
    await p.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
  }
}

// ---------- Utilities ----------
async function tableExists(table) {
  const p = getPool();
  const [rows] = await p.query('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table]);
  return rows.length > 0;
}

// ---------- Projects ----------
export async function listProjects(userId) {
  if (!(await tableExists('projects'))) return [];
  const p = getPool();
  const [rows] = await p.query(
    'SELECT id, user_id as userId, name, color, position, is_archived as isArchived, created_at as createdAt, updated_at as updatedAt FROM projects WHERE user_id = ? ORDER BY position, id',
    [userId]
  );
  return rows;
}

export async function createProject(userId, { name, color }) {
  if (!(await tableExists('projects'))) throw new Error('projects table not found');
  const p = getPool();
  const [res] = await p.query('INSERT INTO projects (user_id, name, color, position, is_archived) VALUES (?, ?, ?, 0, 0)', [userId, name, color || null]);
  const id = res.insertId;
  const [rows] = await p.query('SELECT id, user_id as userId, name, color, position, is_archived as isArchived, created_at as createdAt, updated_at as updatedAt FROM projects WHERE id = ?', [id]);
  return rows[0];
}

export async function updateProject(userId, id, updates) {
  if (!(await tableExists('projects'))) return null;
  const p = getPool();
  const fields = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(updates, 'name')) { fields.push('name = ?'); values.push(updates.name); }
  if (Object.prototype.hasOwnProperty.call(updates, 'color')) { fields.push('color = ?'); values.push(updates.color); }
  if (Object.prototype.hasOwnProperty.call(updates, 'position')) { fields.push('position = ?'); values.push(updates.position); }
  if (Object.prototype.hasOwnProperty.call(updates, 'isArchived')) { fields.push('is_archived = ?'); values.push(updates.isArchived ? 1 : 0); }
  if (!fields.length) return null;
  values.push(id, userId);
  await p.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  const [rows] = await p.query('SELECT id, user_id as userId, name, color, position, is_archived as isArchived, created_at as createdAt, updated_at as updatedAt FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0] || null;
}

export async function deleteProject(userId, id) {
  if (!(await tableExists('projects'))) return;
  const p = getPool();
  await p.query('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
}

// ---------- Tags ----------
export async function listTags(userId) {
  if (!(await tableExists('tags'))) return [];
  const p = getPool();
  const [rows] = await p.query(
    'SELECT id, user_id as userId, name, color, created_at as createdAt, updated_at as updatedAt FROM tags WHERE user_id = ? ORDER BY name',
    [userId]
  );
  return rows;
}

export async function createTag(userId, { name, color }) {
  if (!(await tableExists('tags'))) throw new Error('tags table not found');
  const p = getPool();
  const [res] = await p.query('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)', [userId, name, color || null]);
  const id = res.insertId;
  const [rows] = await p.query('SELECT id, user_id as userId, name, color, created_at as createdAt, updated_at as updatedAt FROM tags WHERE id = ?', [id]);
  return rows[0];
}

export async function updateTag(userId, id, updates) {
  if (!(await tableExists('tags'))) return null;
  const p = getPool();
  const fields = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(updates, 'name')) { fields.push('name = ?'); values.push(updates.name); }
  if (Object.prototype.hasOwnProperty.call(updates, 'color')) { fields.push('color = ?'); values.push(updates.color); }
  if (!fields.length) return null;
  values.push(id, userId);
  await p.query(`UPDATE tags SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  const [rows] = await p.query('SELECT id, user_id as userId, name, color, created_at as createdAt, updated_at as updatedAt FROM tags WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0] || null;
}

export async function deleteTag(userId, id) {
  if (!(await tableExists('tags'))) return;
  const p = getPool();
  await p.query('DELETE FROM tags WHERE id = ? AND user_id = ?', [id, userId]);
}

// ---------- Task Comments (if table exists) ----------
export async function listTaskComments(userId, taskId) {
  if (!(await tableExists('task_comments'))) return [];
  const p = getPool();
  const [rows] = await p.query(
    'SELECT id, task_id as taskId, author_user_id as authorUserId, parent_comment_id as parentCommentId, content, is_deleted as isDeleted, created_at as createdAt, updated_at as updatedAt FROM task_comments WHERE task_id = ? ORDER BY created_at',
    [taskId]
  );
  return rows;
}

export async function addTaskComment(userId, taskId, { content, parentCommentId = null }) {
  if (!(await tableExists('task_comments'))) throw new Error('task_comments table not found');
  const p = getPool();
  const [res] = await p.query(
    'INSERT INTO task_comments (task_id, author_user_id, parent_comment_id, content, is_deleted) VALUES (?, ?, ?, ?, 0)',
    [taskId, userId, parentCommentId || null, content]
  );
  const id = res.insertId;
  const [rows] = await p.query(
    'SELECT id, task_id as taskId, author_user_id as authorUserId, parent_comment_id as parentCommentId, content, is_deleted as isDeleted, created_at as createdAt, updated_at as updatedAt FROM task_comments WHERE id = ?',
    [id]
  );
  return rows[0];
}

export async function deleteTaskComment(userId, taskId, commentId) {
  if (!(await tableExists('task_comments'))) return;
  const p = getPool();
  await p.query('DELETE FROM task_comments WHERE id = ? AND task_id = ?', [commentId, taskId]);
}

// ---------- Task Tags (if table exists) ----------
export async function listTaskTags(userId, taskId) {
  if (!(await tableExists('task_tags'))) return [];
  const p = getPool();
  const [rows] = await p.query(
    'SELECT t.id, t.name, t.color FROM task_tags tt JOIN tags t ON t.id = tt.tag_id WHERE tt.task_id = ? ORDER BY t.name',
    [taskId]
  );
  return rows;
}

export async function addTaskTag(userId, taskId, tagId) {
  if (!(await tableExists('task_tags'))) throw new Error('task_tags table not found');
  const p = getPool();
  await p.query('INSERT IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', [taskId, tagId]);
}

export async function removeTaskTag(userId, taskId, tagId) {
  if (!(await tableExists('task_tags'))) return;
  const p = getPool();
  await p.query('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, tagId]);
}


