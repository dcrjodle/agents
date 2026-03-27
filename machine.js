import { setup, assign } from "xstate";

const MAX_RETRIES = 3;

export const workflowMachine = setup({
  types: {
    context: /** @type {{ task: string, plan: object | null, result: object | null, error: string | null, retries: number, testingMode: string }} */ ({}),
    events: /** @type {
      | { type: "START", task: string, testingMode?: string }
      | { type: "PLAN_READY", plan: object }
      | { type: "PLAN_FAILED", error: string }
      | { type: "PLAN_APPROVED", reviewComments?: string }
      | { type: "PLAN_REJECTED" }
      | { type: "BRANCH_READY", worktreePath: string, branchName: string }
      | { type: "BRANCH_FAILED", error: string }
      | { type: "CODE_COMPLETE", files: string[] }
      | { type: "CODE_FAILED", error: string }
      | { type: "COMMIT_COMPLETE", files: string[] }
      | { type: "COMMIT_FAILED", error: string }
      | { type: "TESTS_PASSED" }
      | { type: "TESTS_FAILED", error: string }
      | { type: "VISUAL_TEST_START" }
      | { type: "REVIEW_APPROVED" }
      | { type: "CHANGES_REQUESTED", feedback: string }
      | { type: "PUSH_COMPLETE", branchName: string, diffSummary: string }
      | { type: "PUSH_COMPLETE_NO_PR", branchName: string, diffSummary: string }
      | { type: "DIRECT_MERGE_COMPLETE" }
      | { type: "DIRECT_MERGE_FAILED", error: string }
      | { type: "PUSH_FAILED", error: string }
      | { type: "PR_APPROVED" }
      | { type: "MERGED", url: string }
      | { type: "PR_FAILED", error: string }
      | { type: "RETRY" }
    } */ ({}),
  },
  guards: {
    underRetryLimit: ({ context }) => context.retries < MAX_RETRIES,
    needsVisualTest: ({ context }) => context.testingMode === "async" || context.testingMode === "sync",
    isAsyncTesting: ({ context }) => context.testingMode === "async",
  },
}).createMachine({
  id: "workflow",
  initial: "idle",
  context: {
    task: "",
    plan: null,
    result: null,
    error: null,
    retries: 0,
    testingMode: "build",
  },

  states: {
    idle: {
      on: {
        START: {
          target: "planning",
          actions: assign({
            task: ({ event }) => event.task,
            testingMode: ({ event }) => event.testingMode || "build",
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
          }),
        },
      },
    },

    committing: {
      // Deterministic script commits changes — no Claude involved
      on: {
        COMMIT_COMPLETE: [
          {
            target: "visualTesting",
            guard: "needsVisualTest",
            actions: assign({
              result: ({ context, event }) => ({
                ...context.result,
                files: event.files,
              }),
            }),
          },
          {
            target: "testing",
            actions: assign({
              result: ({ context, event }) => ({
                ...context.result,
                files: event.files,
              }),
            }),
          },
        ],
        COMMIT_FAILED: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    visualTesting: {
      initial: "preparing",
      states: {
        preparing: {
          always: [
            { target: "awaitingTrigger", guard: "isAsyncTesting" },
            { target: "running" },
          ],
        },
        awaitingTrigger: {
          on: {
            VISUAL_TEST_START: { target: "running" },
          },
        },
        running: {
          on: {
            TESTS_PASSED: { target: "#workflow.reviewing" },
            TESTS_FAILED: [
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
                  error: ({ event }) => event.error || "Max retries exceeded (visual test failures)",
                }),
              },
            ],
          },
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
            }),
          },
        ],
      },
    },

    reviewing: {
      // Reviewer agent checks code quality
      on: {
        REVIEW_APPROVED: {
          target: "pushing",
        },
        CHANGES_REQUESTED: [
          {
            target: "developing",
            guard: "underRetryLimit",
            actions: assign({
              error: ({ event }) => event.feedback,
              retries: ({ context }) => context.retries + 1,
            }),
          },
          {
            target: "failed",
            actions: assign({
              error: ({ event }) => event.feedback || "Max retries exceeded (review changes)",
            }),
          },
        ],
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
        PUSH_FAILED: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
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
          },
        },
        creatingPr: {
          on: {
            MERGED: {
              target: "#workflow.done",
            },
            PR_FAILED: {
              target: "#workflow.failed",
              actions: assign({
                error: ({ event }) => event.error,
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
          }),
        },
      },
    },
  },
});
