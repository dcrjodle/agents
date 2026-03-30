import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createActor } from "xstate";
import { v4 as uuid } from "uuid";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { workflowMachine } from "../machine.js";
import { spawnAgent, spawnScript, stateKey, STATE_TO_ROLE, STATE_TO_SCRIPT, RESULT_TO_EVENT, getMapperKey, ensureConfigsLoaded } from "./spawner.js";
import { clearSession, runAgent } from "./agent-runner.js";
import { supabase } from "./supabase.js";
import {
  getAllTasks as dbGetAllTasks,
  getTask as dbGetTask,
  createTask as dbCreateTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  getConfig,
  getProject,
  getProjects,
  addProject,
  updateProjectSettings as dbUpdateProjectSettings,
  updateProjectPath as dbUpdateProjectPath,
  removeProject,
  reorderProjects,
  seedConfig,
  appendTaskLog,
  getTaskLogs,
  clearTaskLogs,
} from "./db.js";
import { addMemoryEntry, getMemory, getMemoryByProject, getAllMemory, getAllMemoryByProject } from "./memory-db.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Serve static frontend build (production)
const __dirname_root = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname_root, "..", "app", "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// --- Auth: session store and cookie helpers ---
const sessions = new Map(); // token -> { email, createdAt }

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  }
  return cookies;
}

function getSessionFromReq(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session;
  return token ? sessions.get(token) : undefined;
}

// Strip /api prefix (Vite proxy does this in dev, but in production we need it)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    req.url = req.url.replace(/^\/api/, "");
  }
  next();
});

// Login endpoint (before auth middleware)
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, email, password_hash")
    .eq("email", email)
    .single();

  if (error || !data || data.password_hash !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = randomUUID();
  sessions.set(token, { email: data.email, createdAt: Date.now() });
  res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  res.json({ ok: true, email: data.email });
});

// Auth check endpoint
app.get("/auth/check", (req, res) => {
  const session = getSessionFromReq(req);
  if (session) return res.json({ authenticated: true, email: session.email });
  res.json({ authenticated: false });
});

// Logout endpoint
app.post("/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session) sessions.delete(cookies.session);
  res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});

// Auth middleware — protect all remaining routes
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  // Internal agent-to-server calls (localhost only, no auth needed)
  if (req.path.startsWith("/internal/")) return next();
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  next();
});

// In-memory XState actors keyed by task id
const actors = new Map();

// Track active agent processes per task
const activeAgents = new Map(); // taskId -> { handle, timeoutTimer, staleTimer }
const stoppedTasks = new Set(); // taskIds where stop was initiated — prevents async onExit race

// Track auto-continue attempts per task (resets on done or delete)
const taskAutoContinues = new Map(); // taskId -> number
// Track in-flight evaluations per projectPath
const activeEvaluations = new Map(); // projectPath -> evalId
// Callbacks for in-flight evaluations: evalId -> { onResult, projectPath }
const evaluationCallbacks = new Map();
// Track in-flight visual tests per projectPath
const activeVisualTests = new Map(); // projectPath -> vtId
const visualTestCallbacks = new Map(); // vtId -> { onResult, projectPath }

// Agent timeout: kill agents that run too long (default 30 minutes)
const AGENT_TIMEOUT_MS = 30 * 60 * 1000;
// Stale check: warn if no output for 20 minutes
const AGENT_STALE_MS = 20 * 60 * 1000;

// State label mapping — handles both flat and compound states
function stateLabel(stateValue) {
  const sk = stateKey(stateValue);
  const labels = {
    "idle": "todo",
    "planning.running": "planning",
    "planning.awaitingApproval": "awaiting_approval",
    "branching": "branching",
    "developing": "in_progress",
    "committing": "committing",
    "testing": "testing",
    "reviewing.running": "reviewing",
    "reviewing.awaitingApproval": "awaiting_approval",
    "pushing": "pushing",
    "directMerging": "merging",
    "merging.awaitingApproval": "awaiting_approval",
    "merging.creatingPr": "creating_pr",
    "done": "published",
    "failed": "failed",
  };
  return labels[sk] || sk;
}

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

/**
 * Broadcast an agent-related message and persist it as a log entry.
 * The log entry format matches what the frontend's appendLog() expects.
 */
function broadcastAndLog(message) {
  broadcast(message);

  const { type, taskId, agent, stream, data, status, exitCode, pid, result, error: msgError } = message;
  if (!taskId) return;

  let logEntry;
  const time = new Date().toISOString();

  switch (type) {
    case "AGENT_SPAWNED":
      logEntry = { time, type: "spawned", agent, data: `Agent ${agent} spawned (pid: ${pid})`, pid };
      break;
    case "AGENT_OUTPUT":
      logEntry = { time, type: "output", agent, stream, data };
      break;
    case "AGENT_STATUS":
      logEntry = { time, type: "status", agent, data: `[${agent}] ${status?.currentStep || status?.state}`, status };
      break;
    case "AGENT_EXITED":
      logEntry = { time, type: "exited", agent, data: `Agent ${agent} exited (code: ${exitCode})`, exitCode };
      break;
    case "AGENT_ERROR":
      logEntry = { time, type: "error", agent, data: `ERROR [${agent}]: ${msgError}`, error: msgError };
      break;
    case "AGENT_RESULT":
      logEntry = { time, type: "message", agent, data: `[${agent}] result: ${result?.summary || result?.status || ""}`, result };
      break;
    default:
      return; // Don't persist non-agent messages
  }

  appendTaskLog(taskId, logEntry);
}

function getTaskSnapshot(id) {
  const actor = actors.get(id);
  if (!actor) return null;
  const snap = actor.getSnapshot();
  const sk = stateKey(snap.value);
  return {
    id,
    description: actor._description,
    projectPath: actor._projectPath,
    state: snap.value,
    stateKey: sk,
    label: stateLabel(snap.value),
    context: snap.context,
    createdAt: actor._createdAt,
  };
}

/**
 * Clean up any running agent for a task.
 */
function cleanupAgent(taskId) {
  const agent = activeAgents.get(taskId);
  if (!agent) return;
  if (agent.timeoutTimer) clearTimeout(agent.timeoutTimer);
  if (agent.staleTimer) clearInterval(agent.staleTimer);
  if (agent.handle) agent.handle.kill();
  activeAgents.delete(taskId);
}

/**
 * Get project settings from the config by path.
 */
async function getProjectSettings(projectPath) {
  const project = await getProject(projectPath);
  return project?.settings || {};
}

/**
 * When XState transitions to a state that has an agent, spawn it.
 */
