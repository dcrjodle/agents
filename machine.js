import { setup, assign } from "xstate";

const MAX_RETRIES = 3;

export const workflowMachine = setup({
  types: {
    context: /** @type {{ task: string, plan: object | null, result: object | null, error: string | null, retries: number }} */ ({}),
    events: /** @type {
      | { type: "START", task: string }
      | { type: "PLAN_READY", plan: object }
      | { type: "PLAN_FAILED", error: string }
      | { type: "PLAN_APPROVED" }
      | { type: "PLAN_REJECTED" }
      | { type: "CODE_COMPLETE", files: string[] }
      | { type: "CODE_FAILED", error: string }
      | { type: "TESTS_PASSED" }
      | { type: "TESTS_FAILED", error: string }
      | { type: "REVIEW_APPROVED" }
      | { type: "CHANGES_REQUESTED", feedback: string }
      | { type: "BRANCH_PUSHED", branchName: string, diffSummary: string }
      | { type: "PR_APPROVED" }
      | { type: "MERGED", url: string }
      | { type: "PR_FAILED", error: string }
      | { type: "RETRY" }
    } */ ({}),
  },
  guards: {
    underRetryLimit: ({ context }) => context.retries < MAX_RETRIES,
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
  },

  states: {
    idle: {
      on: {
        START: {
          target: "planning",
          actions: assign({
            task: ({ event }) => event.task,
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
              target: "#workflow.developing",
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

    developing: {
      // Developer agent writes code
      on: {
        CODE_COMPLETE: {
          target: "testing",
          actions: assign({
            result: ({ event }) => ({
              files: event.files,
              worktreePath: event.worktreePath,
              branchName: event.branchName,
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
          target: "merging",
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

    merging: {
      initial: "running",
      states: {
        running: {
          on: {
            BRANCH_PUSHED: {
              target: "awaitingApproval",
              actions: assign({
                result: ({ context, event }) => ({
                  ...context.result,
                  branchName: event.branchName,
                  diffSummary: event.diffSummary,
                }),
              }),
            },
            PR_FAILED: {
              target: "#workflow.failed",
              actions: assign({
                error: ({ event }) => event.error,
              }),
            },
          },
        },
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
