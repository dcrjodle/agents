import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { watch } from "chokidar";
import { v4 as uuid } from "uuid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAILBOX_ROOT = join(__dirname, "..", "agents", "mailbox");

/**
 * Create the mailbox directory structure for an agent on a task.
 */
export async function createMailbox(taskId, agentRole) {
  const base = join(MAILBOX_ROOT, taskId, agentRole);
  await mkdir(join(base, "inbox"), { recursive: true });
  await mkdir(join(base, "outbox"), { recursive: true });
  return base;
}

/**
 * Get the mailbox path for an agent on a task.
 */
export function getMailboxPath(taskId, agentRole) {
  return join(MAILBOX_ROOT, taskId, agentRole);
}

/**
 * Write a message to an agent's inbox or outbox.
 * Returns the written message with id and sequence number.
 */
export async function writeMessage(taskId, agentRole, direction, message) {
  const dir = join(MAILBOX_ROOT, taskId, agentRole, direction);
  await mkdir(dir, { recursive: true });

  // Auto-increment sequence number
  const existing = existsSync(dir) ? await readdir(dir) : [];
  const seq = String(existing.length + 1).padStart(3, "0");
  const ts = Date.now();

  const fullMessage = {
    id: `msg_${uuid().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    ...message,
    taskId,
  };

  const filename = `${seq}-${ts}.json`;
  await writeFile(join(dir, filename), JSON.stringify(fullMessage, null, 2));
  return fullMessage;
}

/**
 * Read all messages from an agent's inbox or outbox, sorted by sequence.
 */
export async function readMessages(taskId, agentRole, direction) {
  const dir = join(MAILBOX_ROOT, taskId, agentRole, direction);
  if (!existsSync(dir)) return [];

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const messages = [];
  for (const file of files) {
    const content = await readFile(join(dir, file), "utf-8");
    messages.push(JSON.parse(content));
  }
  return messages;
}

/**
 * Write or update the agent's status.json file.
 */
export async function updateStatus(taskId, agentRole, status) {
  const base = join(MAILBOX_ROOT, taskId, agentRole);
  await mkdir(base, { recursive: true });
  const fullStatus = {
    agent: agentRole,
    taskId,
    lastActivity: new Date().toISOString(),
    ...status,
  };
  await writeFile(join(base, "status.json"), JSON.stringify(fullStatus, null, 2));
  return fullStatus;
}

/**
 * Read an agent's current status.
 */
export async function getStatus(taskId, agentRole) {
  const statusPath = join(MAILBOX_ROOT, taskId, agentRole, "status.json");
  if (!existsSync(statusPath)) return null;
  const content = await readFile(statusPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Watch an agent's outbox for new result files.
 * Calls `onMessage(message)` when a new file is added.
 * Returns a function to stop watching.
 */
export function watchOutbox(taskId, agentRole, onMessage) {
  const outboxDir = join(MAILBOX_ROOT, taskId, agentRole, "outbox");
  const seen = new Set();

  const watcher = watch(outboxDir, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on("add", async (filePath) => {
    if (seen.has(filePath) || !filePath.endsWith(".json")) return;
    seen.add(filePath);
    try {
      const content = await readFile(filePath, "utf-8");
      const message = JSON.parse(content);
      onMessage(message);
    } catch (err) {
      console.error(`Failed to read outbox message: ${filePath}`, err);
    }
  });

  return () => watcher.close();
}

/**
 * Watch an agent's status.json for updates.
 * Calls `onStatus(status)` when the file changes.
 * Returns a function to stop watching.
 */
export function watchStatus(taskId, agentRole, onStatus) {
  const statusPath = join(MAILBOX_ROOT, taskId, agentRole, "status.json");
  const statusDir = join(MAILBOX_ROOT, taskId, agentRole);

  const watcher = watch(statusPath, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on("change", async () => {
    try {
      const content = await readFile(statusPath, "utf-8");
      const status = JSON.parse(content);
      onStatus(status);
    } catch (err) {
      // status.json may be mid-write, ignore transient errors
    }
  });

  watcher.on("add", async () => {
    try {
      const content = await readFile(statusPath, "utf-8");
      const status = JSON.parse(content);
      onStatus(status);
    } catch (err) {}
  });

  return () => watcher.close();
}

/**
 * Read the latest result from an agent's outbox (non-watching).
 * Useful as a fallback when file watching misses the event.
 */
export async function readOutbox(taskId, agentRole) {
  return readMessages(taskId, agentRole, "outbox");
}

export { MAILBOX_ROOT };
