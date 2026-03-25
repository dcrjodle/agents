import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createActor } from "xstate";
import { v4 as uuid } from "uuid";
import { workflowMachine } from "../machine.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// One XState actor per task — supports parallel workflows
const tasks = new Map();

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

  actor.subscribe((snapshot) => {
    broadcast({
      type: "STATE_UPDATE",
      taskId: id,
      state: snapshot.value,
      label: stateLabels[snapshot.value] || snapshot.value,
      context: snapshot.context,
    });
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
