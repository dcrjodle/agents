import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve SDK cli.js path (same approach as server/agent-runner.js)
const sdkDir = dirname(require.resolve("@anthropic-ai/claude-agent-sdk"));
const CLI_JS_PATH = join(sdkDir, "cli.js");

const IVY_ROOT = join(process.env.HOME, "ivy");
const IVY_REPO = join(IVY_ROOT, "Ivy");
const RESULTS_DIR = resolve("public", "visual-tests");
const SCRIPT_PATH = join(process.env.HOME, "scripts", "ivy-studio-local.sh");

// Active test state
let activeTest = null;
let activeAbortController = null;

const SYSTEM_PROMPT = `You are a visual testing agent. Your job is to visually test a web application branch by:

1. Starting the application using the ivy-studio-local.sh script
2. Using Playwright to interact with and screenshot the running application
3. Generating a markdown report with your findings

You have access to bash and file tools. You are running in the Ivy repo directory.

## Available tools
- Bash: run shell commands
- Read/Write: read and write files

## Workflow

For each task you receive:
1. The application is already checked out on the correct branch
2. Run the ivy-studio-local.sh script in the background to start the application (it starts dotnet watch on Ivy.Studio.Dev and Ivy.Agent.Server)
3. Wait for the application to be ready (check that the port is responding)
4. Write a small Playwright test script that:
   - Launches a browser
   - Navigates to the running application
   - Takes screenshots of key views/pages
   - Captures any visual issues or interesting states
5. Run the Playwright test script with Node.js
6. Kill the ivy-studio processes when done
7. Write a markdown report to the specified output path with:
   - Task description and branch name
   - Screenshots (as relative image references)
   - Any visual observations or issues found
   - Pass/fail assessment

## Important notes
- The ivy-studio-local.sh script is at: ${SCRIPT_PATH}
- Save screenshots to the output directory provided in the prompt
- Playwright is available as a dependency (import from "playwright")
- The studio runs with dotnet watch — wait for it to be fully ready before screenshotting
- Kill all background processes before finishing
- Be thorough but efficient — focus on the most important visual aspects
`;

/**
 * Run a visual test agent for a single task.
 * Spawns a Claude Agent SDK session that interprets what testing is needed,
 * writes its own Playwright scripts, takes screenshots, and generates a report.
 */
async function testSingleTask(task, abortController, onProgress) {
  const { taskId, branchName, description } = task;
  const taskOutputDir = join(RESULTS_DIR, taskId);
  mkdirSync(taskOutputDir, { recursive: true });

  const markdownPath = join(taskOutputDir, "report.md");

  onProgress({ taskId, step: "agent-starting", message: `Spawning visual test agent for ${branchName}...` });

  const prompt = `
## Visual Test Task

**Task ID:** ${taskId}
**Branch:** ${branchName}
**Description:** ${description || "No description"}

The branch "${branchName}" is already checked out in the Ivy repo at ${IVY_REPO}.

**Output directory for screenshots:** ${taskOutputDir}
**Write your final markdown report to:** ${markdownPath}

Start the ivy-studio-local.sh script (at ${SCRIPT_PATH}) to launch the application, then use Playwright to take screenshots and assess the visual state. Write a comprehensive markdown report with embedded screenshot references.

When referencing screenshots in the markdown, use relative paths (just the filename).
`;

  try {
    const options = {
      abortController,
      cwd: IVY_REPO,
      pathToClaudeCodeExecutable: CLI_JS_PATH,
      systemPrompt: SYSTEM_PROMPT,
      tools: ["Bash", "Read", "Write", "Glob", "Grep"],
      allowedTools: ["Bash", "Read", "Write", "Glob", "Grep"],
      model: "claude-sonnet-4-6",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 30,
    };

    const q = query({ prompt, options });
    let agentOutput = "";

    for await (const msg of q) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            agentOutput += block.text + "\n";
            // Stream progress updates from agent output
            const lastLine = block.text.split("\n").filter(Boolean).pop();
            if (lastLine) {
              onProgress({ taskId, step: "agent-working", message: lastLine.slice(0, 100) });
            }
          }
        }
      }
    }

    // Check if the agent generated a report
    const reportExists = existsSync(markdownPath);

    // Find any screenshots the agent created
    const screenshots = [];
    if (existsSync(taskOutputDir)) {
      const { readdirSync } = await import("fs");
      for (const file of readdirSync(taskOutputDir)) {
        if (file.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
          screenshots.push(`/visual-tests/${taskId}/${file}`);
        }
      }
    }

    onProgress({ taskId, step: "done", message: `Agent completed for ${branchName}` });

    return {
      taskId,
      branchName,
      status: reportExists ? "complete" : "failed",
      markdownUrl: reportExists ? `/visual-tests/${taskId}/report.md` : null,
      screenshots,
      error: reportExists ? null : "Agent did not generate a report",
    };
  } catch (err) {
    onProgress({ taskId, step: "error", message: `Agent failed for ${branchName}: ${err.message}` });
    return {
      taskId,
      branchName,
      status: "failed",
      error: err.message,
      markdownUrl: null,
      screenshots: [],
    };
  }
}

