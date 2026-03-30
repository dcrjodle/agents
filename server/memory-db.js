import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { JSONFilePreset } from "lowdb/node";
import { v4 as uuid } from "uuid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, "..", "agents");

// Cache open db handles per role
const dbCache = new Map();

async function getDb(role) {
  if (dbCache.has(role)) return dbCache.get(role);

  const memoryDir = join(AGENTS_DIR, role, "memory");
  await mkdir(memoryDir, { recursive: true });

  const dbPath = join(memoryDir, "db.json");
  // Pass a fresh object each time so multiple roles never share the same
  // defaultData reference (lowdb sets db.data = defaultData when the file
  // doesn't yet exist, so a shared object would cause cross-role pollution).
  const db = await JSONFilePreset(dbPath, { entries: [] });
  dbCache.set(role, db);
  return db;
}

const ALLOWED_CATEGORIES = new Set([
  "build_test",
  "architecture",
  "business",
  "code_quality",
  "framework_api",
]);

/**
 * Add a memory entry for the given agent role.
 * @param {string} role - agent role (e.g. 'developer', 'planner')
 * @param {{ category: string, content: string, taskId: string, projectPath: string }} entry
 * @returns {Promise<object>} the persisted entry with id and timestamp
 */
export async function addMemoryEntry(role, entry) {
  const db = await getDb(role);
  const record = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    category: ALLOWED_CATEGORIES.has(entry.category) ? entry.category : (entry.category || null),
    content: entry.content,
    taskId: entry.taskId || null,
    projectPath: entry.projectPath || null,
  };
  db.data.entries.push(record);
  await db.write();
  return record;
}

/**
 * Get all memory entries for a given agent role.
 * @param {string} role
 * @returns {Promise<object[]>}
 */
export async function getMemory(role) {
  const db = await getDb(role);
  return db.data.entries;
}

/**
 * Get memory entries for a given agent role filtered by projectPath.
 * @param {string} role
 * @param {string} projectPath
 * @returns {Promise<object[]>}
 */
export async function getMemoryByProject(role, projectPath) {
  const db = await getDb(role);
  return db.data.entries.filter((e) => e.projectPath === projectPath);
}

/**
 * Get all memory entries across all roles filtered by projectPath.
 * @param {string} projectPath
 * @returns {Promise<{ [role]: object[] }>}
 */
export async function getAllMemoryByProject(projectPath) {
  const result = {};

  try {
    const roleDirs = await readdir(AGENTS_DIR, { withFileTypes: true });
    for (const dirent of roleDirs) {
      if (!dirent.isDirectory()) continue;
      const role = dirent.name;
      const dbPath = join(AGENTS_DIR, role, "memory", "db.json");
      if (existsSync(dbPath)) {
        const db = await getDb(role);
        const filtered = db.data.entries.filter((e) => e.projectPath === projectPath);
        if (filtered.length > 0) result[role] = filtered;
      }
    }
  } catch {
    // agents dir may not exist or be unreadable
  }

  return result;
}

/**
 * Get all memory entries across all roles that have a db cached/loaded.
 * Also scans the agents directory for any roles that have db.json files.
 * @returns {Promise<{ [role]: object[] }>}
 */
export async function getAllMemory() {
  const result = {};

  // Scan agents directory for roles that have memory/db.json
  try {
    const roleDirs = await readdir(AGENTS_DIR, { withFileTypes: true });
    for (const dirent of roleDirs) {
      if (!dirent.isDirectory()) continue;
      const role = dirent.name;
      const dbPath = join(AGENTS_DIR, role, "memory", "db.json");
      if (existsSync(dbPath)) {
        const db = await getDb(role);
        result[role] = db.data.entries;
      }
    }
  } catch {
    // agents dir may not exist or be unreadable
  }

  return result;
}
