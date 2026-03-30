import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { runAgent as sdkRunAgent, clearSession, isBashAgent, ensureConfigsLoaded, getAgentConfig } from "./agent-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, "..", "scripts");

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
  "reviewing.running": "reviewer",
  "merging.creatingPr": "githubber",
  "directMerging": "merger",
};

// Map XState states to deterministic scripts (no Claude)
const STATE_TO_SCRIPT = {
  "branching": "create-worktree.sh",
  "committing": "commit-changes.sh",
  "pushing": "push-branch.sh",
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
    files: payload.filesChanged || [],
    error: payload.error,
  }),
  tester: (payload) => ({
    type: payload.status === "complete" ? "TESTS_PASSED" : "TESTS_FAILED",
    error: payload.error,
  }),
  reviewer: (payload) => {
    if (payload.status === "complete" || payload.verdict) {
      return {
        type: "REVIEW_READY",
        review: {
          markdown: payload.markdown || payload.summary || payload.message || "",
          verdict: payload.verdict || "changes_requested",
          feedback: payload.summary || payload.comments?.join("\n") || "",
        },
      };
    }
    return { type: "REVIEW_FAILED", error: payload.error || "Review failed" };
  },
  githubber: (payload) => {
    if (payload.status === "complete") {
      return { type: "MERGED", url: payload.prUrl, prTitle: payload.prTitle };
    }
    return { type: "PR_FAILED", error: payload.error };
  },
  // Deterministic script result mappers
  "script:branching": (payload) => {
    if (payload.status === "complete") {
      return { type: "BRANCH_READY", worktreePath: payload.worktreePath, branchName: payload.branchName };
    }
    return { type: "BRANCH_FAILED", error: payload.error };
  },
  "script:committing": (payload) => {
    if (payload.status === "complete") {
      return { type: "COMMIT_COMPLETE", files: payload.files || [] };
    }
    return { type: "COMMIT_FAILED", error: payload.error };
  },
  "script:pushing": (payload) => {
    if (payload.status === "complete") {
      return { type: "PUSH_COMPLETE", branchName: payload.branchName, diffSummary: payload.diffSummary };
    }
    return { type: "PUSH_FAILED", error: payload.error };
  },
  merger: (payload) => {
    if (payload.status === "complete") {
      return { type: "DIRECT_MERGE_COMPLETE" };
    }
    return { type: "DIRECT_MERGE_FAILED", error: payload.error };
  },
};

/**
 * Get the result-to-event mapper key for a given state key.
 */
function getMapperKey(sk) {
  if (STATE_TO_SCRIPT[sk]) return `script:${sk}`;
  const role = STATE_TO_ROLE[sk];
  if (!role) return null;
  return role;
}

/**
 * Spawn a deterministic script (no Claude) for a given state.
 * Uses the stdio protocol (:::STATUS:::, :::RESULT_START:::).
 */
