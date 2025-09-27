import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createPool } from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'todo_app',
    multipleStatements: true
  });

  // Use schema_import.sql (no CREATE DATABASE / USE)
  const schemaPath = path.resolve(__dirname, '../../db/schema_import.sql');
  let sql = await readFile(schemaPath, 'utf-8');
  // Handle MySQL DELIMITER blocks for triggers when using mysql2
  // Remove DELIMITER directives and convert '$$' terminators to ';'
  sql = sql
    .replace(/\r?\n\s*DELIMITER\s*\$\$/gi, '')
    .replace(/\r?\n\s*DELIMITER\s*;?/gi, '')
    .replace(/\$\$/g, ';');

  const conn = await pool.getConnection();
  try {
    await conn.query(sql);
    console.log('[migrate] schema applied');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[migrate] failed:', e);
  process.exit(1);
});


