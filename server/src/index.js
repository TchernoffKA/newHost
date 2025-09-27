import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { router as apiRouter } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.resolve(__dirname, '..', '..');
app.use(express.static(staticDir));

// DB pool is initialized in db.js

app.get('/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 as ok');
    res.json({ status: 'ok', db: rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ status: 'error', error: String(e?.message || e) });
  }
});

app.use('/api', apiRouter);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});