export function spawnScript(sk, taskId, handoffContext, options = {}) {
  const scriptName = STATE_TO_SCRIPT[sk];
  if (!scriptName) {
    console.error(`No script for state: ${sk}`);
    return { pid: null, kill: () => {} };
  }

  const scriptPath = join(SCRIPTS_DIR, scriptName);

  const child = spawn("bash", [scriptPath], {
    cwd: SCRIPTS_DIR,
    env: {
      ...process.env,
      TASK_ID: taskId,
      TASK_DESCRIPTION: options.taskDescription || "",
      PROJECT_PATH: options.projectPath || "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Write handoff JSON to stdin, then close
  if (handoffContext) {
    child.stdin.write(JSON.stringify(handoffContext));
  }
  child.stdin.end();

  return _wireChildProcess(child, sk, taskId, `script:${sk}`, options);
}

/**
 * Spawn an agent via the Claude Agent SDK or Claude CLI (based on agentMode).
 * Delegates to agent-runner.js (SDK) or spawns headless claude CLI process.
 */
export function spawnAgent(sk, taskId, taskDescription, handoffContext, options = {}) {
  const role = STATE_TO_ROLE[sk];
  if (!role) {
    console.error(`No agent role for state: ${sk}`);
    return { pid: null, kill: () => {} };
  }

  // Bash-only agents (e.g. tester) always use child process
  if (isBashAgent(role)) {
    return _spawnBashAgent(sk, taskId, taskDescription, handoffContext, options);
  }

  // Route based on agentMode setting: "cli" uses headless Claude Code, "sdk" (default) uses Agent SDK
  if (options.agentMode === "cli") {
    return _spawnCliAgent(sk, taskId, taskDescription, handoffContext, options);
  }

  return sdkRunAgent(role, taskId, handoffContext, options);
}

/**
 * Spawn a headless Claude Code CLI process for an agent role.
 * Uses `claude --print` with stream-json output and the workflow MCP server
 * so the agent can call report_result, report_status, etc.
 */
function _spawnCliAgent(sk, taskId, taskDescription, handoffContext, options) {
  const role = STATE_TO_ROLE[sk];
  const config = getAgentConfig(role);

  if (!config || config.runtime === "bash") {
    console.error(`Cannot spawn CLI agent for role: ${role}`);
    return { pid: null, kill: () => {}, gotResult: () => false };
  }

  // Resolve CWD
  const cwd = config.getCwd(handoffContext);

  // Build the user prompt the same way the SDK path does
  const prompt = config.buildPrompt ? config.buildPrompt(handoffContext) : handoffContext.instruction;

  // Write MCP config to a temp file so claude CLI can load it
  const PORT = process.env.PORT || 3001;
  const mcpConfig = {
    mcpServers: {
      workflow: {
        command: "node",
        args: [join(__dirname, "mcp-server.js")],
        env: {
          TASK_ID: taskId,
          ORCHESTRATOR_URL: `http://localhost:${PORT}`,
        },
      },
    },
  };
  const mcpTmpDir = join(tmpdir(), "agents-mcp");
  mkdirSync(mcpTmpDir, { recursive: true });
  const mcpConfigPath = join(mcpTmpDir, `mcp-${taskId}-${Date.now()}.json`);
  writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig));

  // Build claude CLI args
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--dangerously-skip-permissions",
    "--model", "claude-sonnet-4-6",
    "--max-turns", "50",
    "--mcp-config", mcpConfigPath,
    "--bare",
  ];

  // Pass system prompt if the agent has one
  if (config.systemPrompt) {
    args.push("--system-prompt", config.systemPrompt);
  }

  // Pass allowed tools
  if (config.tools && config.tools.length > 0) {
    args.push("--allowedTools", ...config.tools);
  }

  // Pass the prompt as the positional argument
  args.push(prompt);

  const child = spawn("claude", args, {
    cwd,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

  let gotResult = false;
  let resultReceived = false;

  // Parse stream-json output from stdout
  let stdoutBuffer = "";
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        _handleCliStreamMessage(msg, role, taskId, options);
      } catch {
        // Not JSON — pass as raw stdout
        if (options.onStdout) options.onStdout(line + "\n");
      }
    }
  });

  // Stderr is diagnostic output from Claude CLI
  let stderrBuffer = "";
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop();

    for (const line of lines) {
      if (line.trim() && options.onStderr) {
        options.onStderr(line + "\n");
      }
    }
  });

  child.on("close", (code) => {
    // Flush remaining buffers
    if (stdoutBuffer.trim()) {
      try {
        const msg = JSON.parse(stdoutBuffer);
        _handleCliStreamMessage(msg, role, taskId, options);
      } catch {
        if (options.onStdout) options.onStdout(stdoutBuffer);
      }
    }
    if (stderrBuffer.trim() && options.onStderr) {
      options.onStderr(stderrBuffer);
    }

    // Clean up temp MCP config
    try { unlinkSync(mcpConfigPath); } catch {}

    if (options.onExit) options.onExit(code);
  });

  child.on("error", (err) => {
    console.error(`Failed to spawn CLI agent ${role}:`, err);
    if (options.onExit) options.onExit(1);
  });

  return {
    pid: child.pid,
    kill: () => child.kill("SIGTERM"),
    gotResult: () => gotResult,
    markResultReceived: () => { resultReceived = true; gotResult = true; },
  };
}

