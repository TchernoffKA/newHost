import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const FILE = path.join(DATA_DIR, 'tasks.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}), 'utf-8');
}

export function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export function writeAll(data) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getUserTasks(userId) {
  const db = readAll();
  return Array.isArray(db[userId]) ? db[userId] : [];
}

export function setUserTasks(userId, tasks) {
  const db = readAll();
  db[userId] = tasks;
  writeAll(db);
  return tasks;
}

export function upsertUserTask(userId, task) {
  const tasks = getUserTasks(userId);
  const idx = tasks.findIndex(t => String(t.id) === String(task.id));
  if (idx === -1) tasks.unshift(task);
  else tasks[idx] = task;
  setUserTasks(userId, tasks);
  return task;
}

export function deleteUserTask(userId, taskId) {
  const tasks = getUserTasks(userId);
  const next = tasks.filter(t => String(t.id) !== String(taskId));
  setUserTasks(userId, next);
}


