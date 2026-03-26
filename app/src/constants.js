export const STATE_AGENTS = {
  "planning.running": "planner",
  "developing": "developer",
  "testing": "tester",
  "reviewing": "reviewer",
  "merging.running": "githubber",
  "merging.creatingPr": "githubber",
};

export const STATE_COLORS = {
  "idle": "var(--dot-idle)",
  "planning.running": "var(--dot-planning)",
  "planning.awaitingApproval": "var(--dot-awaiting)",
  "developing": "var(--dot-developing)",
  "testing": "var(--dot-testing)",
  "reviewing": "var(--dot-reviewing)",
  "merging.running": "var(--dot-merging)",
  "merging.awaitingApproval": "var(--dot-awaiting)",
  "merging.creatingPr": "var(--dot-merging)",
  "done": "var(--dot-done)",
  "failed": "var(--dot-failed)",
};

export const PIPELINE_STAGES = ["planning", "developing", "testing", "reviewing", "merging", "done"];

export const STATE_LABELS = {
  "idle": "idle",
  "planning.running": "planning",
  "planning.awaitingApproval": "awaiting approval",
  "developing": "developing",
  "testing": "testing",
  "reviewing": "reviewing",
  "merging.running": "merging",
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
  "developing": [
    { type: "CODE_COMPLETE", files: ["src/index.js"] },
    { type: "CODE_FAILED", error: "Build error" },
  ],
  "testing": [
    { type: "TESTS_PASSED" },
    { type: "TESTS_FAILED", error: "Test failure" },
  ],
  "reviewing": [
    { type: "REVIEW_APPROVED" },
    { type: "CHANGES_REQUESTED", feedback: "Needs refactor" },
  ],
  "merging.running": [
    { type: "BRANCH_PUSHED", branchName: "task/test", diffSummary: "1 file changed" },
    { type: "PR_FAILED", error: "Push failed" },
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
};
