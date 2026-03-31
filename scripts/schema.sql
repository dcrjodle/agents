-- Supabase schema for the agents app

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  description text,
  project_path text,
  state jsonb,
  state_key text,
  label text,
  context jsonb,
  created_at timestamptz
);

CREATE TABLE IF NOT EXISTS task_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text REFERENCES tasks(id) ON DELETE CASCADE,
  time timestamptz,
  type text,
  agent text,
  data jsonb
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id_time ON task_logs(task_id, time);

CREATE TABLE IF NOT EXISTS projects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  path text NOT NULL UNIQUE,
  settings jsonb DEFAULT '{}',
  sort_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id text PRIMARY KEY,
  role text NOT NULL,
  timestamp timestamptz,
  category text,
  content text,
  task_id text,
  project_path text
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_role ON agent_memory(role);
CREATE INDEX IF NOT EXISTS idx_agent_memory_role_project ON agent_memory(role, project_path);

