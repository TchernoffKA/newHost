import { pool } from './db.js';

export async function upsertTelegramUser(user) {
  if (!user || !user.id) return null;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = VALUES(username), first_name = VALUES(first_name), last_name = VALUES(last_name)`,
      [user.id, user.username || null, user.first_name || null, user.last_name || null]
    );
    const [sel] = await conn.query('SELECT * FROM users WHERE telegram_id = ?', [user.id]);
    return sel?.[0] || null;
  } finally {
    conn.release();
  }
}


