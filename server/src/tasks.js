import { pool } from './db.js';

export async function listTasks(userId) {
  const [rows] = await pool.query(
    'SELECT id, title, description, status, priority, due_at, created_at, updated_at FROM tasks WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

export async function createTask(userId, payload) {
  const { title, description = null, due_at = null, priority = 3, project_id = null } = payload || {};
  const [res] = await pool.query(
    `INSERT INTO tasks (user_id, project_id, title, description, status, priority, due_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [userId, project_id, String(title || '').trim(), description, priority, due_at]
  );
  const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [res.insertId]);
  return rows?.[0] || null;
}

export async function updateTask(userId, taskId, updates) {
  const fields = [];
  const values = [];
  const allowed = { title: 1, description: 1, status: 1, priority: 1, due_at: 1 };
  for (const [k, v] of Object.entries(updates || {})) {
    if (allowed[k]) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (fields.length === 0) return null;
  values.push(userId, taskId);
  await pool.query(`UPDATE tasks SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?`, values);
  const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
  return rows?.[0] || null;
}

export async function deleteTask(userId, taskId) {
  await pool.query('UPDATE tasks SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [taskId, userId]);
  return { ok: true };
}