async function onStateTransition(taskId, stateValue, context) {
  const sk = stateKey(stateValue);
  const isAgent = !!STATE_TO_ROLE[sk];
  const isScript = !!STATE_TO_SCRIPT[sk];
  if (!isAgent && !isScript) return;

  cleanupAgent(taskId);

  const actor = actors.get(taskId);
  if (!actor) return;

  const label = isAgent ? STATE_TO_ROLE[sk] : `script:${sk}`;

  const handoff = {
    instruction: actor._description,
    projectPath: actor._projectPath,
    context: {
      task: context.task,
      plan: context.plan,
      result: context.result,
      error: context.error,
      retries: context.retries,
    },
  };

  let lastActivity = Date.now();
  const resetStaleTimer = () => { lastActivity = Date.now(); };

  const mapperKey = getMapperKey(sk);

  let gotResult = false;

  const callbacks = {
    projectPath: actor._projectPath,
    taskDescription: actor._description,
    onStdout(data) {
      resetStaleTimer();
      broadcastAndLog({ type: "AGENT_OUTPUT", taskId, agent: label, stream: "stdout", data });
    },
    onStderr(data) {
      resetStaleTimer();
      broadcastAndLog({ type: "AGENT_OUTPUT", taskId, agent: label, stream: "stderr", data });
    },
    onStatus(status) {
      resetStaleTimer();
      broadcastAndLog({ type: "AGENT_STATUS", taskId, agent: label, status });
    },
    async onResult(result) {
      resetStaleTimer();
      gotResult = true;
      const agentEntry = activeAgents.get(taskId);
      if (agentEntry) agentEntry.resultReceived = true;

      broadcastAndLog({ type: "AGENT_RESULT", taskId, agent: label, result });

      const mapper = mapperKey ? RESULT_TO_EVENT[mapperKey] : null;
      if (mapper) {
        let event = mapper(result);

        // If push completed, check project settings to decide PR vs direct
        if (mapperKey === "script:pushing" && event.type === "PUSH_COMPLETE") {
          const projectSettings = await getProjectSettings(actor._projectPath);
          if (projectSettings.createPr === false) {
            event = { ...event, type: "PUSH_COMPLETE_NO_PR" };
            broadcastAndLog({ type: "AGENT_OUTPUT", taskId, agent: label, stream: "stderr", data: "[pushing] Skipping PR creation (project setting)\n" });
          }
        }

        if (actors.has(taskId)) actors.get(taskId).send(event);
      }
    },
    onExit(code) {
      resetStaleTimer();
      broadcastAndLog({ type: "AGENT_EXITED", taskId, agent: label, exitCode: code });

      // If the task was stopped by the user, don't send failure events —
      // the stop handler already manages the state transition.
      if (stoppedTasks.has(taskId)) {
        stoppedTasks.delete(taskId);
        return;
      }

      if (!gotResult) {
        const error = code !== 0
          ? `${label} crashed with exit code ${code}`
          : `${label} exited without producing a result`;
        console.error(error);
        broadcastAndLog({ type: "AGENT_ERROR", taskId, agent: label, error });

        const mapper = mapperKey ? RESULT_TO_EVENT[mapperKey] : null;
        if (mapper) {
          const event = mapper({ status: "failed", error });
          if (actors.has(taskId)) actors.get(taskId).send(event);
        }
      }
    },
  };

  // Read agentMode from project settings (defaults to "sdk")
  const projectSettings = await getProjectSettings(actor._projectPath);
  const agentMode = projectSettings.agentMode || "sdk";

  // Pass baseline evaluation score to the reviewer so it can check for regressions
  if (sk === "reviewing.running") {
    handoff.context.lastEvaluation = projectSettings.lastEvaluation || null;
    // Pass review context (includes userComments if this is a re-run)
    handoff.context.review = context.review || null;
  }

  // Spawn script or agent
  const handle = isScript
    ? spawnScript(sk, taskId, handoff, callbacks)
    : spawnAgent(sk, taskId, actor._description, handoff, { ...callbacks, agentMode });

  if (!handle.pid) {
    const error = `Failed to spawn ${label} — process did not start`;
    console.error(error);
    broadcastAndLog({ type: "AGENT_ERROR", taskId, agent: label, error });
    const mapper = mapperKey ? RESULT_TO_EVENT[mapperKey] : null;
    if (mapper) {
      const event = mapper({ status: "failed", error });
      if (actors.has(taskId)) actors.get(taskId).send(event);
    }
    return;
  }

  broadcastAndLog({ type: "AGENT_SPAWNED", taskId, agent: label, pid: handle.pid });

  // Scripts get a shorter timeout (60s), agents get 10 minutes
  const timeoutMs = isScript ? 60_000 : AGENT_TIMEOUT_MS;

  const timeoutTimer = setTimeout(() => {
    const agentEntry = activeAgents.get(taskId);
    if (agentEntry && !agentEntry.resultReceived) {
      const error = `${label} timed out after ${timeoutMs / 1000} seconds`;
      console.error(error);
      broadcastAndLog({ type: "AGENT_ERROR", taskId, agent: label, error });
      broadcastAndLog({ type: "AGENT_STATUS", taskId, agent: label, status: { state: "timeout", currentStep: error } });
      // Clean up stale timer before killing to stop "no activity" messages
      if (agentEntry.staleTimer) clearInterval(agentEntry.staleTimer);
      handle.kill();
    }
  }, timeoutMs);

  // Stale detection: only for agents (scripts are fast)
  let staleTimer = null;
  if (isAgent) {
    staleTimer = setInterval(() => {
      const agentEntry = activeAgents.get(taskId);
      if (!agentEntry || agentEntry.resultReceived) {
        clearInterval(staleTimer);
        return;
      }
      const elapsed = Date.now() - lastActivity;
      if (elapsed >= AGENT_STALE_MS) {
        broadcastAndLog({ type: "AGENT_STATUS", taskId, agent: label, status: {
          state: "stale",
          currentStep: `No activity for ${Math.round(elapsed / 60000)} minutes — agent may be stuck`,
        }});
      }
    }, 30_000);
  }

  activeAgents.set(taskId, { handle, resultReceived: false, timeoutTimer, staleTimer, resetStaleTimer });
}

/**
 * Wire up an XState actor for a task: subscribe to state changes,
 * persist to db, and trigger agent spawning.
 */
