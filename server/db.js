import { supabase } from "./supabase.js";

// --- snake_case <-> camelCase helpers ---

function taskFromRow(row) {
  return {
    id: row.id,
    description: row.description,
    projectPath: row.project_path,
    state: row.state,
    stateKey: row.state_key,
    label: row.label,
    context: row.context,
    snapshot: row.snapshot,
    createdAt: row.created_at,
  };
}

function taskToRow(task) {
  const row = {};
  if (task.id !== undefined) row.id = task.id;
  if (task.description !== undefined) row.description = task.description;
  if (task.projectPath !== undefined) row.project_path = task.projectPath;
  if (task.state !== undefined) row.state = task.state;
  if (task.stateKey !== undefined) row.state_key = task.stateKey;
  if (task.label !== undefined) row.label = task.label;
  if (task.context !== undefined) row.context = task.context;
  if (task.snapshot !== undefined) row.snapshot = task.snapshot;
  if (task.createdAt !== undefined) row.created_at = task.createdAt;
  return row;
}

// --- Task helpers ---

export async function getAllTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(taskFromRow);
}

export async function getTask(id) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? taskFromRow(data) : null;
}

export async function createTask({ id, description, projectPath, state, stateKey, label, context, createdAt }) {
  const row = taskToRow({ id, description, projectPath, state, stateKey, label, context, createdAt });
  const { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return taskFromRow(data);
}

export async function updateTask(id, updates) {
  const row = taskToRow(updates);
  const { data, error } = await supabase
    .from("tasks")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data ? taskFromRow(data) : null;
}

export async function deleteTask(id) {
  const { error, count } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return true;
}

// --- Log helpers ---

// Batch log inserts: accumulate entries and flush every 500ms
let logBuffer = [];
let flushTimeout = null;

async function flushLogs() {
  flushTimeout = null;
  if (logBuffer.length === 0) return;
  const batch = logBuffer;
  logBuffer = [];
  const { error } = await supabase.from("task_logs").insert(batch);
  if (error) console.error("Failed to flush logs to Supabase:", error);
}

function scheduleFlush() {
  if (flushTimeout) return;
  flushTimeout = setTimeout(flushLogs, 500);
}

// Flush on shutdown
function handleShutdown() {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushLogs().catch((err) => console.error("Shutdown log flush failed:", err));
}
process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

export async function appendTaskLog(taskId, entry) {
  logBuffer.push({
    task_id: taskId,
    time: entry.time || new Date().toISOString(),
    type: entry.type,
    agent: entry.agent || null,
    data: entry,
  });
  scheduleFlush();
}

export async function getTaskLogs(taskId) {
  const { data, error } = await supabase
    .from("task_logs")
    .select("*")
    .eq("task_id", taskId)
    .order("id", { ascending: true });
  if (error) throw error;
  return data.map((row) => row.data);
}

export async function clearTaskLogs(taskId) {
  const { error } = await supabase
    .from("task_logs")
    .delete()
    .eq("task_id", taskId);
  if (error) throw error;
}

// --- Config / Project helpers ---

export async function getConfig() {
  const projects = await getProjects();
  return { projects };
}

export async function getProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    name: row.name,
    path: row.path,
    settings: row.settings || {},
  }));
}

export async function getProject(path) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("path", path)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { name: data.name, path: data.path, settings: data.settings || {} };
}

export async function addProject({ name, path }) {
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, path })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") return null; // unique constraint — already exists
    throw error;
  }
  return { name: data.name, path: data.path, settings: data.settings || {} };
}

export async function updateProjectSettings(path, settings) {
  // Fetch current settings, merge, then update
  const current = await getProject(path);
  if (!current) return null;
  const merged = { ...current.settings, ...settings };
  const { data, error } = await supabase
    .from("projects")
    .update({ settings: merged })
    .eq("path", path)
    .select()
    .single();
  if (error) throw error;
  return { name: data.name, path: data.path, settings: data.settings || {} };
}

export async function updateProjectPath(oldPath, newPath) {
  const { data, error } = await supabase
    .from("projects")
    .update({ path: newPath })
    .eq("path", oldPath)
    .select()
    .single();
  if (error) throw error;

  // Update all tasks referencing the old path
  await supabase
    .from("tasks")
    .update({ project_path: newPath })
    .eq("project_path", oldPath);

  return { name: data.name, path: data.path, settings: data.settings || {} };
}

export async function removeProject(path) {
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("path", path);
  if (error) throw error;
}

export async function reorderProjects(projects) {
  // Update sort_order for each project based on array position
  for (let i = 0; i < projects.length; i++) {
    const { error } = await supabase
      .from("projects")
      .update({ sort_order: i, name: projects[i].name })
      .eq("path", projects[i].path);
    if (error) throw error;
  }
  return await getConfig();
}

export async function seedConfig(configObj) {
  // Seed projects from a config object (from config.json)
  if (configObj.projects && Array.isArray(configObj.projects)) {
    for (let i = 0; i < configObj.projects.length; i++) {
      const p = configObj.projects[i];
      const { error } = await supabase
        .from("projects")
        .upsert({ name: p.name, path: p.path, settings: p.settings || {}, sort_order: i }, { onConflict: "path" });
      if (error) console.error("Failed to seed project:", error);
    }
  }
}

