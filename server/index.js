import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createActor } from "xstate";
import { v4 as uuid } from "uuid";
import { workflowMachine } from "../machine.js";
import { spawnAgent, stateKey, STATE_TO_ROLE, RESULT_TO_EVENT, getMapperKey } from "./spawner.js";
import {
  getAllTasks as dbGetAllTasks,
  getTask as dbGetTask,
  createTask as dbCreateTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  getConfig,
  getDb,
} from "./db.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// In-memory XState actors keyed by task id
const actors = new Map();

// Track active agent processes per task
const activeAgents = new Map(); // taskId -> { handle, timeoutTimer, staleTimer }

// Agent timeout: kill agents that run too long (default 10 minutes)
const AGENT_TIMEOUT_MS = 10 * 60 * 1000;
// Stale check: warn if no output for 2 minutes
const AGENT_STALE_MS = 2 * 60 * 1000;

// State label mapping — handles both flat and compound states
function stateLabel(stateValue) {
  const sk = stateKey(stateValue);
  const labels = {
    "idle": "todo",
    "planning.running": "planning",
    "planning.awaitingApproval": "awaiting_approval",
    "developing": "in_progress",
    "testing": "testing",
    "reviewing": "reviewing",
    "merging.running": "merging",
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
 * When XState transitions to a state that has an agent, spawn it.
 */
function onStateTransition(taskId, stateValue, context) {
  const sk = stateKey(stateValue);
  const role = STATE_TO_ROLE[sk];
  if (!role) return;

  cleanupAgent(taskId);

  const actor = actors.get(taskId);
  if (!actor) return;

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

  // Track result locally — the activeAgents entry may be replaced by the next agent
  // before onExit fires (because onResult triggers an XState transition which spawns
  // the next agent synchronously, replacing this entry in activeAgents).
  let gotResult = false;

  const handle = spawnAgent(sk, taskId, actor._description, handoff, {
    projectPath: actor._projectPath,
    onStdout(data) {
      resetStaleTimer();
      broadcast({ type: "AGENT_OUTPUT", taskId, agent: role, stream: "stdout", data });
    },
    onStderr(data) {
      resetStaleTimer();
      broadcast({ type: "AGENT_OUTPUT", taskId, agent: role, stream: "stderr", data });
    },
    onStatus(status) {
      resetStaleTimer();
      broadcast({ type: "AGENT_STATUS", taskId, agent: role, status });
    },
    onResult(result) {
      resetStaleTimer();
      gotResult = true;
      const agentEntry = activeAgents.get(taskId);
      if (agentEntry) agentEntry.resultReceived = true;

      broadcast({ type: "AGENT_RESULT", taskId, agent: role, result });

      const mapper = mapperKey ? RESULT_TO_EVENT[mapperKey] : null;
      if (mapper) {
        const event = mapper(result);
        if (actors.has(taskId)) actors.get(taskId).send(event);
      }
    },
    onExit(code) {
      resetStaleTimer();
      broadcast({ type: "AGENT_EXITED", taskId, agent: role, exitCode: code });

      if (!gotResult) {
        // Agent exited without producing a result
        const error = code !== 0
          ? `Agent ${role} crashed with exit code ${code}`
          : `Agent ${role} exited without producing a result`;
        console.error(error);
        broadcast({ type: "AGENT_ERROR", taskId, agent: role, error });

        const mapper = mapperKey ? RESULT_TO_EVENT[mapperKey] : null;
        if (mapper) {
          const event = mapper({ status: "failed", error });
          if (actors.has(taskId)) actors.get(taskId).send(event);
        }
      }
    },
  });

  if (!handle.pid) {
    const error = `Failed to spawn ${role} agent — process did not start`;
    console.error(error);
    broadcast({ type: "AGENT_ERROR", taskId, agent: role, error });
    const mapper = mapperKey ? RESULT_TO_EVENT[mapperKey] : null;
    if (mapper) {
      const event = mapper({ status: "failed", error });
      if (actors.has(taskId)) actors.get(taskId).send(event);
    }
    return;
  }

  broadcast({ type: "AGENT_SPAWNED", taskId, agent: role, pid: handle.pid });

  // Timeout: kill agent if it runs too long
  const timeoutTimer = setTimeout(() => {
    const agentEntry = activeAgents.get(taskId);
    if (agentEntry && !agentEntry.resultReceived) {
      const error = `Agent ${role} timed out after ${AGENT_TIMEOUT_MS / 60000} minutes`;
      console.error(error);
      broadcast({ type: "AGENT_ERROR", taskId, agent: role, error });
      broadcast({ type: "AGENT_STATUS", taskId, agent: role, status: { state: "timeout", currentStep: error } });
      handle.kill();
    }
  }, AGENT_TIMEOUT_MS);

  // Stale detection: warn if no output for a while
  const staleTimer = setInterval(() => {
    const agentEntry = activeAgents.get(taskId);
    if (!agentEntry || agentEntry.resultReceived) {
      clearInterval(staleTimer);
      return;
    }
    const elapsed = Date.now() - lastActivity;
    if (elapsed >= AGENT_STALE_MS) {
      broadcast({ type: "AGENT_STATUS", taskId, agent: role, status: {
        state: "stale",
        currentStep: `No activity for ${Math.round(elapsed / 60000)} minutes — agent may be stuck`,
      }});
    }
  }, 30_000);

  activeAgents.set(taskId, { handle, resultReceived: false, timeoutTimer, staleTimer });
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

    // Spawn agent if state has one
    if (STATE_TO_ROLE[sk]) {
      onStateTransition(id, snapshot.value, snapshot.context);
    }

    // Broadcast PLAN_READY event when entering awaitingApproval in planning
    if (sk === "planning.awaitingApproval" && snapshot.context.plan) {
      broadcast({
        type: "PLAN_READY",
        taskId: id,
        plan: snapshot.context.plan,
      });
    }
  });
}

