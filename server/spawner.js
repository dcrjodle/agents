import { spawn, execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, "..", "agents");

// Resolve the claude CLI path — it may not be on PATH in non-interactive shells
function findClaudeCli() {
  // Check PATH first
  try {
    return execSync("which claude 2>/dev/null", { encoding: "utf-8" }).trim();
  } catch {}

  // Check common install locations
  const candidates = [
    join(homedir(), ".local", "bin", "claude"),
    join(homedir(), ".npm-global", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // macOS app bundle — find latest version
  try {
    const codeDir = join(homedir(), "Library", "Application Support", "Claude", "claude-code");
    if (existsSync(codeDir)) {
      const versions = readdirSync(codeDir).sort().reverse();
      for (const ver of versions) {
        const bin = join(codeDir, ver, "claude.app", "Contents", "MacOS", "claude");
        if (existsSync(bin)) return bin;
      }
    }
  } catch {}

  // Also check claude-code-vm
  try {
    const vmDir = join(homedir(), "Library", "Application Support", "Claude", "claude-code-vm");
    if (existsSync(vmDir)) {
      const versions = readdirSync(vmDir).sort().reverse();
      for (const ver of versions) {
        const bin = join(vmDir, ver, "claude");
        if (existsSync(bin)) return bin;
      }
    }
  } catch {}

  return "claude"; // fallback
}

const CLAUDE_CLI = findClaudeCli();
console.log(`Claude CLI resolved to: ${CLAUDE_CLI}`);

/**
 * Normalize XState compound state values to dot-notation strings.
 * e.g. { planning: "running" } → "planning.running"
 *      "developing" → "developing"
 */
export function stateKey(value) {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const [parent, child] = Object.entries(value)[0];
    if (typeof child === "string") return `${parent}.${child}`;
    // Deeper nesting — recurse
    return `${parent}.${stateKey(child)}`;
  }
  return String(value);
}

// Map XState states (dot-notation) to agent roles and config
const STATE_TO_ROLE = {
  "planning.running": "planner",
  "developing": "developer",
  "testing": "tester",
  "reviewing": "reviewer",
  "merging.running": "githubber",
  "merging.creatingPr": "githubber",
};

// Extra env vars per state
const STATE_ENV = {
  "merging.running": { AGENT_MODE: "push" },
  "merging.creatingPr": { AGENT_MODE: "create-pr" },
};

// Map agent result types to XState events
const RESULT_TO_EVENT = {
  planner: (payload) => {
    if (payload.status === "complete" || payload.status === "plan_ready") {
      return { type: "PLAN_READY", plan: payload.plan };
    }
    return { type: "PLAN_FAILED", error: payload.error };
  },
  developer: (payload) => ({
    type: payload.status === "complete" ? "CODE_COMPLETE" : "CODE_FAILED",
    files: payload.filesChanged,
    worktreePath: payload.worktreePath,
    branchName: payload.branchName,
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
  "githubber:push": (payload) => {
    if (payload.status === "complete") {
      return { type: "BRANCH_PUSHED", branchName: payload.branchName, diffSummary: payload.diffSummary };
    }
    return { type: "PR_FAILED", error: payload.error };
  },
  "githubber:create-pr": (payload) => {
    if (payload.status === "complete") {
      return { type: "MERGED", url: payload.prUrl };
    }
    return { type: "PR_FAILED", error: payload.error };
  },
};

/**
 * Get the result-to-event mapper key for a given state key.
 */
function getMapperKey(sk) {
  const role = STATE_TO_ROLE[sk];
  if (!role) return null;
  if (role === "githubber") {
    const mode = STATE_ENV[sk]?.AGENT_MODE || "push";
    return `githubber:${mode}`;
  }
  return role;
}

/**
 * Spawn an agent process for a given state.
 *
 * @param {string} sk - State key (dot-notation)
 * @param {string} taskId - The task ID
 * @param {string} taskDescription - Human-readable task description
 * @param {object} handoffContext - JSON object written to child's stdin
 * @param {object} options - Callbacks
 * @param {function} options.onStdout - Called with non-marker stdout data
 * @param {function} options.onStderr - Called with non-status stderr data
 * @param {function} options.onStatus - Called with parsed status objects
 * @param {function} options.onResult - Called with parsed result JSON
 * @param {function} options.onExit - Called with exit code when process ends
 * @param {string} options.projectPath - Path to the project directory
 * @returns {{ pid: number, kill: function }}
 */
export function spawnAgent(sk, taskId, taskDescription, handoffContext, options = {}) {
  const role = STATE_TO_ROLE[sk];
  if (!role) {
    console.error(`No agent role for state: ${sk}`);
    return { pid: null, kill: () => {} };
  }

  const scriptPath = join(AGENTS_DIR, role, "start.sh");
  const extraEnv = STATE_ENV[sk] || {};

  const child = spawn("bash", [scriptPath], {
    cwd: join(AGENTS_DIR, role),
    env: {
      ...process.env,
      TASK_ID: taskId,
      TASK_DESCRIPTION: taskDescription,
      PROJECT_PATH: options.projectPath || "",
      CLAUDE_CLI: CLAUDE_CLI,
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Write handoff JSON to stdin, then close
  if (handoffContext) {
    child.stdin.write(JSON.stringify(handoffContext));
  }
  child.stdin.end();

  // Parse stderr: lines starting with :::STATUS::: are status updates
  let stderrBuffer = "";
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop(); // keep incomplete last line in buffer

    for (const line of lines) {
      const statusMatch = line.match(/^:::STATUS:::\s*(.+)$/);
      if (statusMatch) {
        try {
          const status = JSON.parse(statusMatch[1]);
          if (options.onStatus) options.onStatus(status);
        } catch (err) {
          console.error("Failed to parse status:", statusMatch[1], err);
        }
      } else if (options.onStderr) {
        options.onStderr(line + "\n");
      }
    }
  });

  // Buffer stdout — extract result between markers on close
  let stdoutBuffer = "";
  let stdoutEnded = false;
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
  });
  child.stdout.on("end", () => {
    stdoutEnded = true;
  });

  // Use 'close' instead of 'exit' — 'close' fires after all stdio streams have ended,
  // ensuring stdoutBuffer is fully populated before we parse it.
  child.on("close", (code) => {
    // Flush remaining stderr
    if (stderrBuffer.length > 0) {
      const statusMatch = stderrBuffer.match(/^:::STATUS:::\s*(.+)$/);
      if (statusMatch) {
        try {
          if (options.onStatus) options.onStatus(JSON.parse(statusMatch[1]));
        } catch {}
      } else if (options.onStderr) {
        options.onStderr(stderrBuffer);
      }
      stderrBuffer = "";
    }

    // Extract result from stdout markers
    const startMarker = ":::RESULT_START:::";
    const endMarker = ":::RESULT_END:::";
    const startIdx = stdoutBuffer.indexOf(startMarker);
    const endIdx = stdoutBuffer.indexOf(endMarker);

    // Send non-marker stdout as regular output
    const preMarker = startIdx >= 0 ? stdoutBuffer.substring(0, startIdx) : stdoutBuffer;
    if (preMarker.trim() && options.onStdout) {
      options.onStdout(preMarker);
    }

    if (startIdx >= 0 && endIdx > startIdx) {
      const resultJson = stdoutBuffer.substring(startIdx + startMarker.length, endIdx).trim();
      try {
        const result = JSON.parse(resultJson);
        if (options.onResult) options.onResult(result);
      } catch (err) {
        console.error("Failed to parse agent result:", err, resultJson.substring(0, 200));
        if (options.onResult) {
          options.onResult({ status: "failed", error: `Failed to parse result: ${err.message}` });
        }
      }
    }

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

export { STATE_TO_ROLE, RESULT_TO_EVENT, getMapperKey };