function wireActor(id, actor) {
  let prevStateKey = null;

  actor.subscribe((snapshot) => {
    const sk = stateKey(snapshot.value);
    if (sk === prevStateKey) return;
    prevStateKey = sk;

    const label = stateLabel(snapshot.value);

    // Persist state to db
    dbUpdateTask(id, { state: snapshot.value, stateKey: sk, label, context: snapshot.context }).catch((err) => {
      console.error(`Failed to persist state for ${id}:`, err);
    });

    broadcast({
      type: "STATE_UPDATE",
      taskId: id,
      state: snapshot.value,
      stateKey: sk,
      label,
      context: snapshot.context,
    });

    // Skip side-effects (agent spawning, auto-approvals, broadcasts) during rehydration replay
    if (!actor._rehydrating) {
      // Skip testing if project setting is enabled — check before spawning agent
      if (sk === "testing") {
        getProjectSettings(actor._projectPath).then((projectSettings) => {
          if (projectSettings.skipTesting) {
            broadcastAndLog({ type: "AGENT_STATUS", taskId: id, agent: "system", status: { state: "skipped", currentStep: "Skipping tests (project setting)" } });
            actor.send({ type: "TESTS_PASSED" });
          } else if (STATE_TO_ROLE[sk] || STATE_TO_SCRIPT[sk]) {
            onStateTransition(id, snapshot.value, snapshot.context);
          }
        });
      } else if (STATE_TO_ROLE[sk] || STATE_TO_SCRIPT[sk]) {
        // Spawn agent or script if state has one
        onStateTransition(id, snapshot.value, snapshot.context);
      }

      // Auto-approve PR creation if setting is enabled
      if (sk === "merging.awaitingApproval") {
        getProjectSettings(actor._projectPath).then((projectSettings) => {
          if (projectSettings.autoApprovePr !== false) {
            actor.send({ type: "PR_APPROVED" });
            broadcast({ type: "APPROVAL", taskId: id, approval: "pr", message: "Auto-approved" });
          }
        });
      }

      // Broadcast PLAN_READY event when entering awaitingApproval in planning
      if (sk === "planning.awaitingApproval" && snapshot.context.plan) {
        broadcast({
          type: "PLAN_READY",
          taskId: id,
          plan: snapshot.context.plan,
        });
      }

      // Broadcast REVIEW_READY event when entering awaitingApproval in reviewing
      if (sk === "reviewing.awaitingApproval" && snapshot.context.review) {
        broadcast({
          type: "REVIEW_READY",
          taskId: id,
          review: snapshot.context.review,
        });
      }
    }

    // Clean up auto-continue counter when task completes successfully
    if (sk === "done") {
      taskAutoContinues.delete(id);
    }

    // Auto-continue from failed state (up to project maxRetries limit)
    if (sk === "failed" && snapshot.context.failedFrom) {
      const count = taskAutoContinues.get(id) ?? 0;
      getProjectSettings(actor._projectPath).then((projectSettings) => {
        const maxRetries = projectSettings.maxRetries ?? 5;
        if (count < maxRetries) {
          taskAutoContinues.set(id, count + 1);
          const failedFrom = snapshot.context.failedFrom;
          broadcastAndLog({
            type: "AGENT_STATUS",
            taskId: id,
            agent: "auto-continue",
            status: {
              state: "running",
              currentStep: `[auto-continue] Retrying from ${failedFrom} (attempt ${count + 1}/${maxRetries})...`,
            },
          });
          setTimeout(() => {
            if (actors.has(id)) actors.get(id).send({ type: "CONTINUE" });
          }, 500);
        }
      });
    }
  });
}

// --- REST API ---

app.get("/config", async (req, res) => {
  const config = await getConfig();
  res.json(config);
});

app.post("/config/pick-folder", async (req, res) => {
  const platform = process.platform;
  try {
    let cmd;
    if (platform === "darwin") {
      cmd = `osascript -e 'POSIX path of (choose folder with prompt "Select project folder")'`;
    } else if (platform === "linux") {
      cmd = `zenity --file-selection --directory --title="Select project folder" 2>/dev/null || kdialog --getexistingdirectory ~ 2>/dev/null`;
    } else if (platform === "win32") {
      cmd = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select project folder'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath } else { exit 1 }"`;
    } else {
      return res.status(400).json({ error: `Unsupported platform: ${platform}` });
    }
    const { execSync } = await import("child_process");
    const result = execSync(cmd, { encoding: "utf-8", timeout: 60000 }).trim();
    if (!result) return res.status(400).json({ error: "No folder selected" });
    // Remove trailing slash if present (macOS osascript adds one)
    const folderPath = result.replace(/\/+$/, "");
    const name = folderPath.split(/[/\\]/).pop();
    res.json({ path: folderPath, name });
  } catch (err) {
    // User cancelled the dialog
    res.status(400).json({ error: "Folder selection cancelled" });
  }
});

app.post("/config/projects", async (req, res) => {
  const { name, path } = req.body;
  if (!name || !path) return res.status(400).json({ error: "name and path required" });
  const existing = await getProject(path);
  if (existing) return res.status(409).json({ error: "project already exists" });
  await addProject({ name, path });
  const config = await getConfig();
  res.status(201).json(config);
});

app.put("/config/projects/reorder", async (req, res) => {
  const { projects } = req.body;
  if (!Array.isArray(projects)) return res.status(400).json({ error: "projects array required" });
  const existing = await getProjects();
  // Validate same set of projects (no additions/removals)
  if (projects.length !== existing.length) {
    return res.status(400).json({ error: "reorder must contain the same projects" });
  }
  const existingPaths = new Set(existing.map((p) => p.path));
  for (const p of projects) {
    if (!p.path || !existingPaths.has(p.path)) {
      return res.status(400).json({ error: `unknown project path: ${p.path}` });
    }
  }
  const config = await reorderProjects(projects);
  res.json(config);
});

app.patch("/config/projects/settings", async (req, res) => {
  const { path, settings } = req.body;
  if (!path) return res.status(400).json({ error: "path required" });
  if (!settings || typeof settings !== "object") return res.status(400).json({ error: "settings object required" });
  const project = await dbUpdateProjectSettings(path, settings);
  if (!project) return res.status(404).json({ error: "project not found" });
  res.json(project);
});

app.patch("/config/projects/path", async (req, res) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: "oldPath and newPath required" });
  const existing = await getProject(oldPath);
  if (!existing) return res.status(404).json({ error: "project not found" });
  try {
    const project = await dbUpdateProjectPath(oldPath, newPath);
    res.json(project);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "a project with that path already exists" });
    throw err;
  }
});

app.delete("/config/projects", async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: "path required" });
  const existing = await getProject(path);
  if (!existing) return res.status(404).json({ error: "project not found" });
  await removeProject(path);
  const config = await getConfig();
  res.json(config);
});

app.post("/config/browse", async (req, res) => {
  try {
    const { execFile } = await import("child_process");
    await new Promise((resolve, reject) => {
      execFile(
        "osascript",
        ["-e", 'POSIX path of (choose folder with prompt "Select project folder")'],
        { timeout: 120000 },
        (err, stdout) => {
          if (err) {
            // User cancelled or osascript error
            res.status(204).end();
            resolve();
            return;
          }
          const result = (stdout || "").trim();
          if (result) {
            const path = result.endsWith("/") ? result.slice(0, -1) : result;
            const name = path.split("/").pop();
            res.json({ path, name });
          } else {
            res.status(204).end();
          }
          resolve();
        }
      );
    });
  } catch {
    res.status(204).end();
  }
});

