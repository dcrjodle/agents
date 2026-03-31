import { z } from "zod/v4";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run the visual-test.mjs script and capture its output.
 */
async function runVisualTest(projectPath, tasks) {
  return new Promise((resolve, reject) => {
    // Create a temp file with tasks
    const tasksFile = join(projectPath, `.visual-test-tasks-${randomUUID()}.json`);
    writeFileSync(tasksFile, JSON.stringify(tasks));

    const visualTestScript = join(__dirname, "../visual-test.mjs");
    const child = spawn("node", [visualTestScript, "--projectPath", projectPath, "--tasksFile", tasksFile], {
      cwd: projectPath,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      // Clean up temp file
      try {
        unlinkSync(tasksFile);
      } catch {}

      // Parse the result from stdout
      const resultMatch = stdout.match(/:::RESULT_START:::\n([\s\S]*?)\n:::RESULT_END:::/);
      if (resultMatch) {
        try {
          const result = JSON.parse(resultMatch[1]);
          resolve(result);
        } catch (e) {
          resolve({ status: "failed", error: `Failed to parse result: ${e.message}`, raw: stdout });
        }
      } else {
        resolve({
          status: code === 0 ? "complete" : "failed",
          error: code !== 0 ? `Process exited with code ${code}: ${stderr}` : null,
          raw: stdout,
        });
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

export const tools = [
  {
    name: "run_visual_test",
    description:
      "Run visual tests for specified tasks using Playwright. Captures screenshots of the running application after cherry-picking commits from worktrees.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
      tasks: z
        .array(
          z.object({
            id: z.string().describe("Unique task identifier"),
            description: z.string().optional().describe("Task description"),
            worktreePath: z.string().describe("Path to the worktree containing the commits to test"),
          })
        )
        .describe("Array of tasks to run visual tests for"),
    },
    handler: async ({ projectPath, tasks }) => {
      try {
        const result = await runVisualTest(projectPath, tasks);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "failed",
                error: err.message,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  },
];
