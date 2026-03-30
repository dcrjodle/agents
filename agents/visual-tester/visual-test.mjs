import { chromium } from "playwright";
import { spawn, execSync } from "child_process";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createServer } from "net";

// Parse CLI args
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith("--") && i + 1 < arr.length) {
      acc.push([arg.slice(2), arr[i + 1]]);
    }
    return acc;
  }, [])
);

const { projectPath, tasksFile } = args;

if (!projectPath || !tasksFile) {
  console.error("Usage: visual-test.mjs --projectPath <path> --tasksFile <path>");
  process.exit(1);
}

const tasks = JSON.parse(readFileSync(tasksFile, "utf-8"));

// Track current temp branch for cleanup on crash/signal
let currentTempBranch = null;

function emitStatus(msg) {
  process.stderr.write(`:::STATUS::: ${JSON.stringify({ currentStep: msg })}\n`);
}

function emitResult(result) {
  process.stdout.write(":::RESULT_START:::\n");
  process.stdout.write(JSON.stringify(result) + "\n");
  process.stdout.write(":::RESULT_END:::\n");
}

function git(...args) {
  return execSync(`git ${args.join(" ")}`, { cwd: projectPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function cleanupTempBranch(branchName) {
  if (!branchName) return;
  try {
    // Make sure we're on main first
    const current = git("rev-parse", "--abbrev-ref", "HEAD");
    if (current === branchName) {
      const mainBranch = detectMainBranch();
      git("checkout", mainBranch);
    }
    git("branch", "-D", branchName);
  } catch {}
  currentTempBranch = null;
}

function detectMainBranch() {
  try {
    return git("symbolic-ref", "refs/remotes/origin/HEAD").replace(/^refs\/remotes\/origin\//, "");
  } catch {
    return "main";
  }
}

/**
 * Find an available port starting from the given base.
 */
function findAvailablePort(base = 4100) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(base, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      if (base < 4200) resolve(findAvailablePort(base + 1));
      else reject(new Error("No available port found"));
    });
  });
}

/**
 * Detect the dev server command from package.json.
 */
function detectDevCommand(testPath) {
  try {
    const pkg = JSON.parse(readFileSync(join(testPath, "package.json"), "utf-8"));
    const scripts = pkg.scripts || {};
    if (scripts.dev) return "dev";
    if (scripts.start) return "start";
  } catch {}
  return null;
}

/**
 * Wait for a URL to respond (up to timeoutMs).
 */
async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Cleanup on signals
function handleSignal() {
  cleanupTempBranch(currentTempBranch);
  process.exit(1);
}
process.on("SIGTERM", handleSignal);
process.on("SIGINT", handleSignal);

