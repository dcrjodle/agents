import { z } from "zod/v4";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const tools = [
  {
    name: "spawn_file_agent",
    description:
      "Spawn a file-developer sub-agent to implement changes for a single file. The sub-agent will read the file, make surgical edits, and return a summary. Use this to delegate file-level implementation tasks. Wait for the result before spawning the next agent.",
    inputSchema: {
      filePath: z.string().describe("Absolute path to the file to modify or create"),
      taskDescription: z.string().describe("Detailed description of what changes to make to this file"),
      worktreePath: z.string().describe("Absolute path to the worktree where changes should be made"),
      planContext: z.string().optional().describe("Relevant context from the overall plan (optional)"),
    },
    handler: async ({ filePath, taskDescription, worktreePath, planContext }) => {
      try {
        // Dynamic import to avoid circular dependency at load time
        const { spawnSubAgent, ensureConfigsLoaded } = await import(
          join(__dirname, "../../../server/agent-runner.js")
        );

        // Ensure configs are loaded before spawning
        await ensureConfigsLoaded();

        // Build handoff object for the file-developer sub-agent
        const handoff = {
          instruction: `Implement changes for file: ${filePath}`,
          projectPath: worktreePath, // Sub-agent works in worktree
          context: {
            filePath,
            taskDescription,
            worktreePath,
            planContext: planContext || "",
            result: {
              worktreePath,
            },
          },
        };

        // Generate a unique task ID for this sub-agent
        const parentTaskId = `file-dev-${Date.now()}`;

        // Spawn the sub-agent and wait for result
        const result = await spawnSubAgent("file-developer", parentTaskId, handoff);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.status === "complete",
                file: filePath,
                changes: result.changes || result.message || "",
                error: result.error || null,
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                file: filePath,
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
