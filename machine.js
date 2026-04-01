import { setup, assign } from "xstate";

const MAX_RETRIES = 5;

export const workflowMachine = setup({
  types: {
    context: /** @type {{ task: string, plan: object | null, review: object | null, result: object | null, error: string | null, retries: number, maxRetries: number, failedFrom: string | null }} */ ({}),
    events: /** @type {
      | { type: "START", task: string, maxRetries?: number }
      | { type: "PLAN_READY", plan: object }
      | { type: "PLAN_FAILED", error: string }
      | { type: "PLAN_APPROVED", reviewComments?: string }
      | { type: "PLAN_REJECTED" }
      | { type: "PLAN_REVISION_REQUESTED", comments: string }
      | { type: "BRANCH_READY", worktreePath: string, branchName: string }
      | { type: "BRANCH_FAILED", error: string }
      | { type: "CODE_COMPLETE", files: string[] }
      | { type: "CODE_FAILED", error: string }
      | { type: "COMMIT_COMPLETE", files: string[] }
      | { type: "COMMIT_FAILED", error: string }
      | { type: "TESTS_PASSED" }
      | { type: "TESTS_FAILED", error: string }
      | { type: "REVIEW_READY", review: object }
      | { type: "REVIEW_FAILED", error: string }
      | { type: "REVIEW_APPROVED" }
      | { type: "REVIEW_REVISION_REQUESTED", comments: string }
      | { type: "CHANGES_REQUESTED", feedback: string }
      | { type: "PUSH_COMPLETE", branchName: string, diffSummary: string }
      | { type: "PUSH_COMPLETE_NO_PR", branchName: string, diffSummary: string }
      | { type: "PUSH_COMPLETE_BRANCH_ONLY", branchName: string, diffSummary: string }
      | { type: "DIRECT_MERGE_COMPLETE" }
      | { type: "DIRECT_MERGE_FAILED", error: string }
      | { type: "PUSH_FAILED", error: string }
      | { type: "PR_APPROVED" }
      | { type: "PR_CHANGES_REQUESTED", feedback: string }
      | { type: "MERGED", url: string }
      | { type: "PR_FAILED", error: string }
      | { type: "RETRY" }
      | { type: "CONTINUE" }
    } */ ({}),
  },
  guards: {
    underRetryLimit: ({ context }) => context.retries < (context.maxRetries ?? MAX_RETRIES),
    failedFromPlanning: ({ context }) => context.failedFrom === "planning.running",
    failedFromBranching: ({ context }) => context.failedFrom === "branching",
    failedFromDeveloping: ({ context }) => context.failedFrom === "developing",
    failedFromCommitting: ({ context }) => context.failedFrom === "committing",
    failedFromTesting: ({ context }) => context.failedFrom === "testing",
    failedFromReviewing: ({ context }) => context.failedFrom === "reviewing.running",
    failedFromPushing: ({ context }) => context.failedFrom === "pushing",
    failedFromDirectMerging: ({ context }) => context.failedFrom === "directMerging",
    failedFromMerging: ({ context }) => context.failedFrom === "merging.creatingPr",
  },
}).createMachine({
  id: "workflow",
  initial: "idle",
  context: {
    task: "",
    plan: null,
    review: null,
    result: null,
    error: null,
    retries: 0,
    maxRetries: MAX_RETRIES,
    failedFrom: null,
  },

  states: {
    idle: {
      on: {
        START: {
          target: "planning",
          actions: assign({
            task: ({ event }) => event.task,
            maxRetries: ({ event }) => event.maxRetries ?? MAX_RETRIES,
            error: () => null,
            retries: () => 0,
          }),
        },
      },
    },

    planning: {
      initial: "running",
      states: {
        running: {
          on: {
            PLAN_READY: {
              target: "awaitingApproval",
              actions: assign({
                plan: ({ event }) => event.plan,
              }),
            },
            PLAN_FAILED: {
              target: "#workflow.failed",
              actions: assign({
                error: ({ event }) => event.error,
                failedFrom: () => "planning.running",
              }),
            },
          },
        },
        awaitingApproval: {
          on: {
            PLAN_APPROVED: {
              target: "#workflow.branching",
              actions: assign({
                plan: ({ context, event }) =>
                  event.reviewComments
                    ? { ...context.plan, reviewComments: event.reviewComments }
                    : context.plan,
              }),
            },
            PLAN_REJECTED: {
              target: "#workflow.failed",
              actions: assign({
                error: () => "Plan rejected by user",
                failedFrom: () => "planning.awaitingApproval",
              }),
            },
            PLAN_REVISION_REQUESTED: {
              target: "running",
              actions: assign({
                plan: ({ context, event }) => ({
                  ...context.plan,
                  userComments: event.comments,
                }),
              }),
            },
          },
        },
      },
    },

    branching: {
      // Deterministic script creates worktree — no Claude involved
      on: {
        BRANCH_READY: {
          target: "developing",
          actions: assign({
            result: ({ event }) => ({
              worktreePath: event.worktreePath,
              branchName: event.branchName,
            }),
          }),
        },
        BRANCH_FAILED: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
            failedFrom: () => "branching",
          }),
        },
      },
    },

    developing: {
      // Developer agent writes code — no git operations
      on: {
        CODE_COMPLETE: {
          target: "committing",
          actions: assign({
            result: ({ context, event }) => ({
              ...context.result,
              files: event.files,
            }),
          }),
        },
        CODE_FAILED: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
            failedFrom: () => "developing",
          }),
        },
      },
    },

    committing: {
      // Deterministic script commits changes — no Claude involved
      on: {
        COMMIT_COMPLETE: {
          target: "testing",
          actions: assign({
            result: ({ context, event }) => ({
              ...context.result,
              files: event.files,
            }),
          }),
        },
        COMMIT_FAILED: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
            failedFrom: () => "committing",
          }),
        },
      },
    },

    testing: {
      // Tester agent runs tests
      on: {
        TESTS_PASSED: {
          target: "reviewing",
        },
        TESTS_FAILED: [
          {
            target: "developing",
            guard: "underRetryLimit",
            actions: assign({
              error: ({ event }) => event.error,
              retries: ({ context }) => context.retries + 1,
            }),
          },
          {
            target: "failed",
            actions: assign({
              error: ({ event }) => event.error || "Max retries exceeded (test failures)",
              failedFrom: () => "testing",
            }),
          },
        ],
      },
    },

    reviewing: {
      // Reviewer agent checks code quality
      initial: "running",
      states: {
        running: {
          on: {
            REVIEW_READY: {
              target: "awaitingApproval",
              actions: assign({
                review: ({ event }) => event.review,
              }),
            },
            REVIEW_FAILED: [
              {
                target: "#workflow.developing",
                guard: "underRetryLimit",
                actions: assign({
                  error: ({ event }) => event.error,
                  retries: ({ context }) => context.retries + 1,
                }),
              },
              {
                target: "#workflow.failed",
                actions: assign({
                  error: ({ event }) => event.error || "Max retries exceeded (review failures)",
                  failedFrom: () => "reviewing.running",
                }),
              },
            ],
          },
        },
        awaitingApproval: {
          on: {
            REVIEW_APPROVED: {
              target: "#workflow.pushing",
            },
            CHANGES_REQUESTED: [
              {
                target: "#workflow.developing",
                guard: "underRetryLimit",
                actions: assign({
                  error: ({ event }) => event.feedback,
                  retries: ({ context }) => context.retries + 1,
                }),
              },
              {
                target: "#workflow.failed",
                actions: assign({
                  error: ({ event }) => event.feedback || "Max retries exceeded (review changes)",
                  failedFrom: () => "reviewing",
                }),
              },
            ],
            REVIEW_REVISION_REQUESTED: {
              target: "running",
              actions: assign({
                review: ({ context, event }) => ({
                  ...context.review,
                  userComments: event.comments,
                }),
              }),
            },
          },
        },
      },
    },

    pushing: {
      // Deterministic script pushes branch — no Claude involved
      on: {
        PUSH_COMPLETE: {
          target: "merging",
          actions: assign({
            result: ({ context, event }) => ({
              ...context.result,
              branchName: event.branchName,
              diffSummary: event.diffSummary,
            }),
          }),
        },
        PUSH_COMPLETE_NO_PR: {
          target: "directMerging",
          actions: assign({
            result: ({ context, event }) => ({
              ...context.result,
              branchName: event.branchName,
              diffSummary: event.diffSummary,
            }),
          }),
        },
        PUSH_COMPLETE_BRANCH_ONLY: {
          target: "done",
          actions: assign({
            result: ({ context, event }) => ({
              ...context.result,
              branchName: event.branchName,
              diffSummary: event.diffSummary,
            }),
          }),
        },
        PUSH_FAILED: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
            failedFrom: () => "pushing",
          }),
        },
      },
    },

    directMerging: {
      // Merger agent: pulls latest main, merges into task branch (resolving conflicts),
      // then merges task branch into main and pushes. Handles everything including conflicts.
      on: {
        DIRECT_MERGE_COMPLETE: {
          target: "done",
        },
        DIRECT_MERGE_FAILED: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
            failedFrom: () => "directMerging",
          }),
        },
      },
    },

    merging: {
      initial: "awaitingApproval",
      states: {
        awaitingApproval: {
          on: {
            PR_APPROVED: {
              target: "creatingPr",
            },
            PR_CHANGES_REQUESTED: [
              {
                target: "#workflow.developing",
                guard: "underRetryLimit",
                actions: assign({
                  error: ({ event }) => event.feedback,
                  retries: ({ context }) => context.retries + 1,
                }),
              },
              {
                target: "#workflow.failed",
                actions: assign({
                  error: ({ event }) => event.feedback || "Max retries exceeded (PR changes requested)",
                  failedFrom: () => "merging.awaitingApproval",
                }),
              },
            ],
          },
        },
        creatingPr: {
          on: {
            MERGED: {
              target: "#workflow.done",
              actions: assign({
                prUrl: ({ event }) => event.url,
                prTitle: ({ event }) => event.prTitle,
              }),
            },
            PR_FAILED: {
              target: "#workflow.failed",
              actions: assign({
                error: ({ event }) => event.error,
                failedFrom: () => "merging.creatingPr",
              }),
            },
          },
        },
      },
    },

    done: {
      type: "final",
    },

    failed: {
      on: {
        RETRY: {
          target: "planning",
          guard: "underRetryLimit",
          actions: assign({
            error: () => null,
            retries: ({ context }) => context.retries + 1,
            failedFrom: () => null,
          }),
        },
        CONTINUE: [
          { target: "planning", guard: "failedFromPlanning", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "branching", guard: "failedFromBranching", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "developing", guard: "failedFromDeveloping", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "committing", guard: "failedFromCommitting", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "testing", guard: "failedFromTesting", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "reviewing.running", guard: "failedFromReviewing", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "pushing", guard: "failedFromPushing", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "directMerging", guard: "failedFromDirectMerging", actions: assign({ error: () => null, failedFrom: () => null }) },
          { target: "merging", guard: "failedFromMerging", actions: assign({ error: () => null, failedFrom: () => null }) },
        ],
      },
    },
  },
});
