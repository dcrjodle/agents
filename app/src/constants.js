export const STATE_AGENTS = {
  "planning.running": "planner",
  "branching": "script",
  "developing": "developer",
  "committing": "script",
  "testing": "tester",
  "reviewing": "reviewer",
  "pushing": "script",
  "merging.creatingPr": "githubber",
};

export const STATE_COLORS = {
  "idle": "var(--dot-idle)",
  "planning.running": "var(--dot-planning)",
  "planning.awaitingApproval": "var(--dot-awaiting)",
  "branching": "var(--dot-planning)",
  "developing": "var(--dot-developing)",
  "committing": "var(--dot-developing)",
  "testing": "var(--dot-testing)",
  "reviewing": "var(--dot-reviewing)",
  "pushing": "var(--dot-merging)",
  "merging.awaitingApproval": "var(--dot-awaiting)",
  "merging.creatingPr": "var(--dot-merging)",
  "done": "var(--dot-done)",
  "failed": "var(--dot-failed)",
};

export const PIPELINE_STAGES = ["planning", "branching", "developing", "testing", "reviewing", "merging", "done"];

export const STATE_LABELS = {
  "idle": "todo",
  "planning.running": "planning",
  "planning.awaitingApproval": "awaiting approval",
  "branching": "branching",
  "developing": "developing",
  "committing": "committing",
  "testing": "testing",
  "reviewing": "reviewing",
  "pushing": "pushing",
  "merging.awaitingApproval": "awaiting approval",
  "merging.creatingPr": "creating pr",
  "done": "done",
  "failed": "failed",
};

export const NEXT_EVENTS = {
  "planning.running": [
    { type: "PLAN_READY", plan: { markdown: "# Test Plan", projectPath: "/tmp" } },
    { type: "PLAN_FAILED", error: "Planning failed" },
  ],
  "planning.awaitingApproval": [
    { type: "PLAN_APPROVED" },
    { type: "PLAN_REJECTED" },
  ],
  "branching": [
    { type: "BRANCH_READY", worktreePath: "/tmp/worktree", branchName: "task/test" },
    { type: "BRANCH_FAILED", error: "Worktree creation failed" },
  ],
  "developing": [
    { type: "CODE_COMPLETE", files: ["src/index.js"] },
    { type: "CODE_FAILED", error: "Build error" },
  ],
  "committing": [
    { type: "COMMIT_COMPLETE", files: ["src/index.js"] },
    { type: "COMMIT_FAILED", error: "Commit failed" },
  ],
  "testing": [
    { type: "TESTS_PASSED" },
    { type: "TESTS_FAILED", error: "Test failure" },
  ],
  "reviewing": [
    { type: "REVIEW_APPROVED" },
    { type: "CHANGES_REQUESTED", feedback: "Needs refactor" },
  ],
  "pushing": [
    { type: "PUSH_COMPLETE", branchName: "task/test", diffSummary: "1 file changed" },
    { type: "PUSH_FAILED", error: "Push failed" },
  ],
  "merging.awaitingApproval": [
    { type: "PR_APPROVED" },
  ],
  "merging.creatingPr": [
    { type: "MERGED", url: "https://github.com/test/pr/1" },
    { type: "PR_FAILED", error: "Merge conflict" },
  ],
  "failed": [{ type: "RETRY" }],
};

export const AGENT_COLUMN_COLORS = {
  planner: "var(--col-planner)",
  developer: "var(--col-developer)",
  tester: "var(--col-tester)",
  reviewer: "var(--col-reviewer)",
  githubber: "var(--col-githubber)",
  manager: "var(--col-manager)",
  script: "var(--col-manager)",
};
