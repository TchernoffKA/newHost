import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const JSON_FILE = path.join(DATA_DIR, 'tasks.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(JSON_FILE)) fs.writeFileSync(JSON_FILE, JSON.stringify({}), 'utf-8');

let sqliteStatus = 'skipped';
let pgStatus = 'skipped';
let mysqlStatus = 'skipped';

// Postgres (опционально)
try {
  if (process.env.DATABASE_URL) {
    const mod = await import('./db-postgres.js');
    if (mod?.migrate) {
      await mod.migrate();
      pgStatus = 'initialized';
    }
  }
} catch (_) {
  pgStatus = 'skipped';
}
try {
  const mod = await import('./db-sqlite.js');
  if (mod?.migrate) {
    mod.migrate();
    sqliteStatus = 'initialized';
  }
} catch (_) {
  sqliteStatus = 'skipped';
}

// MySQL (опционально)
try {
  const { MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE } = process.env;
  if (MYSQL_HOST && MYSQL_USER && MYSQL_DATABASE) {
    const mod = await import('./db-mysql.js');
    if (mod?.migrate) {
      await mod.migrate();
      mysqlStatus = 'initialized';
    }
  }
} catch (_) {
  mysqlStatus = 'skipped';
}

console.log('Migration complete:', { DATA_DIR, JSON_FILE, SQLITE: sqliteStatus, POSTGRES: pgStatus, MYSQL: mysqlStatus });


