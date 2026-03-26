import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { JSONFilePreset } from "lowdb/node";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "db.json");

const defaultData = {
  tasks: [],
  logs: {},
  config: {
    projects: [],
  },
};

let db;

export async function getDb() {
  if (!db) {
    db = await JSONFilePreset(DB_PATH, defaultData);
  }
  return db;
}

// Task helpers

export async function getAllTasks() {
  const db = await getDb();
  return db.data.tasks;
}

export async function getTask(id) {
  const db = await getDb();
  return db.data.tasks.find((t) => t.id === id) || null;
}

export async function createTask({ id, description, projectPath, state, label, context, createdAt }) {
  const db = await getDb();
  const task = { id, description, projectPath, state, label, context, createdAt };
  db.data.tasks.push(task);
  await db.write();
  return task;
}

export async function updateTask(id, updates) {
  const db = await getDb();
  const idx = db.data.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  Object.assign(db.data.tasks[idx], updates);
  await db.write();
  return db.data.tasks[idx];
}

export async function deleteTask(id) {
  const db = await getDb();
  const idx = db.data.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  db.data.tasks.splice(idx, 1);
  await db.write();
  return true;
}

// Log helpers

// Debounced write to avoid I/O bottleneck with high-frequency log appends
let writeTimeout = null;
async function debouncedWrite() {
  if (writeTimeout) return;
  writeTimeout = setTimeout(async () => {
    writeTimeout = null;
    try {
      const db = await getDb();
      await db.write();
    } catch (err) {
      console.error("Failed to flush logs to disk:", err);
    }
  }, 500);
}

export async function appendTaskLog(taskId, entry) {
  const db = await getDb();
  if (!db.data.logs) db.data.logs = {};
  if (!db.data.logs[taskId]) db.data.logs[taskId] = [];
  db.data.logs[taskId].push(entry);
  debouncedWrite();
}

export async function getTaskLogs(taskId) {
  const db = await getDb();
  if (!db.data.logs) db.data.logs = {};
  return db.data.logs[taskId] || [];
}

export async function clearTaskLogs(taskId) {
  const db = await getDb();
  if (!db.data.logs) db.data.logs = {};
  delete db.data.logs[taskId];
  await db.write();
}

// Config helpers

export async function getConfig() {
  const db = await getDb();
  return db.data.config;
}