// --- Deploy: pull latest on production and restart ---
app.post("/deploy", async (req, res) => {
  const remoteHost = "joel.bystedt@35.228.54.40";
  const remoteDir = "/home/joel.bystedt/agents";
  const { execSync } = await import("child_process");
  const { hostname } = await import("os");
  const isLocal = hostname() === "joel-linux-monstrosity";

  const script = [
    `export NVM_DIR="$HOME/.nvm"`,
    `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`,
    `cd ${remoteDir}`,
    `git pull origin main`,
    `npm install --omit=dev`,
    `cd app && npm install && npm run build`,
    `cd ${remoteDir}`,
    `pkill -9 -f "node.*server/index.js" || true`,
    `sleep 1`,
    `nohup node server/index.js > /tmp/agents-server.log 2>&1 &`,
    `echo DEPLOY_OK`,
  ].join("\n");

  try {
    const args = isLocal
      ? ["bash"]
      : ["ssh", "-o", "ConnectTimeout=10", remoteHost, "bash"];
    const { execFileSync } = await import("child_process");
    const output = execFileSync(args[0], args.slice(1), {
      input: script,
      encoding: "utf-8",
      timeout: 120000,
    });
    const success = output.includes("DEPLOY_OK");
    res.json({ success, output: output.trim() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, output: err.stdout || "" });
  }
});

app.get("/tasks", async (req, res) => {
  // Return live snapshots for active actors, db records for completed/failed
  const dbTasks = await dbGetAllTasks();
  const list = dbTasks.map((t) => {
    const actor = actors.get(t.id);
    if (actor) {
      return getTaskSnapshot(t.id);
    }
    // No live actor — return persisted state
    return t;
  });
  res.json(list);
});

app.post("/tasks", async (req, res) => {
  const { description, projectPath, autoStart } = req.body;
  if (!description) return res.status(400).json({ error: "description required" });
  if (!projectPath) return res.status(400).json({ error: "projectPath required" });

  const id = uuid();
  const actor = createActor(workflowMachine);
  // Stash metadata on the actor for easy access
  actor._description = description;
  actor._projectPath = projectPath;
  actor._createdAt = new Date().toISOString();

  actors.set(id, actor);

  wireActor(id, actor);

  actor.start();

  // Persist initial record
  const snap = actor.getSnapshot();
  await dbCreateTask({
    id,
    description,
    projectPath,
    state: snap.value,
    stateKey: stateKey(snap.value),
    label: stateLabel(snap.value),
    context: snap.context,
    createdAt: actor._createdAt,
  });

  // Only start the workflow if autoStart is explicitly true
  if (autoStart) {
    const projectSettings = await getProjectSettings(projectPath);
    const maxRetries = projectSettings.maxRetries ?? 5;
    actor.send({ type: "START", task: description, maxRetries });
  }

  const snapshot = getTaskSnapshot(id);
  broadcast({ type: "TASK_CREATED", task: snapshot });
  res.status(201).json(snapshot);
});

app.patch("/tasks/:id", async (req, res) => {
  const { description } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description required" });
  }

  const actor = actors.get(req.params.id);
  if (!actor) return res.status(404).json({ error: "task not found" });

  const snap = actor.getSnapshot();
  const sk = stateKey(snap.value);
  if (sk !== "idle") {
    return res.status(400).json({ error: `Task is in state "${sk}", can only edit idle tasks` });
  }

  actor._description = description.trim();
  await dbUpdateTask(req.params.id, { description: description.trim() });

  const snapshot = getTaskSnapshot(req.params.id);
  broadcast({ type: "TASK_UPDATED", task: snapshot });
  res.json(snapshot);
});

app.post("/tasks/:id/start", async (req, res) => {
  const actor = actors.get(req.params.id);
  if (!actor) return res.status(404).json({ error: "task not found" });

  const snap = actor.getSnapshot();
  const sk = stateKey(snap.value);
  if (sk !== "idle") {
    return res.status(400).json({ error: `Task is in state "${sk}", can only start idle tasks` });
  }

  const projectSettings = await getProjectSettings(actor._projectPath);
  const maxRetries = projectSettings.maxRetries ?? 5;
  actor.send({ type: "START", task: actor._description, maxRetries });
  res.json(getTaskSnapshot(req.params.id));
});

app.post("/tasks/:id/event", (req, res) => {
  const actor = actors.get(req.params.id);
  if (!actor) return res.status(404).json({ error: "task not found" });

  const { event } = req.body;
  if (!event?.type) return res.status(400).json({ error: "event.type required" });

  actor.send(event);
  res.json(getTaskSnapshot(req.params.id));
});

app.get("/tasks/:id/plan", (req, res) => {
  const actor = actors.get(req.params.id);
  if (!actor) return res.json(null);

  const snap = actor.getSnapshot();
  if (snap.context.plan?.markdown) {
    return res.json({
      markdown: snap.context.plan.markdown,
      projectPath: snap.context.plan.projectPath,
    });
  }
  res.json(null);
});

app.post("/tasks/:id/approve", (req, res) => {
  const actor = actors.get(req.params.id);
  if (!actor) return res.status(404).json({ error: "task not found" });

  const snap = actor.getSnapshot();
  const sk = stateKey(snap.value);

  if (sk === "planning.awaitingApproval") {
    const action = req.body.action; // "revise" | "reject" | undefined (treat as approve)
    if (action === "revise") {
      actor.send({ type: "PLAN_REVISION_REQUESTED", comments: req.body.comments || "" });
    } else if (action === "reject") {
      actor.send({ type: "PLAN_REJECTED" });
    } else {
      const planApprovedEvent = { type: "PLAN_APPROVED" };
      if (req.body.reviewComments) planApprovedEvent.reviewComments = req.body.reviewComments;
      actor.send(planApprovedEvent);
    }
    broadcast({ type: "APPROVAL", taskId: req.params.id, approval: "plan", message: req.body.message || action || "Approved" });
    return res.json({ ok: true });
  }

  if (sk === "reviewing.awaitingApproval") {
    const action = req.body.action; // "approve" | "changes_requested" | "revise"
    if (action === "approve") {
      actor.send({ type: "REVIEW_APPROVED" });
    } else if (action === "changes_requested") {
      actor.send({ type: "CHANGES_REQUESTED", feedback: req.body.feedback || "" });
    } else if (action === "revise") {
      actor.send({ type: "REVIEW_REVISION_REQUESTED", comments: req.body.comments || "" });
    } else {
      return res.status(400).json({ error: `Unknown review action: ${action}` });
    }
    broadcast({ type: "APPROVAL", taskId: req.params.id, approval: "review", message: req.body.message || action });
    return res.json({ ok: true });
  }

  if (sk === "merging.awaitingApproval") {
    actor.send({ type: "PR_APPROVED" });
    broadcast({ type: "APPROVAL", taskId: req.params.id, approval: "pr", message: req.body.message || "Approved" });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: `Current state ${sk} is not an approval gate` });
});

