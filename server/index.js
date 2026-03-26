import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createActor } from "xstate";
import { v4 as uuid } from "uuid";
import { workflowMachine } from "../machine.js";
import {
  createMailbox,
  writeMessage,
  readMessages,
  watchOutbox,
  watchStatus,
  updateStatus,
  getMailboxPath,
  readOutbox,
} from "./mailbox.js";
import { spawnAgent, STATE_TO_ROLE, RESULT_TO_EVENT } from "./spawner.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// One XState actor per task — supports parallel workflows
const tasks = new Map();

// Track active agent processes and watchers per task
const activeAgents = new Map(); // taskId -> { handle, stopOutboxWatch, stopStatusWatch }

// State label mapping
const stateLabels = {
  idle: "todo",
  planning: "planned",
  developing: "in_progress",
  testing: "testing",
  reviewing: "reviewing",
  merging: "published",
  done: "published",
  failed: "failed",
};

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

function getTaskSnapshot(id) {
  const entry = tasks.get(id);
  if (!entry) return null;
  const snap = entry.actor.getSnapshot();
  return {
    id,
    description: entry.description,
    state: snap.value,
    label: stateLabels[snap.value] || snap.value,
    context: snap.context,
    createdAt: entry.createdAt,
  };
}

/**
 * Clean up any running agent for a task.
 */
function cleanupAgent(taskId) {
  const agent = activeAgents.get(taskId);
  if (!agent) return;
  if (agent.stopOutboxWatch) agent.stopOutboxWatch();
  if (agent.stopStatusWatch) agent.stopStatusWatch();
  if (agent.handle) agent.handle.kill();
  activeAgents.delete(taskId);
}

/**
 * When XState transitions to a state that has an agent, spawn it.
 * The coordinator:
 *  1. Creates the agent's mailbox
 *  2. Writes a handoff message to the inbox
 *  3. Spawns the Claude CLI process
 *  4. Watches the outbox for results
 *  5. Maps results to XState events
 */
async function onStateTransition(taskId, state, context) {
  const role = STATE_TO_ROLE[state];
  if (!role) return; // No agent for this state (idle, done, failed)

  // Clean up previous agent if any
  cleanupAgent(taskId);

  const entry = tasks.get(taskId);
  if (!entry) return;

  // 1. Create mailbox
  const mailboxPath = await createMailbox(taskId, role);

  // 2. Write handoff message
  const handoff = {
    from: "coordinator",
    to: role,
    type: "handoff",
    payload: {
      instruction: entry.description,
      context: {
        task: context.task,
        plan: context.plan,
        result: context.result,
        error: context.error,
        retries: context.retries,
      },
    },
  };
  await writeMessage(taskId, role, "inbox", handoff);

  // 3. Update status to spawning
  await updateStatus(taskId, role, { state: "spawning", startedAt: new Date().toISOString() });

  // 4. Spawn the agent
  const handle = spawnAgent(role, taskId, entry.description, mailboxPath, {
    onStdout(data) {
      broadcast({
        type: "AGENT_OUTPUT",
        taskId,
        agent: role,
        stream: "stdout",
        data,
      });
    },
    onStderr(data) {
      broadcast({
        type: "AGENT_OUTPUT",
        taskId,
        agent: role,
        stream: "stderr",
        data,
      });
    },
    async onExit(code) {
      broadcast({
        type: "AGENT_EXITED",
        taskId,
        agent: role,
        exitCode: code,
      });

      const agentEntry = activeAgents.get(taskId);
      if (agentEntry && !agentEntry.resultReceived) {
        // Fallback: poll the outbox for results the watcher may have missed
        try {
          const messages = await readOutbox(taskId, role);
          const resultMsg = messages.find((m) => m.type === "result" || m.type === "error" || m.type === "feedback");
          if (resultMsg) {
            agentEntry.resultReceived = true;
            broadcast({ type: "MESSAGE_SENT", taskId, message: resultMsg });
            const mapper = RESULT_TO_EVENT[role];
            if (mapper) {
              const event = mapper(resultMsg.payload);
              const taskEntry = tasks.get(taskId);
              if (taskEntry) taskEntry.actor.send(event);
            }
          } else if (code !== 0) {
            // Agent failed without writing a result
            const mapper = RESULT_TO_EVENT[role];
            if (mapper) {
              const event = mapper({ status: "failed", error: `Agent exited with code ${code}` });
              const taskEntry = tasks.get(taskId);
              if (taskEntry) taskEntry.actor.send(event);
            }
          } else {
            // Agent exited 0 but no result — still treat as success for stub agents
            console.warn(`Agent ${role} exited 0 with no outbox result for task ${taskId}`);
          }
        } catch (err) {
          console.error(`Failed to read outbox on exit for ${role}:`, err);
        }
      }
      cleanupAgent(taskId);
    },
  });

  broadcast({
    type: "AGENT_SPAWNED",
    taskId,
    agent: role,
    pid: handle.pid,
  });

  // 5. Watch outbox for results
  const stopOutboxWatch = watchOutbox(taskId, role, (message) => {
    if (message.type === "result" || message.type === "error" || message.type === "feedback") {
      const agentEntry = activeAgents.get(taskId);
      if (agentEntry) agentEntry.resultReceived = true;

      broadcast({ type: "MESSAGE_SENT", taskId, message });

      // Map to XState event
      const mapper = RESULT_TO_EVENT[role];
      if (mapper) {
        const event = mapper(message.payload);
        const taskEntry = tasks.get(taskId);
        if (taskEntry) taskEntry.actor.send(event);
      }
    }
  });

  // 6. Watch status for UI updates
  const stopStatusWatch = watchStatus(taskId, role, (status) => {
    broadcast({ type: "AGENT_STATUS", taskId, agent: role, status });
  });

  activeAgents.set(taskId, {
    handle,
    stopOutboxWatch,
    stopStatusWatch,
    resultReceived: false,
  });
}

