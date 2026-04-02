import { z } from "zod/v4";
import { execSync } from "child_process";

export const tools = [
  {
    name: "create_pr",
    description:
      "Create a GitHub pull request using the gh CLI. The branch must already be pushed to the remote.",
    inputSchema: {
      worktreePath: z.string().describe("Absolute path to the git worktree"),
      title: z.string().describe("PR title (under 70 characters)"),
      body: z.string().describe("PR body in markdown"),
      draft: z.boolean().optional().describe("Create PR as draft (default: false)"),
    },
    handler: async ({ worktreePath, title, body, draft }) => {
      try {
        const draftFlag = draft ? " --draft" : "";
        const prUrl = execSync(
          `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"${draftFlag}`,
          { cwd: worktreePath, encoding: "utf-8", maxBuffer: 1024 * 1024 }
        ).trim();
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, prUrl }) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
          isError: true,
        };
      }
    },
  },
  {
    name: "get_diff_summary",
    description:
      "Get a summary of changes on the current branch: branch info, files changed, and commit log.",
    inputSchema: {
      worktreePath: z.string().describe("Absolute path to the git worktree"),
    },
    handler: async ({ worktreePath }) => {
      try {
        const mainBranch = execSync(
          `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main"`,
          { cwd: worktreePath, encoding: "utf-8" }
        ).trim();

        // Fetch latest main so diff is accurate against current remote state
        try { execSync(`git fetch origin "${mainBranch}"`, { cwd: worktreePath, encoding: "utf-8" }); } catch {}

        const branch = execSync("git branch --show-current", { cwd: worktreePath, encoding: "utf-8" }).trim();

        const stat = execSync(
          `git diff --stat "origin/${mainBranch}"...HEAD 2>/dev/null || git diff --stat HEAD~1`,
          { cwd: worktreePath, encoding: "utf-8" }
        ).trim();

        const log = execSync(
          `git log --oneline "origin/${mainBranch}"..HEAD 2>/dev/null || git log --oneline -5`,
          { cwd: worktreePath, encoding: "utf-8" }
        ).trim();

        const summary = `=== Branch Info ===\nCurrent branch: ${branch}\nBase branch: ${mainBranch}\n\n=== Files Changed ===\n${stat}\n\n=== Commit Log ===\n${log}`;

        return {
          content: [{ type: "text", text: summary }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error getting diff summary: ${err.message}` }],
          isError: true,
        };
      }
    },
  },
];
