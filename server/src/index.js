import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { router as apiRouter } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json());

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

export { pool };