// --- REST API ---

app.get("/tasks", (req, res) => {
  const list = [];
  for (const id of tasks.keys()) {
    list.push(getTaskSnapshot(id));
  }
  res.json(list);
});

app.post("/tasks", (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "description required" });

  const id = uuid();
  const actor = createActor(workflowMachine);

  let prevState = "idle";

  actor.subscribe((snapshot) => {
    const newState = snapshot.value;

    broadcast({
      type: "STATE_UPDATE",
      taskId: id,
      state: newState,
      label: stateLabels[newState] || newState,
      context: snapshot.context,
    });

    // Trigger agent spawning on state transitions
    if (newState !== prevState) {
      prevState = newState;
      onStateTransition(id, newState, snapshot.context).catch((err) => {
        console.error(`Failed to handle transition to ${newState}:`, err);
      });
    }
  });

  actor.start();
  tasks.set(id, { actor, description, createdAt: new Date().toISOString() });

  // Immediately start the workflow
  actor.send({ type: "START", task: description });

  const snapshot = getTaskSnapshot(id);
  broadcast({ type: "TASK_CREATED", task: snapshot });
  res.status(201).json(snapshot);
});

app.post("/tasks/:id/event", (req, res) => {
  const entry = tasks.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "task not found" });

  const { event } = req.body;
  if (!event?.type) return res.status(400).json({ error: "event.type required" });

  entry.actor.send(event);
  res.json(getTaskSnapshot(req.params.id));
});

app.delete("/tasks/:id", (req, res) => {
  const entry = tasks.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "task not found" });

  cleanupAgent(req.params.id);
  entry.actor.stop();
  tasks.delete(req.params.id);
  broadcast({ type: "TASK_DELETED", taskId: req.params.id });
  res.json({ ok: true });
});

// --- WebSocket ---

wss.on("connection", (ws) => {
  // Send current state of all tasks on connect
  const list = [];
  for (const id of tasks.keys()) list.push(getTaskSnapshot(id));
  ws.send(JSON.stringify({ type: "INIT", tasks: list }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "SEND_EVENT" && msg.taskId && msg.event) {
        const entry = tasks.get(msg.taskId);
        if (entry) entry.actor.send(msg.event);
      }
    } catch {}
  });
});

// --- Start ---

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket on ws://localhost:${PORT}`);
});