async function runVisualTests(tasks, onProgress, onComplete) {
  const abortController = new AbortController();
  activeAbortController = abortController;
  const results = [];

  for (const task of tasks) {
    if (!activeTest || abortController.signal.aborted) break;

    onProgress({
      taskId: task.taskId,
      step: "starting",
      message: `Starting visual test for ${task.branchName} (${results.length + 1}/${tasks.length})...`,
    });

    const result = await testSingleTask(task, abortController, onProgress);
    results.push(result);
  }

  activeTest = null;
  activeAbortController = null;
  onComplete(results);
}

/**
 * Vite plugin that adds local visual testing endpoints.
 * Spawns one Agent SDK session per task to interpret, test, screenshot, and report.
 * Runs entirely in the Vite dev server process — no Express server contact.
 */
export default function visualTestPlugin() {
  const sseClients = new Set();

  function broadcast(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(msg); } catch { sseClients.delete(res); }
    }
  }

  return {
    name: "visual-test",
    configureServer(server) {
      // Serve visual-tests files statically
      mkdirSync(RESULTS_DIR, { recursive: true });

      // SSE endpoint for progress streaming
      server.middlewares.use("/visual-test/events", (req, res, next) => {
        if (req.method !== "GET") return next();
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write("data: {\"type\":\"connected\"}\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
      });

      // Trigger visual tests — one agent per task, sequentially
      server.middlewares.use("/visual-test/run", (req, res, next) => {
        if (req.method !== "POST") return next();

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const { tasks } = JSON.parse(body);
            if (!tasks || !tasks.length) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "No tasks provided" }));
              return;
            }

            if (activeTest) {
              res.writeHead(409, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Visual test already running" }));
              return;
            }

            activeTest = { tasks, startedAt: Date.now() };

            broadcast({ type: "VISUAL_TEST_STARTED", taskCount: tasks.length });

            runVisualTests(
              tasks,
              (progress) => broadcast({ type: "VISUAL_TEST_PROGRESS", ...progress }),
              (results) => {
                const timestamp = new Date().toISOString();
                broadcast({ type: "VISUAL_TEST_COMPLETE", results, timestamp });
              }
            );

            res.writeHead(202, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ started: true, taskCount: tasks.length }));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });

      // Cancel running test
      server.middlewares.use("/visual-test/cancel", (req, res, next) => {
        if (req.method !== "POST") return next();
        if (activeAbortController) activeAbortController.abort();
        activeTest = null;
        broadcast({ type: "VISUAL_TEST_CANCELLED" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ cancelled: true }));
      });

      // Get current status
      server.middlewares.use("/visual-test/status", (req, res, next) => {
        if (req.method !== "GET") return next();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ running: !!activeTest }));
      });
    },
  };
}