app.post("/tasks/:id/restart", async (req, res) => {
  const id = req.params.id;

  // Get task metadata from live actor or db
  let description, projectPath, createdAt, worktreePath, branchName;
  const existingActor = actors.get(id);
  if (existingActor) {
    description = existingActor._description;
    projectPath = existingActor._projectPath;
    createdAt = existingActor._createdAt;
    const snap = existingActor.getSnapshot();
    worktreePath = snap.context?.result?.worktreePath;
    branchName = snap.context?.result?.branchName;
    // Kill any running agent, clear session, and stop actor
    stoppedTasks.add(id);
    cleanupAgent(id);
    clearSession(id);
    existingActor.stop();
    actors.delete(id);
  } else {
    // Task is in a terminal state (done/failed) — no live actor, load from db
    const dbTask = await dbGetTask(id);
    if (!dbTask) return res.status(404).json({ error: "task not found" });
    description = dbTask.description;
    projectPath = dbTask.projectPath;
    createdAt = dbTask.createdAt;
    worktreePath = dbTask.context?.result?.worktreePath;
    branchName = dbTask.context?.result?.branchName;
  }

  // Clean up the worktree for this task
  if (projectPath) {
    try {
      const { spawnSync } = await import("child_process");
      const { join, dirname } = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cleanupScript = join(__dirname, "..", "scripts", "cleanup-worktree.sh");
      const handoff = JSON.stringify({
        projectPath,
        context: { result: { worktreePath: worktreePath || "", branchName: branchName || "" } },
      });
      const result = spawnSync("bash", [cleanupScript], {
        input: handoff,
        env: { ...process.env, TASK_ID: id },
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (result.status === 0) {
        console.log(`Cleaned up worktree for restarted task ${id}`);
      } else {
        console.warn(`Worktree cleanup exited with code ${result.status} for task ${id}`);
      }
    } catch (err) {
      console.warn(`Worktree cleanup failed for task ${id} (non-fatal):`, err.message);
    }
  }

  // Clear persisted logs for this task
  await clearTaskLogs(id);

  // Create a fresh actor with the same description and project
  const newActor = createActor(workflowMachine);
  newActor._description = description;
  newActor._projectPath = projectPath;
  newActor._createdAt = createdAt;

  actors.set(id, newActor);
  wireActor(id, newActor);
  newActor.start();

  // Persist the reset state
  const snap = newActor.getSnapshot();
  await dbUpdateTask(id, {
    state: snap.value,
    stateKey: stateKey(snap.value),
    label: stateLabel(snap.value),
    context: snap.context,
  });

  broadcast({ type: "TASK_RESTARTED", taskId: id });

  res.json(getTaskSnapshot(id));
});

app.post("/tasks/:id/stop", async (req, res) => {
  const id = req.params.id;
  const actor = actors.get(id);
  if (!actor) return res.status(404).json({ error: "task not found or not running" });

  const snap = actor.getSnapshot();
  const sk = stateKey(snap.value);

  if (sk === "idle" || sk === "done" || sk === "failed") {
    return res.status(400).json({ error: `Task is in state "${sk}", nothing to stop` });
  }

  // Mark as stopped so the async onExit callback (which fires after kill/abort)
  // won't send failure events to the replacement actor.
  stoppedTasks.add(id);

  // Kill any running agent process
  cleanupAgent(id);
  clearSession(id);

  // Stop the current actor and recreate in failed state so user can continue later
  actor.stop();
  actors.delete(id);
  taskAutoContinues.delete(id);

  const restoredMachine = workflowMachine.provide({});
  const newActor = createActor(restoredMachine, {
    snapshot: {
      value: "idle",
      context: {
        ...snap.context,
        error: null,
        failedFrom: null,
      },
      children: {},
      status: "active",
      output: undefined,
      error: undefined,
    },
  });
  newActor._description = actor._description;
  newActor._projectPath = actor._projectPath;
  newActor._createdAt = actor._createdAt;

  actors.set(id, newActor);
  wireActor(id, newActor);
  newActor.start();

  const newSnap = newActor.getSnapshot();
  await dbUpdateTask(id, {
    state: newSnap.value,
    stateKey: stateKey(newSnap.value),
    label: stateLabel(newSnap.value),
    context: newSnap.context,
  });

  broadcastAndLog({ type: "AGENT_STATUS", taskId: id, agent: "system", status: { state: "stopped", currentStep: `Stopped by user (was ${sk})` } });
  broadcast({ type: "STATE_UPDATE", taskId: id, state: newSnap.value, stateKey: stateKey(newSnap.value), label: stateLabel(newSnap.value), context: newSnap.context });

  res.json(getTaskSnapshot(id));
});

app.post("/tasks/:id/continue", async (req, res) => {
  const id = req.params.id;

  // Try to get a live actor first; if not, rehydrate from db
  let actor = actors.get(id);
  if (!actor) {
    // Task is in a terminal state — rehydrate from db
    const dbTask = await dbGetTask(id);
    if (!dbTask) return res.status(404).json({ error: "task not found" });

    const sk = dbTask.stateKey || stateKey(dbTask.state);
    if (sk !== "failed") {
      return res.status(400).json({ error: `Task is in state "${sk}", can only continue failed tasks` });
    }

    if (!dbTask.context?.failedFrom) {
      return res.status(400).json({ error: "No failedFrom state recorded — use restart instead" });
    }

    // Create a fresh actor, restore context, and start in "failed" state
    const restoredMachine = workflowMachine.provide({});
    actor = createActor(restoredMachine, {
      snapshot: {
        value: "failed",
        context: dbTask.context,
        children: {},
        status: "active",
        output: undefined,
        error: undefined,
      },
    });
    actor._description = dbTask.description;
    actor._projectPath = dbTask.projectPath;
    actor._createdAt = dbTask.createdAt;

    actors.set(id, actor);
    wireActor(id, actor);
    actor.start();
  }

  const snap = actor.getSnapshot();
  const sk = stateKey(snap.value);
  if (sk !== "failed") {
    return res.status(400).json({ error: `Task is in state "${sk}", can only continue failed tasks` });
  }

  if (!snap.context.failedFrom) {
    return res.status(400).json({ error: "No failedFrom state recorded — use restart instead" });
  }

  // Clean up any lingering agent process but keep worktree
  stoppedTasks.add(id);
  cleanupAgent(id);

  // Clear errors from logs (keep other log entries for context)
  // Don't clear all logs — the user wants to see history

  // Send CONTINUE event — the machine will route to the right state
  actor.send({ type: "CONTINUE" });

  broadcast({ type: "TASK_CONTINUED", taskId: id, fromState: snap.context.failedFrom });

  res.json(getTaskSnapshot(id));
});

app.delete("/tasks/:id", async (req, res) => {
  const actor = actors.get(req.params.id);
  if (actor) {
    stoppedTasks.add(req.params.id);
    cleanupAgent(req.params.id);
    clearSession(req.params.id);
    actor.stop();
    actors.delete(req.params.id);
  }
  taskAutoContinues.delete(req.params.id);
  await clearTaskLogs(req.params.id);
  await dbDeleteTask(req.params.id);
  broadcast({ type: "TASK_DELETED", taskId: req.params.id });
  res.json({ ok: true });
});

// --- Internal API (MCP server callbacks) ---

app.post("/internal/agent-status", (req, res) => {
  const { taskId, message } = req.body;
  if (!taskId || !message) return res.status(400).json({ error: "taskId and message required" });

  const agentEntry = activeAgents.get(taskId);
  const actor = actors.get(taskId);
  const sk = actor ? stateKey(actor.getSnapshot().value) : null;
  const label = sk ? (STATE_TO_ROLE[sk] || sk) : "unknown";

  // Reset stale timer
  if (agentEntry && agentEntry.resetStaleTimer) agentEntry.resetStaleTimer();

  broadcastAndLog({
    type: "AGENT_STATUS",
    taskId,
    agent: label,
    status: { currentStep: message, state: "running" },
  });
  res.json({ ok: true });
});

app.post("/internal/agent-error", (req, res) => {
  const { taskId, message } = req.body;
  if (!taskId || !message) return res.status(400).json({ error: "taskId and message required" });

  const actor = actors.get(taskId);
  const sk = actor ? stateKey(actor.getSnapshot().value) : null;
  const label = sk ? (STATE_TO_ROLE[sk] || sk) : "unknown";

  broadcastAndLog({
    type: "AGENT_ERROR",
    taskId,
    agent: label,
    error: message,
  });
  res.json({ ok: true });
});

app.post("/internal/agent-result", async (req, res) => {
  const { taskId, ...resultPayload } = req.body;
  if (!taskId) return res.status(400).json({ error: "taskId required" });

  // Handle evaluation results separately (evalIds are not in activeAgents/actors)
  const evalCb = evaluationCallbacks.get(taskId);
  if (evalCb) {
    evaluationCallbacks.delete(taskId);
    try {
      if (evalCb.onResult) await evalCb.onResult(resultPayload);
    } catch (err) {
      console.error("Evaluation onResult callback error:", err);
    }
    return res.json({ ok: true });
  }

  const agentEntry = activeAgents.get(taskId);
  if (agentEntry) {
    // Prevent double-processing
    if (agentEntry.resultReceived) {
      return res.json({ ok: true, note: "result already received" });
    }
    agentEntry.resultReceived = true;
    if (agentEntry.handle && agentEntry.handle.markResultReceived) {
      agentEntry.handle.markResultReceived();
    }
  }

  const actor = actors.get(taskId);
  const sk = actor ? stateKey(actor.getSnapshot().value) : null;
  const label = sk ? (STATE_TO_ROLE[sk] || sk) : "unknown";
  const mapperKey = sk ? getMapperKey(sk) : null;

  broadcastAndLog({
    type: "AGENT_RESULT",
    taskId,
    agent: label,
    result: resultPayload,
  });

  // Map result to XState event and advance state machine
  const mapper = mapperKey ? RESULT_TO_EVENT[mapperKey] : null;
  if (mapper && actor) {
    (async () => {
      let event = mapper(resultPayload);

      // If push completed, check project settings to decide PR vs direct
      if (mapperKey === "script:pushing" && event.type === "PUSH_COMPLETE") {
        const projectSettings = await getProjectSettings(actor._projectPath);
        if (projectSettings.createPr === false) {
          event = { ...event, type: "PUSH_COMPLETE_NO_PR" };
        }
      }

      if (actors.has(taskId)) actors.get(taskId).send(event);
    })();
  }

  res.json({ ok: true });
});

app.get("/internal/task-context/:taskId", (req, res) => {
  const { taskId } = req.params;
  const actor = actors.get(taskId);
  if (!actor) return res.status(404).json({ error: "task not found" });

  const snap = actor.getSnapshot();
  res.json({
    task: actor._description,
    plan: snap.context.plan,
    result: snap.context.result,
    error: snap.context.error,
    retries: snap.context.retries,
    projectPath: actor._projectPath,
  });
});

app.post("/internal/add-memory", async (req, res) => {
  const { taskId, content, category, agentRole } = req.body;
  if (!taskId || !content) return res.status(400).json({ error: "taskId and content required" });

  // Resolve the agent role from the active task state, with optional override
  let role = agentRole || null;
  if (!role) {
    const actor = actors.get(taskId);
    const sk = actor ? stateKey(actor.getSnapshot().value) : null;
    role = sk ? (STATE_TO_ROLE[sk] || null) : null;
  }
  if (!role) role = "unknown";

  const actor = actors.get(taskId);
  const projectPath = actor ? actor._projectPath : null;

  const entry = await addMemoryEntry(role, { content, category: category || null, taskId, projectPath });

  broadcast({ type: "MEMORY_UPDATED", role, entry });

  const time = new Date().toISOString();
  appendTaskLog(taskId, {
    time,
    type: "memory",
    agent: role,
    data: `[memory:${entry.category || "unknown"}] ${entry.content}`,
    entry,
  });

  res.json({ ok: true, entry });
});

app.post("/internal/avatar-update", (req, res) => {
  const { taskId, action, message, targetX, direction } = req.body;
  if (!taskId) return res.status(400).json({ error: "taskId required" });

  const actor = actors.get(taskId);
  const sk = actor ? stateKey(actor.getSnapshot().value) : null;
  const agent = sk ? (STATE_TO_ROLE[sk] || sk) : "unknown";

  broadcast({
    type: "AVATAR_UPDATE",
    taskId,
    agent,
    action: action || "idle",
    message: message ? message.slice(0, 60) : undefined,
    targetX,
    direction,
  });
  res.json({ ok: true });
});

const KNOWN_ROLES = new Set(["developer", "planner", "reviewer", "tester", "githubber", "merger"]);

app.get("/memory/:role", async (req, res) => {
  const { role } = req.params;
  if (!KNOWN_ROLES.has(role)) return res.status(400).json({ error: "Unknown role" });
  const { projectPath } = req.query;
  const entries = projectPath
    ? await getMemoryByProject(role, projectPath)
    : await getMemory(role);
  res.json(entries);
});

app.get("/memory", async (req, res) => {
  const { projectPath } = req.query;
  const all = projectPath
    ? await getAllMemoryByProject(projectPath)
    : await getAllMemory();
  res.json(all);
});

// --- Visual test endpoint (standalone, like evaluator) ---

const __filename_idx = fileURLToPath(import.meta.url);
const __dirname_idx = dirname(__filename_idx);
const VISUAL_TESTER_DIR = join(__dirname_idx, "..", "agents", "visual-tester");

app.post("/visual-test", async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) return res.status(400).json({ error: "projectPath required" });

  if (activeVisualTests.has(projectPath)) {
    return res.status(409).json({ error: "visual test already running for this project" });
  }

  // Discover tasks in merging.awaitingApproval for this project
  const eligibleTasks = [];
  for (const [id, actor] of actors) {
    if (actor._projectPath !== projectPath) continue;
    const snap = actor.getSnapshot();
    const sk = stateKey(snap.value);
    if (sk === "merging.awaitingApproval") {
      eligibleTasks.push({
        id,
        branchName: snap.context.result?.branchName,
        worktreePath: snap.context.result?.worktreePath,
        description: actor._description,
      });
    }
  }

  if (eligibleTasks.length === 0) {
    return res.status(400).json({ error: "No tasks awaiting PR approval" });
  }

  const vtId = `vt-${Date.now()}`;

  broadcast({ type: "VISUAL_TEST_STARTED", projectPath, vtId, taskCount: eligibleTasks.length });

  // Write tasks to a temp file for the script to read
  const tmpDir = join(tmpdir(), "agents-vt");
  mkdirSync(tmpDir, { recursive: true });
  const tasksFile = join(tmpDir, `tasks-${vtId}.json`);
  writeFileSync(tasksFile, JSON.stringify(eligibleTasks));

  // Spawn visual-test.mjs as child process
  const child = spawn("node", [
    join(VISUAL_TESTER_DIR, "visual-test.mjs"),
    "--projectPath", projectPath,
    "--tasksFile", tasksFile,
  ], {
    cwd: projectPath,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let resultParsed = false;

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    broadcast({ type: "AGENT_OUTPUT", taskId: vtId, agent: "visual-tester", stream: "stdout", data: chunk.toString() });

    // Parse status updates
    const lines = stdout.split("\n");
    for (const line of lines) {
      if (line.startsWith(":::STATUS:::")) {
        try {
          const status = JSON.parse(line.replace(":::STATUS:::", "").trim());
          broadcast({ type: "VISUAL_TEST_PROGRESS", projectPath, vtId, status });
        } catch {}
      }
    }

    // Parse final result
    const startIdx = stdout.indexOf(":::RESULT_START:::");
    const endIdx = stdout.indexOf(":::RESULT_END:::");
    if (startIdx >= 0 && endIdx > startIdx && !resultParsed) {
      resultParsed = true;
      const resultStr = stdout.substring(startIdx + ":::RESULT_START:::".length, endIdx).trim();
      try {
        const result = JSON.parse(resultStr);
        const timestamp = new Date().toISOString();
        const lastVisualTest = { ...result, timestamp };

        // Persist to project settings
        dbUpdateProjectSettings(projectPath, { lastVisualTest })
          .catch((err) => console.error("Failed to persist visual test result:", err));

        broadcast({ type: "VISUAL_TEST_COMPLETE", projectPath, result: lastVisualTest });
      } catch (err) {
        console.error("Failed to parse visual test result:", err);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    broadcast({ type: "AGENT_OUTPUT", taskId: vtId, agent: "visual-tester", stream: "stderr", data: chunk.toString() });
  });

  child.on("close", () => {
    activeVisualTests.delete(projectPath);
    // Clean up temp file
    try { unlinkSync(tasksFile); } catch {}

    if (!resultParsed) {
      broadcast({ type: "VISUAL_TEST_COMPLETE", projectPath, result: { status: "failed", error: "Visual test exited without result", results: [], timestamp: new Date().toISOString() } });
    }
  });

  activeVisualTests.set(projectPath, { vtId, child });
  res.status(202).json({ vtId, taskCount: eligibleTasks.length });
});

// --- Screenshot serving ---

app.get("/screenshots", (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== "string") {
    return res.status(400).json({ error: "path query param required" });
  }

  // Validate the path is under a known project directory
  const isUnderProject = Array.from(actors.values()).some((a) => filePath.startsWith(a._projectPath));
  if (!isUnderProject) {
    return res.status(403).json({ error: "path not under a known project" });
  }

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "file not found" });
  }

  res.sendFile(filePath);
});

