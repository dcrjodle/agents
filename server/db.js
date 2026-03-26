import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { JSONFilePreset } from "lowdb/node";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "db.json");

const defaultData = {
  tasks: [],
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

// Config helpers

export async function getConfig() {
  const db = await getDb();
  return db.data.config;
}
