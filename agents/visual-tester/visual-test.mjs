import { chromium } from "playwright";
import { spawn } from "child_process";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, "..", "..", "scripts");

// Parse CLI args
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith("--") && i + 1 < arr.length) {
      acc.push([arg.slice(2), arr[i + 1]]);
    }
    return acc;
  }, [])
);

const { worktreePath, projectPath, testingMode, taskId } = args;

function emitStatus(msg) {
  process.stderr.write(`:::STATUS::: ${JSON.stringify({ currentStep: msg })}\n`);
}

function emitResult(result) {
  process.stdout.write(":::RESULT_START:::\n");
  process.stdout.write(JSON.stringify(result) + "\n");
  process.stdout.write(":::RESULT_END:::\n");
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

/**
 * Run the async-mode prep script (temp branch off main with cherry-picked commits).
 */
function prepareAsyncBranch() {
  return new Promise((resolve, reject) => {
    const script = join(SCRIPTS_DIR, "prepare-visual-test.sh");
    const child = spawn("bash", [script], {
      env: {
        ...process.env,
        PROJECT_PATH: projectPath,
        WORKTREE_PATH: worktreePath,
        TASK_ID: taskId,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim() || worktreePath);
      } else {
        reject(new Error(`prepare-visual-test.sh failed (code ${code}): ${stderr}`));
      }
    });
  });
}

async function main() {
  let testPath = worktreePath;
  let tempBranch = null;

  // For async mode, create temp branch off main with cherry-picked commits
  if (testingMode === "async") {
    emitStatus("Preparing temp branch for visual test");
    try {
      testPath = await prepareAsyncBranch();
      tempBranch = `visual-test/${taskId}`;
    } catch (err) {
      emitResult({ status: "failed", error: `Async prep failed: ${err.message}` });
      process.exit(0);
    }
  }

  // Detect dev server command
  const devCmd = detectDevCommand(testPath);
  if (!devCmd) {
    emitResult({ status: "failed", error: "No dev or start script found in package.json" });
    process.exit(0);
  }

  // Find available port
  const port = await findAvailablePort();
  emitStatus(`Starting dev server on port ${port}`);

  // Install deps if needed
  if (!existsSync(join(testPath, "node_modules")) && existsSync(join(testPath, "package-lock.json"))) {
    emitStatus("Installing dependencies");
    await new Promise((resolve) => {
      const install = spawn("npm", ["ci", "--ignore-scripts"], { cwd: testPath, stdio: "pipe" });
      install.on("close", resolve);
    });
  }

  // Spawn dev server
  const devServer = spawn("npm", ["run", devCmd, "--", "--port", String(port)], {
    cwd: testPath,
    stdio: "pipe",
    env: { ...process.env, PORT: String(port) },
  });

  devServer.stderr.on("data", (d) => process.stderr.write(d));
  devServer.stdout.on("data", (d) => process.stderr.write(d));

  const serverUrl = `http://localhost:${port}`;

  try {
    // Wait for server to be ready
    emitStatus("Waiting for dev server to be ready");
    const ready = await waitForServer(serverUrl);
    if (!ready) {
      emitResult({ status: "failed", error: `Dev server did not start within 30s on port ${port}` });
      return;
    }

    emitStatus("Taking screenshot");

    // Launch browser and take screenshot
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    await page.goto(serverUrl, { waitUntil: "networkidle", timeout: 30000 });

    // Ensure screenshots directory exists
    const screenshotDir = join(testPath, ".screenshots");
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, "home.png");

    await page.screenshot({ path: screenshotPath, fullPage: false });

    await browser.close();

    emitStatus("Visual test complete");
    emitResult({
      status: "complete",
      summary: "Visual test passed — screenshot captured",
      screenshot: screenshotPath,
    });
  } catch (err) {
    emitResult({ status: "failed", error: `Visual test error: ${err.message}` });
  } finally {
    // Kill dev server
    devServer.kill("SIGTERM");

    // Clean up temp branch for async mode
    if (tempBranch && projectPath) {
      try {
        spawn("git", ["-C", projectPath, "branch", "-D", tempBranch], { stdio: "pipe" });
      } catch {}
    }
  }
}

main().catch((err) => {
  emitResult({ status: "failed", error: err.message });
  process.exit(0);
});