async function testTask(task) {
  const tempBranch = `visual-test/${task.id}`;
  const mainBranch = detectMainBranch();

  emitStatus(`Testing task: ${task.description || task.id}`);

  // Create temp branch off main
  try {
    // Delete if leftover from previous run
    try { git("branch", "-D", tempBranch); } catch {}
    git("checkout", "-b", tempBranch, `origin/${mainBranch}`, "--no-track");
    currentTempBranch = tempBranch;
  } catch (err) {
    return { taskId: task.id, status: "failed", error: `Failed to create temp branch: ${err.message}` };
  }

  try {
    // Get commits from the worktree that are ahead of main
    let commits;
    try {
      commits = execSync(
        `git log --format=%H origin/${mainBranch}..HEAD --reverse`,
        { cwd: task.worktreePath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim().split("\n").filter(Boolean);
    } catch (err) {
      return { taskId: task.id, status: "failed", error: `Failed to get worktree commits: ${err.message}` };
    }

    if (commits.length === 0) {
      return { taskId: task.id, status: "failed", error: "No commits to cherry-pick" };
    }

    // Cherry-pick each commit
    for (const commit of commits) {
      try {
        git("cherry-pick", commit);
      } catch (err) {
        try { git("cherry-pick", "--abort"); } catch {}
        return { taskId: task.id, status: "failed", error: `Cherry-pick conflict on ${commit.slice(0, 8)}` };
      }
    }

    // Detect dev server
    const devCmd = detectDevCommand(projectPath);
    if (!devCmd) {
      return { taskId: task.id, status: "failed", error: "No dev or start script found in package.json" };
    }

    // Find available port
    const port = await findAvailablePort();
    emitStatus(`Starting dev server on port ${port} for task ${task.id}`);

    // Install deps if needed
    if (!existsSync(join(projectPath, "node_modules")) && existsSync(join(projectPath, "package-lock.json"))) {
      emitStatus("Installing dependencies");
      await new Promise((resolve) => {
        const install = spawn("npm", ["ci", "--ignore-scripts"], { cwd: projectPath, stdio: "pipe" });
        install.on("close", resolve);
      });
    }

    // Spawn dev server
    const devServer = spawn("npm", ["run", devCmd, "--", "--port", String(port)], {
      cwd: projectPath,
      stdio: "pipe",
      env: { ...process.env, PORT: String(port) },
    });

    devServer.stderr.on("data", (d) => process.stderr.write(d));
    devServer.stdout.on("data", (d) => process.stderr.write(d));

    const serverUrl = `http://localhost:${port}`;

    try {
      // Wait for server
      emitStatus(`Waiting for dev server for task ${task.id}`);
      const ready = await waitForServer(serverUrl);
      if (!ready) {
        return { taskId: task.id, status: "failed", error: `Dev server did not start within 30s on port ${port}` };
      }

      emitStatus(`Taking screenshot for task ${task.id}`);

      // Launch browser and take screenshot
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();

      await page.goto(serverUrl, { waitUntil: "networkidle", timeout: 30000 });

      // Save screenshot to project's .screenshots directory
      const screenshotDir = join(projectPath, ".screenshots");
      mkdirSync(screenshotDir, { recursive: true });
      const screenshotPath = join(screenshotDir, `${task.id}.png`);

      await page.screenshot({ path: screenshotPath, fullPage: false });
      await browser.close();

      return { taskId: task.id, status: "complete", screenshot: screenshotPath };
    } finally {
      devServer.kill("SIGTERM");
    }
  } finally {
    cleanupTempBranch(tempBranch);
  }
}

async function main() {
  // SAFETY CHECK: verify project dir is clean and on main
  emitStatus("Running safety checks");

  try {
    const status = git("status", "--porcelain");
    if (status) {
      emitResult({
        status: "failed",
        error: "Project directory has uncommitted changes — refusing to run visual tests",
        results: [],
      });
      return;
    }
  } catch (err) {
    emitResult({ status: "failed", error: `Git status check failed: ${err.message}`, results: [] });
    return;
  }

  const mainBranch = detectMainBranch();
  try {
    const currentBranch = git("rev-parse", "--abbrev-ref", "HEAD");
    if (currentBranch !== mainBranch && currentBranch !== "main" && currentBranch !== "master") {
      emitResult({
        status: "failed",
        error: `Project is on branch "${currentBranch}", not "${mainBranch}" — refusing to run visual tests`,
        results: [],
      });
      return;
    }
  } catch (err) {
    emitResult({ status: "failed", error: `Branch check failed: ${err.message}`, results: [] });
    return;
  }

  emitStatus(`Running visual tests for ${tasks.length} task(s)`);

  const results = [];
  for (const task of tasks) {
    try {
      const result = await testTask(task);
      results.push(result);
      emitStatus(`Task ${task.id}: ${result.status}`);
    } catch (err) {
      results.push({ taskId: task.id, status: "failed", error: err.message });
      // Ensure we're back on main after any failure
      cleanupTempBranch(currentTempBranch);
    }
  }

  const allPassed = results.every((r) => r.status === "complete");
  emitResult({
    status: allPassed ? "complete" : "partial",
    summary: `${results.filter((r) => r.status === "complete").length}/${results.length} tasks passed visual tests`,
    results,
  });
}

main().catch((err) => {
  cleanupTempBranch(currentTempBranch);
  emitResult({ status: "failed", error: err.message, results: [] });
  process.exit(0);
});
