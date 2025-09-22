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

// Временная заглушка для пользователей по email (OAuth)
// Существующая схема БД требует NOT NULL для telegram_id, поэтому полноценная
// поддержка email-пользователей будет добавлена вместе с миграцией схемы.
export async function upsertEmailUser({ email, firstName = null, lastName = null, avatarUrl = null }) {
  if (!email) throw new Error('Email is required');
  // До миграции храним только email, создаём запись с фиктивным telegram_id = 0 + уникальностью по email
  const conn = await pool.getConnection();
  try {
    // Попытка найти существующего пользователя по email
    const [exists] = await conn.query('SELECT * FROM users WHERE email = ?', [email]);
    if (exists?.[0]) {
      const user = exists[0];
      await conn.query(
        `UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?`,
        [firstName, lastName, avatarUrl, user.id]
      );
      const [sel] = await conn.query('SELECT * FROM users WHERE id = ?', [user.id]);
      return sel?.[0] || null;
    }
    // Создание новой записи: due to NOT NULL telegram_id, используем уникальное значение
    // На реальном этапе будет миграция для NULLABLE telegram_id и таблицы identity
    const [ins] = await conn.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name, avatar_url, email)
       VALUES (?, NULL, ?, ?, ?, ?)`,
      [Date.now(), firstName, lastName, avatarUrl, email]
    );
    const [sel] = await conn.query('SELECT * FROM users WHERE id = ?', [ins.insertId]);
    return sel?.[0] || null;
  } finally {
    conn.release();
  }
}


