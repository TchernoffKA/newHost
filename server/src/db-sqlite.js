import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'tasks.sqlite');

export function getDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  return db;
}

export function migrate() {
  const db = getDb();
  db.exec(`
    create table if not exists tasks (
      id text primary key,
      user_id text not null,
      text text not null,
      completed integer not null default 0,
      created_at text not null,
      scheduled_at text
    );
    create index if not exists idx_tasks_user on tasks(user_id);
  `);
}

export function listTasks(userId) {
  const db = getDb();
  const stmt = db.prepare('select id, text, completed, created_at as createdAt, scheduled_at as scheduledAt from tasks where user_id = ? order by created_at desc');
  return stmt.all(userId).map(r => ({ ...r, completed: !!r.completed }));
}

export function createTask(userId, task) {
  const db = getDb();
  const stmt = db.prepare('insert into tasks (id, user_id, text, completed, created_at, scheduled_at) values (?, ?, ?, ?, ?, ?)');
  stmt.run(task.id, userId, task.text, task.completed ? 1 : 0, task.createdAt, task.scheduledAt);
  return task;
}

export function updateTask(userId, id, updates) {
  const db = getDb();
  const current = db.prepare('select * from tasks where id = ? and user_id = ?').get(id, userId);
  if (!current) return null;
  const next = {
    id: current.id,
    user_id: current.user_id,
    text: updates.text ?? current.text,
    completed: typeof updates.completed === 'boolean' ? (updates.completed ? 1 : 0) : current.completed,
    created_at: current.created_at,
    scheduled_at: updates.scheduledAt === undefined ? current.scheduled_at : updates.scheduledAt
  };
  const stmt = db.prepare('update tasks set text = ?, completed = ?, scheduled_at = ? where id = ? and user_id = ?');
  stmt.run(next.text, next.completed, next.scheduled_at, id, userId);
  return {
    id: next.id,
    text: next.text,
    completed: !!next.completed,
    createdAt: next.created_at,
    scheduledAt: next.scheduled_at
  };
}

export function removeTask(userId, id) {
  const db = getDb();
  db.prepare('delete from tasks where id = ? and user_id = ?').run(id, userId);
}