// --- Evaluate endpoint ---

app.post("/evaluate", async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) return res.status(400).json({ error: "projectPath required" });

  if (activeEvaluations.has(projectPath)) {
    return res.status(409).json({ error: "evaluation already running for this project" });
  }

  const evalId = `eval-${Date.now()}`;

  broadcast({ type: "EVALUATION_STARTED", projectPath, evalId });

  const handoff = {
    instruction: `Evaluate code quality for project at ${projectPath}`,
    projectPath,
    context: {},
  };

  // Register result callback so /internal/agent-result can call it when the evaluator finishes
  evaluationCallbacks.set(evalId, {
    projectPath,
    async onResult(result) {
      const timestamp = new Date().toISOString();
      const lastEvaluation = { ...result, timestamp };

      // Persist to project settings
      try {
        await dbUpdateProjectSettings(projectPath, { lastEvaluation });
      } catch (err) {
        console.error("Failed to persist evaluation result:", err);
      }

      broadcast({ type: "EVALUATION_COMPLETE", projectPath, result: lastEvaluation });
      activeEvaluations.delete(projectPath);
    },
  });

  runAgent("evaluator", evalId, handoff, {
    onStdout(data) {
      broadcast({ type: "AGENT_OUTPUT", taskId: evalId, agent: "evaluator", stream: "stdout", data });
    },
    onStderr(data) {
      broadcast({ type: "AGENT_OUTPUT", taskId: evalId, agent: "evaluator", stream: "stderr", data });
    },
    onStatus(status) {
      broadcast({ type: "AGENT_STATUS", taskId: evalId, agent: "evaluator", status });
    },
    onExit() {
      // Always clean up locks, even if no result was received
      evaluationCallbacks.delete(evalId);
      activeEvaluations.delete(projectPath);
    },
  });

  activeEvaluations.set(projectPath, evalId);
  res.status(202).json({ evalId });
});

