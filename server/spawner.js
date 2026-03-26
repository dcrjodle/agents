import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, "..", "agents");

// Map XState states to agent roles
const STATE_TO_ROLE = {
  planning: "planner",
  developing: "developer",
  testing: "tester",
  reviewing: "reviewer",
  merging: "githubber",
};

// Map agent result types to XState events
const RESULT_TO_EVENT = {
  planner: (payload) => ({
    type: payload.status === "complete" ? "PLAN_COMPLETE" : "PLAN_FAILED",
    plan: payload.plan,
    error: payload.error,
  }),
  developer: (payload) => ({
    type: payload.status === "complete" ? "CODE_COMPLETE" : "CODE_FAILED",
    files: payload.filesChanged,
    error: payload.error,
  }),
  tester: (payload) => ({
    type: payload.status === "complete" ? "TESTS_PASSED" : "TESTS_FAILED",
    error: payload.error,
  }),
  reviewer: (payload) => {
    if (payload.verdict === "approved") {
      return { type: "REVIEW_APPROVED" };
    }
    return { type: "CHANGES_REQUESTED", feedback: payload.comments?.join("\n") || payload.message };
  },
  githubber: (payload) => ({
    type: payload.status === "complete" ? "MERGED" : "PR_FAILED",
    url: payload.prUrl,
    error: payload.error,
  }),
};

/**
 * Spawn an agent process for a given role and task.
 *
 * @param {string} role - Agent role (planner, developer, tester, reviewer, githubber)
 * @param {string} taskId - The task ID
 * @param {string} taskDescription - Human-readable task description
 * @param {string} mailboxPath - Path to the agent's mailbox directory
 * @param {object} options - Optional callbacks
 * @param {function} options.onStdout - Called with stdout chunks
 * @param {function} options.onStderr - Called with stderr chunks
 * @param {function} options.onExit - Called with exit code when process ends
 * @returns {{ pid: number, kill: function }}
 */
export function spawnAgent(role, taskId, taskDescription, mailboxPath, options = {}) {
  const scriptPath = join(AGENTS_DIR, role, "start.sh");

  const child = spawn("bash", [scriptPath, taskDescription, taskId], {
    cwd: join(AGENTS_DIR, role),
    env: {
      ...process.env,
      MAILBOX_DIR: mailboxPath,
      TASK_ID: taskId,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (options.onStdout) {
    child.stdout.on("data", (chunk) => options.onStdout(chunk.toString()));
  }
  if (options.onStderr) {
    child.stderr.on("data", (chunk) => options.onStderr(chunk.toString()));
  }

  child.on("exit", (code) => {
    if (options.onExit) options.onExit(code);
  });

  child.on("error", (err) => {
    console.error(`Failed to spawn ${role} agent:`, err);
    if (options.onExit) options.onExit(1);
  });

  return {
    pid: child.pid,
    kill: () => child.kill("SIGTERM"),
  };
}

export { STATE_TO_ROLE, RESULT_TO_EVENT };