// --- REST API ---

app.get("/config", async (req, res) => {
  const config = await getConfig();
  res.json(config);
});

app.post("/config/projects", async (req, res) => {
  const { name, path } = req.body;
  if (!name || !path) return res.status(400).json({ error: "name and path required" });
  const db = await getDb();
  const exists = db.data.config.projects.some((p) => p.path === path);
  if (exists) return res.status(409).json({ error: "project already exists" });
  db.data.config.projects.push({ name, path });
  await db.write();
  res.status(201).json(db.data.config);
});

app.delete("/config/projects", async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: "path required" });
  const db = await getDb();
  const idx = db.data.config.projects.findIndex((p) => p.path === path);
  if (idx === -1) return res.status(404).json({ error: "project not found" });
  db.data.config.projects.splice(idx, 1);
  await db.write();
  res.json(db.data.config);
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
    actor.send({ type: "START", task: description });
  }

  const snapshot = getTaskSnapshot(id);
  broadcast({ type: "TASK_CREATED", task: snapshot });
  res.status(201).json(snapshot);
});

app.post("/tasks/:id/start", (req, res) => {
  const actor = actors.get(req.params.id);
  if (!actor) return res.status(404).json({ error: "task not found" });

  const snap = actor.getSnapshot();
  const sk = stateKey(snap.value);
  if (sk !== "idle") {
    return res.status(400).json({ error: `Task is in state "${sk}", can only start idle tasks` });
  }

  actor.send({ type: "START", task: actor._description });
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
    actor.send({ type: "PLAN_APPROVED" });
    broadcast({ type: "APPROVAL", taskId: req.params.id, approval: "plan", message: req.body.message || "Approved" });
    return res.json({ ok: true });
  }

  if (sk === "merging.awaitingApproval") {
    actor.send({ type: "PR_APPROVED" });
    broadcast({ type: "APPROVAL", taskId: req.params.id, approval: "pr", message: req.body.message || "Approved" });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: `Current state ${sk} is not an approval gate` });
});

app.delete("/tasks/:id", async (req, res) => {
  const actor = actors.get(req.params.id);
  if (actor) {
    cleanupAgent(req.params.id);
    actor.stop();
    actors.delete(req.params.id);
  }
  await dbDeleteTask(req.params.id);
  broadcast({ type: "TASK_DELETED", taskId: req.params.id });
  res.json({ ok: true });
});