/**
 * Handle a single stream-json message from the Claude CLI.
 * Extracts text output from assistant messages to forward to the UI.
 */
function _handleCliStreamMessage(msg, role, taskId, options) {
  // Stream-json emits various message types. We care about assistant text output.
  if (msg.type === "assistant" && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === "text" && block.text) {
        if (options.onStdout) options.onStdout(block.text + "\n");
      }
    }
  } else if (msg.type === "result" && msg.subtype === "error") {
    if (options.onStderr) options.onStderr(`CLI agent error: ${msg.error}\n`);
  }
}

/**
 * Spawn a bash-based agent (only used for tester which doesn't use Claude).
 */
function _spawnBashAgent(sk, taskId, taskDescription, handoffContext, options) {
  const role = STATE_TO_ROLE[sk];
  const AGENTS_DIR = join(__dirname, "..", "agents");
  const scriptPath = join(AGENTS_DIR, role, "start.sh");

  const child = spawn("bash", [scriptPath], {
    cwd: join(AGENTS_DIR, role),
    env: {
      ...process.env,
      TASK_ID: taskId,
      TASK_DESCRIPTION: taskDescription,
      PROJECT_PATH: options.projectPath || "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (handoffContext) {
    child.stdin.write(JSON.stringify(handoffContext));
  }
  child.stdin.end();

  return _wireChildProcess(child, sk, taskId, role, options);
}

/**
 * Wire up stdio parsing for a child process (used by scripts and tester).
 */
function _wireChildProcess(child, sk, taskId, label, options) {
  let gotResult = false;

  // Parse stderr: lines starting with :::STATUS::: are status updates
  let stderrBuffer = "";
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop(); // keep incomplete last line in buffer

    for (const line of lines) {
      const statusMatch = line.match(/^:::STATUS:::\s*(.+)$/);
      const claudeMatch = line.match(/^:::CLAUDE:::\s?(.*)$/);
      if (statusMatch) {
        try {
          const status = JSON.parse(statusMatch[1]);
          if (options.onStatus) options.onStatus(status);
        } catch (err) {
          console.error("Failed to parse status:", statusMatch[1], err);
        }
      } else if (claudeMatch) {
        if (options.onStdout) options.onStdout(claudeMatch[1] + "\n");
      } else if (options.onStderr) {
        options.onStderr(line + "\n");
      }
    }
  });

  // Buffer stdout — extract result between markers on close
  let stdoutBuffer = "";
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
  });

  child.on("close", (code) => {
    // Flush remaining stderr
    if (stderrBuffer.length > 0) {
      const statusMatch = stderrBuffer.match(/^:::STATUS:::\s*(.+)$/);
      const claudeMatch = stderrBuffer.match(/^:::CLAUDE:::\s?(.*)$/);
      if (statusMatch) {
        try {
          if (options.onStatus) options.onStatus(JSON.parse(statusMatch[1]));
        } catch {}
      } else if (claudeMatch) {
        if (options.onStdout) options.onStdout(claudeMatch[1] + "\n");
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
        gotResult = true;
        if (options.onResult) options.onResult(result);
      } catch (err) {
        console.error("Failed to parse result:", err, resultJson.substring(0, 200));
        if (options.onResult) {
          options.onResult({ status: "failed", error: `Failed to parse result: ${err.message}` });
        }
      }
    }

    if (options.onExit) options.onExit(code);
  });

  child.on("error", (err) => {
    console.error(`Failed to spawn ${label}:`, err);
    if (options.onExit) options.onExit(1);
  });

  return {
    pid: child.pid,
    kill: () => child.kill("SIGTERM"),
    gotResult: () => gotResult,
  };
}

export { STATE_TO_ROLE, STATE_TO_SCRIPT, RESULT_TO_EVENT, getMapperKey, clearSession, ensureConfigsLoaded };
