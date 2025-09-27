import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ connectionString, ssl: sslConfig(connectionString) });
  }
  return pool;
}

function sslConfig(cs) {
  // Разрешаем ssl=require (Heroku, Railway, Render)
  if (/sslmode=require/i.test(cs) || /\bssl=1\b/i.test(cs)) return { rejectUnauthorized: false };
  return undefined;
}

export async function migrate() {
  const p = getPool();
  await p.query(`
    create table if not exists tasks (
      id text primary key,
      user_id text not null,
      text text not null,
      completed boolean not null default false,
      created_at timestamptz not null,
      scheduled_at timestamptz
    );
    create index if not exists idx_tasks_user on tasks(user_id);
  `);
}

export async function listTasks(userId) {
  const p = getPool();
  const { rows } = await p.query(
    'select id, text, completed, created_at as "createdAt", scheduled_at as "scheduledAt" from tasks where user_id = $1 order by created_at desc',
    [userId]
  );
  return rows;
}

export async function createTask(userId, task) {
  const p = getPool();
  await p.query(
    'insert into tasks (id, user_id, text, completed, created_at, scheduled_at) values ($1,$2,$3,$4,$5,$6)',
    [task.id, userId, task.text, task.completed, task.createdAt, task.scheduledAt]
  );
  return task;
}

export async function updateTask(userId, id, updates) {
  const p = getPool();
  const cur = await p.query('select * from tasks where id = $1 and user_id = $2', [id, userId]);
  if (cur.rowCount === 0) return null;
  const row = cur.rows[0];
  const next = {
    text: updates.text ?? row.text,
    completed: typeof updates.completed === 'boolean' ? updates.completed : row.completed,
    scheduled_at: updates.scheduledAt === undefined ? row.scheduled_at : updates.scheduledAt
  };
  await p.query('update tasks set text=$1, completed=$2, scheduled_at=$3 where id=$4 and user_id=$5', [
    next.text,
    next.completed,
    next.scheduled_at,
    id,
    userId
  ]);
  const { rows } = await p.query(
    'select id, text, completed, created_at as "createdAt", scheduled_at as "scheduledAt" from tasks where id=$1 and user_id=$2',
    [id, userId]
  );
  return rows[0] || null;
}

export async function removeTask(userId, id) {
  const p = getPool();
  await p.query('delete from tasks where id = $1 and user_id = $2', [id, userId]);
}