// --- WebSocket ---

wss.on("connection", async (ws, req) => {
  // Auth check for WebSocket
  const cookies = parseCookies(req.headers.cookie);
  const session = cookies.session ? sessions.get(cookies.session) : undefined;
  if (!session) {
    ws.close(4001, "Unauthorized");
    return;
  }

  // Send current state of all tasks on connect
  const dbTasks = await dbGetAllTasks();
  const list = dbTasks.map((t) => {
    const actor = actors.get(t.id);
    return actor ? getTaskSnapshot(t.id) : t;
  });

  // Include persisted logs for active (non-terminal) tasks
  const logs = {};
  for (const t of dbTasks) {
    const sk = typeof t.state === "string" ? t.state : stateKey(t.state);
    if (sk !== "done" && sk !== "failed") {
      const taskLogs = await getTaskLogs(t.id);
      if (taskLogs.length > 0) {
        logs[t.id] = taskLogs;
      }
    }
  }

  ws.send(JSON.stringify({ type: "INIT", tasks: list, logs }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "SEND_EVENT" && msg.taskId && msg.event) {
        const actor = actors.get(msg.taskId);
        if (actor) actor.send(msg.event);
      }
    } catch {}
  });
});

// --- Start ---

async function start() {
  // Ensure agent configs are loaded before anything else
  await ensureConfigsLoaded();

  // Seed config from config.json if no projects exist yet
  const existingProjects = await getProjects();
  if (existingProjects.length === 0) {
    try {
      const { readFileSync } = await import("fs");
      const { join, dirname } = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const configFile = JSON.parse(readFileSync(join(__dirname, "..", "config.json"), "utf-8"));
      await seedConfig(configFile);
      console.log("Seeded config from config.json");
    } catch {
      console.warn("No config.json found, starting with empty config");
    }
  }

  // Rehydrate active tasks (non-terminal states) as XState actors
  const dbTasks = await dbGetAllTasks();
  for (const task of dbTasks) {
    if (task.state === "done" || task.state === "failed") continue;

    // Handle legacy flat state values
    const sk = typeof task.state === "string" ? task.state : stateKey(task.state);

    console.log(`Rehydrating task ${task.id} (state: ${sk})`);
    const actor = createActor(workflowMachine);
    actor._description = task.description;
    actor._projectPath = task.projectPath;
    actor._createdAt = task.createdAt;

    actors.set(task.id, actor);
    wireActor(task.id, actor);
    actor.start();

    // Idle tasks should remain idle — don't send START
    if (sk === "idle") {
      console.log(`Task ${task.id} is idle, keeping in todo state`);
      continue;
    }

    // Replay events to get back to the persisted state — suppress side-effects during replay
    actor._rehydrating = true;
    actor.send({ type: "START", task: task.description });

    // Helper: build cumulative replay sequences
    const planReady = { type: "PLAN_READY", plan: task.context?.plan };
    const planApproved = { type: "PLAN_APPROVED" };
    const branchReady = { type: "BRANCH_READY", worktreePath: task.context?.result?.worktreePath, branchName: task.context?.result?.branchName };
    const codeComplete = { type: "CODE_COMPLETE", files: task.context?.result?.files || [] };
    const commitComplete = { type: "COMMIT_COMPLETE", files: task.context?.result?.files || [] };
    const testsPassed = { type: "TESTS_PASSED" };
    const reviewReady = { type: "REVIEW_READY", review: task.context?.review };
    const reviewApproved = { type: "REVIEW_APPROVED" };
    const pushComplete = { type: "PUSH_COMPLETE", branchName: task.context?.result?.branchName, diffSummary: task.context?.result?.diffSummary || "" };
    const pushCompleteNoPr = { type: "PUSH_COMPLETE_NO_PR", branchName: task.context?.result?.branchName, diffSummary: task.context?.result?.diffSummary || "" };
    const prApproved = { type: "PR_APPROVED" };

    const replayEvents = {
      "planning.running": [],
      "planning.awaitingApproval": [planReady],
      "branching": [planReady, planApproved],
      "developing": [planReady, planApproved, branchReady],
      "committing": [planReady, planApproved, branchReady, codeComplete],
      "testing": [planReady, planApproved, branchReady, codeComplete, commitComplete],
      "reviewing.running": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed],
      "reviewing.awaitingApproval": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed, reviewReady],
      // Legacy flat state name for backwards compat
      "reviewing": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed],
      "pushing": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed, reviewApproved],
      "directMerging": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed, reviewApproved, pushCompleteNoPr],
      "merging.awaitingApproval": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed, reviewApproved, pushComplete],
      "merging.creatingPr": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed, reviewApproved, pushComplete, prApproved],
      // Legacy flat state names for backwards compat
      "planning": [],
      "merging": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed, reviewApproved],
      "merging.running": [planReady, planApproved, branchReady, codeComplete, commitComplete, testsPassed, reviewApproved],
    };

    const events = replayEvents[sk];
    if (events) {
      for (const event of events) {
        actor.send(event);
      }
    }

    // Replay complete — re-enable side-effects
    actor._rehydrating = false;

    // For tasks that were mid-flight in planning.running, re-spawn the planner agent
    if (sk === "planning.running" || sk === "planning") {
      const snap = actor.getSnapshot();
      onStateTransition(task.id, snap.value, snap.context);
    }

    // For tasks that were mid-flight in reviewing.running, re-spawn the reviewer agent
    if (sk === "reviewing.running") {
      const snap = actor.getSnapshot();
      onStateTransition(task.id, snap.value, snap.context);
    }

    // For tasks awaiting plan approval, broadcast PLAN_READY so connected clients can show the dialog
    if (sk === "planning.awaitingApproval" && task.context?.plan) {
      broadcast({
        type: "PLAN_READY",
        taskId: task.id,
        plan: task.context.plan,
      });
    }

    // For tasks awaiting review approval, broadcast REVIEW_READY so connected clients can show the dialog
    if (sk === "reviewing.awaitingApproval" && task.context?.review) {
      broadcast({
        type: "REVIEW_READY",
        taskId: task.id,
        review: task.context.review,
      });
    }
  }

  // --- Ivy Studio launcher endpoint ---
  // Opens a new Terminal.app window running the ivy-studio-local.sh script

  app.post("/ivy-studio", async (req, res) => {
    const { branch } = req.body;
    if (!branch) return res.status(400).json({ error: "branch required" });

    const scriptPath = join(process.env.HOME, "scripts", "ivy-studio-local.sh");

    if (!existsSync(scriptPath)) {
      return res.status(500).json({ error: `Script not found: ${scriptPath}` });
    }

    // Use osascript to open a new Terminal.app window running the script
    const appleScript = `tell application "Terminal"
  activate
  do script "bash ${scriptPath} --branch=${branch}"
end tell`;

    spawn("osascript", ["-e", appleScript], {
      stdio: "ignore",
      detached: true,
    }).unref();

    res.json({ launched: true, branch });
  });

  // SPA catch-all: serve index.html for non-API routes (production)
  if (existsSync(distPath)) {
    app.get("/{*splat}", (req, res) => {
      res.sendFile(join(distPath, "index.html"));
    });
  }

  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || "localhost";
  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`WebSocket on ws://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// Prevent unhandled errors from crashing the server
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server staying up):", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (server staying up):", err);
});
