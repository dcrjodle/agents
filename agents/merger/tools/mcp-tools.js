import { z } from "zod/v4";
import { execSync } from "child_process";

export const tools = [
  {
    name: "merge_main_into_branch",
    description:
      "Fetch latest main and merge it into the current task branch. Returns success or a list of conflicted files that need manual resolution.",
    inputSchema: {
      worktreePath: z.string().describe("Absolute path to the git worktree (task branch)"),
    },
    handler: async ({ worktreePath }) => {
      try {
        // Detect main branch
        const mainBranch = execSync(
          `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main"`,
          { cwd: worktreePath, encoding: "utf-8" }
        ).trim();

        // Fetch latest
        execSync(`git fetch origin ${mainBranch}`, { cwd: worktreePath, encoding: "utf-8", stdio: "pipe" });

        // Try merge
        try {
          execSync(`git merge origin/${mainBranch} --no-edit`, { cwd: worktreePath, encoding: "utf-8", stdio: "pipe" });
          return {
            content: [{ type: "text", text: JSON.stringify({ success: true, message: `Merged origin/${mainBranch} cleanly.` }) }],
          };
        } catch {
          // Check for conflict files
          const conflictFiles = execSync(
            `git diff --name-only --diff-filter=U 2>/dev/null || true`,
            { cwd: worktreePath, encoding: "utf-8" }
          ).trim();

          if (conflictFiles) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: false,
                  conflicts: true,
                  conflictFiles: conflictFiles.split("\n"),
                  message: "Merge conflicts detected. Resolve the conflicts in the listed files, then run: git add -A && git commit --no-edit",
                }),
              }],
            };
          }

          // Not a conflict — some other merge failure, abort
          execSync("git merge --abort 2>/dev/null || true", { cwd: worktreePath, encoding: "utf-8", stdio: "pipe" });
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, conflicts: false, message: "Merge failed (not a conflict). Merge aborted." }) }],
            isError: true,
          };
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
          isError: true,
        };
      }
    },
  },
  {
    name: "fast_forward_main",
    description:
      "Merge the task branch into remote main and push, without touching the local main checkout. Operates entirely from the worktree: fetches latest main, merges it into the task branch, then pushes the result to remote main.",
    inputSchema: {
      worktreePath: z.string().describe("Absolute path to the git worktree (task branch)"),
      branchName: z.string().describe("Task branch name to merge into remote main"),
    },
    handler: async ({ worktreePath, branchName }) => {
      try {
        const mainBranch = execSync(
          `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main"`,
          { cwd: worktreePath, encoding: "utf-8" }
        ).trim();

        // Fetch latest main
        execSync(`git fetch origin ${mainBranch}`, { cwd: worktreePath, encoding: "utf-8", stdio: "pipe" });

        // Merge latest main into the task branch (should be clean after step 1, but ensures we're up to date)
        try {
          execSync(`git merge origin/${mainBranch} --no-edit`, { cwd: worktreePath, encoding: "utf-8", stdio: "pipe" });
        } catch {
          // If merge conflicts arise here, abort and fail — step 1 should have resolved them
          execSync("git merge --abort 2>/dev/null || true", { cwd: worktreePath, encoding: "utf-8", stdio: "pipe" });
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: `Merge conflicts with ${mainBranch} — resolve conflicts first using merge_main_into_branch.` }) }],
            isError: true,
          };
        }

        // Push the task branch to remote main — this is now a fast-forward since we just merged
        execSync(`git push origin HEAD:${mainBranch}`, { cwd: worktreePath, encoding: "utf-8", stdio: "pipe" });

        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, message: `Merged ${branchName} into origin/${mainBranch} and pushed (local main unchanged).` }) }],
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
    name: "cleanup_branch",
    description:
      "Remove a git worktree and delete the task branch locally and on the remote.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the main project repository"),
      worktreePath: z.string().describe("Absolute path to the worktree to remove"),
      branchName: z.string().describe("Task branch name to delete"),
    },
    handler: async ({ projectPath, worktreePath, branchName }) => {
      const results = [];

      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath, encoding: "utf-8", stdio: "pipe" });
        results.push("Worktree removed");
      } catch {
        results.push("Worktree already removed or not found");
      }

      try {
        execSync("git worktree prune", { cwd: projectPath, encoding: "utf-8", stdio: "pipe" });
      } catch {}

      try {
        execSync(`git branch -D ${branchName}`, { cwd: projectPath, encoding: "utf-8", stdio: "pipe" });
        results.push("Local branch deleted");
      } catch {
        results.push("Local branch not found");
      }

      try {
        execSync(`git push origin --delete ${branchName}`, { cwd: projectPath, encoding: "utf-8", stdio: "pipe" });
        results.push("Remote branch deleted");
      } catch {
        results.push("Remote branch not found or already deleted");
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, results }) }],
      };
    },
  },
];
