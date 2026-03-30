import { supabase } from "./supabase.js";
import { v4 as uuid } from "uuid";

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
  const record = {
    id: uuid(),
    role,
    timestamp: new Date().toISOString(),
    category: ALLOWED_CATEGORIES.has(entry.category) ? entry.category : (entry.category || null),
    content: entry.content,
    task_id: entry.taskId || null,
    project_path: entry.projectPath || null,
  };
  const { data, error } = await supabase
    .from("agent_memory")
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    timestamp: data.timestamp,
    category: data.category,
    content: data.content,
    taskId: data.task_id,
    projectPath: data.project_path,
  };
}

/**
 * Get all memory entries for a given agent role.
 * @param {string} role
 * @returns {Promise<object[]>}
 */
export async function getMemory(role) {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("*")
    .eq("role", role)
    .order("timestamp", { ascending: true });
  if (error) throw error;
  return data.map(memoryFromRow);
}

/**
 * Get memory entries for a given agent role filtered by projectPath.
 * @param {string} role
 * @param {string} projectPath
 * @returns {Promise<object[]>}
 */
export async function getMemoryByProject(role, projectPath) {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("*")
    .eq("role", role)
    .eq("project_path", projectPath)
    .order("timestamp", { ascending: true });
  if (error) throw error;
  return data.map(memoryFromRow);
}

/**
 * Get all memory entries across all roles filtered by projectPath.
 * @param {string} projectPath
 * @returns {Promise<{ [role]: object[] }>}
 */
export async function getAllMemoryByProject(projectPath) {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("*")
    .eq("project_path", projectPath)
    .order("timestamp", { ascending: true });
  if (error) throw error;

  const result = {};
  for (const row of data) {
    if (!result[row.role]) result[row.role] = [];
    result[row.role].push(memoryFromRow(row));
  }
  return result;
}

/**
 * Get all memory entries across all roles.
 * @returns {Promise<{ [role]: object[] }>}
 */
export async function getAllMemory() {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("*")
    .order("timestamp", { ascending: true });
  if (error) throw error;

  const result = {};
  for (const row of data) {
    if (!result[row.role]) result[row.role] = [];
    result[row.role].push(memoryFromRow(row));
  }
  return result;
}

function memoryFromRow(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    category: row.category,
    content: row.content,
    taskId: row.task_id,
    projectPath: row.project_path,
  };
}