// --- WebSocket ---

wss.on("connection", async (ws) => {
  // Send current state of all tasks on connect
  const dbTasks = await dbGetAllTasks();
  const list = dbTasks.map((t) => {
    const actor = actors.get(t.id);
    return actor ? getTaskSnapshot(t.id) : t;
  });
  ws.send(JSON.stringify({ type: "INIT", tasks: list }));

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
  // Initialize db
  const db = await getDb();

  // Seed config from config.json if db config is empty
  if (!db.data.config.projects || db.data.config.projects.length === 0) {
    try {
      const { readFileSync } = await import("fs");
      const { join, dirname } = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const configFile = JSON.parse(readFileSync(join(__dirname, "..", "config.json"), "utf-8"));
      db.data.config = configFile;
      await db.write();
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

    // Replay events to get back to the persisted state
    actor.send({ type: "START", task: task.description });

    const replayEvents = {
      "planning.running": [],
      "planning.awaitingApproval": [
        { type: "PLAN_READY", plan: task.context?.plan },
      ],
      "developing": [
        { type: "PLAN_READY", plan: task.context?.plan },
        { type: "PLAN_APPROVED" },
      ],
      "testing": [
        { type: "PLAN_READY", plan: task.context?.plan },
        { type: "PLAN_APPROVED" },
        { type: "CODE_COMPLETE", files: task.context?.result?.files, worktreePath: task.context?.result?.worktreePath, branchName: task.context?.result?.branchName },
      ],
      "reviewing": [
        { type: "PLAN_READY", plan: task.context?.plan },
        { type: "PLAN_APPROVED" },
        { type: "CODE_COMPLETE", files: task.context?.result?.files, worktreePath: task.context?.result?.worktreePath, branchName: task.context?.result?.branchName },
        { type: "TESTS_PASSED" },
      ],
      "merging.running": [
        { type: "PLAN_READY", plan: task.context?.plan },
        { type: "PLAN_APPROVED" },
        { type: "CODE_COMPLETE", files: task.context?.result?.files, worktreePath: task.context?.result?.worktreePath, branchName: task.context?.result?.branchName },
        { type: "TESTS_PASSED" },
        { type: "REVIEW_APPROVED" },
      ],
      "merging.awaitingApproval": [
        { type: "PLAN_READY", plan: task.context?.plan },
        { type: "PLAN_APPROVED" },
        { type: "CODE_COMPLETE", files: task.context?.result?.files, worktreePath: task.context?.result?.worktreePath, branchName: task.context?.result?.branchName },
        { type: "TESTS_PASSED" },
        { type: "REVIEW_APPROVED" },
        { type: "BRANCH_PUSHED", branchName: task.context?.result?.branchName, diffSummary: task.context?.result?.diffSummary || "" },
      ],
      "merging.creatingPr": [
        { type: "PLAN_READY", plan: task.context?.plan },
        { type: "PLAN_APPROVED" },
        { type: "CODE_COMPLETE", files: task.context?.result?.files, worktreePath: task.context?.result?.worktreePath, branchName: task.context?.result?.branchName },
        { type: "TESTS_PASSED" },
        { type: "REVIEW_APPROVED" },
        { type: "BRANCH_PUSHED", branchName: task.context?.result?.branchName, diffSummary: task.context?.result?.diffSummary || "" },
        { type: "PR_APPROVED" },
      ],
      // Legacy flat state names for backwards compat
      "planning": [],
      "merging": [
        { type: "PLAN_READY", plan: task.context?.plan },
        { type: "PLAN_APPROVED" },
        { type: "CODE_COMPLETE", files: task.context?.result?.files, worktreePath: task.context?.result?.worktreePath, branchName: task.context?.result?.branchName },
        { type: "TESTS_PASSED" },
        { type: "REVIEW_APPROVED" },
      ],
    };

    const events = replayEvents[sk];
    if (events) {
      for (const event of events) {
        actor.send(event);
      }
    }
  }

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket on ws://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
