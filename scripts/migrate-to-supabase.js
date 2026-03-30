// Migration script: reads existing db.json and per-agent memory db.json files
// and inserts them into Supabase tables.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.js

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load .env from project root
try {
  const envFile = readFileSync(join(ROOT, ".env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* no .env file */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  const dbPath = join(ROOT, "db.json");

  if (!existsSync(dbPath)) {
    console.log("No db.json found, skipping main db migration");
  } else {
    const db = JSON.parse(readFileSync(dbPath, "utf-8"));

    // --- Migrate projects ---
    if (db.config?.projects?.length) {
      console.log(`Migrating ${db.config.projects.length} projects...`);
      for (let i = 0; i < db.config.projects.length; i++) {
        const p = db.config.projects[i];
        const { error } = await supabase.from("projects").upsert(
          { name: p.name, path: p.path, settings: p.settings || {}, sort_order: i },
          { onConflict: "path" }
        );
        if (error) console.error(`  Failed to migrate project ${p.path}:`, error.message);
      }
      console.log("  Projects done");
    }

    // --- Migrate tasks ---
    if (db.tasks?.length) {
      console.log(`Migrating ${db.tasks.length} tasks...`);
      for (const t of db.tasks) {
        const { error } = await supabase.from("tasks").upsert({
          id: t.id,
          description: t.description,
          project_path: t.projectPath,
          state: t.state,
          state_key: t.stateKey || null,
          label: t.label || null,
          context: t.context || null,
          created_at: t.createdAt,
        }, { onConflict: "id" });
        if (error) console.error(`  Failed to migrate task ${t.id}:`, error.message);
      }
      console.log("  Tasks done");
    }

    // --- Migrate logs ---
    if (db.logs && typeof db.logs === "object") {
      const taskIds = Object.keys(db.logs);
      let totalLogs = 0;
      for (const taskId of taskIds) {
        totalLogs += db.logs[taskId].length;
      }
      console.log(`Migrating ${totalLogs} log entries across ${taskIds.length} tasks...`);
      for (const taskId of taskIds) {
        const entries = db.logs[taskId];
        // Batch insert in chunks of 500
        for (let i = 0; i < entries.length; i += 500) {
          const batch = entries.slice(i, i + 500).map((entry) => ({
            task_id: taskId,
            time: entry.time || null,
            type: entry.type || null,
            agent: entry.agent || null,
            data: entry,
          }));
          const { error } = await supabase.from("task_logs").insert(batch);
          if (error) console.error(`  Failed to migrate logs for task ${taskId}:`, error.message);
        }
      }
      console.log("  Logs done");
    }
  }

  // --- Migrate agent memory ---
  const agentsDir = join(ROOT, "agents");
  if (existsSync(agentsDir)) {
    const roleDirs = readdirSync(agentsDir, { withFileTypes: true });
    for (const dirent of roleDirs) {
      if (!dirent.isDirectory()) continue;
      const role = dirent.name;
      const memDbPath = join(agentsDir, role, "memory", "db.json");
      if (!existsSync(memDbPath)) continue;

      const memDb = JSON.parse(readFileSync(memDbPath, "utf-8"));
      const entries = memDb.entries || [];
      if (entries.length === 0) continue;

      console.log(`Migrating ${entries.length} memory entries for role "${role}"...`);
      for (let i = 0; i < entries.length; i += 500) {
        const batch = entries.slice(i, i + 500).map((e) => ({
          id: e.id,
          role,
          timestamp: e.timestamp || null,
          category: e.category || null,
          content: e.content || null,
          task_id: e.taskId || null,
          project_path: e.projectPath || null,
        }));
        const { error } = await supabase.from("agent_memory").upsert(batch, { onConflict: "id" });
        if (error) console.error(`  Failed to migrate memory for ${role}:`, error.message);
      }
    }
    console.log("  Memory done");
  }

  console.log("Migration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
