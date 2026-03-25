import { setup } from "xstate";

export const workflowMachine = setup({
  types: {
    context: /** @type {{ task: string, plan: object | null, result: object | null, error: string | null, retries: number }} */ ({}),
    events: /** @type {
      | { type: "START", task: string }
      | { type: "PLAN_COMPLETE", plan: object }
      | { type: "PLAN_FAILED", error: string }
      | { type: "CODE_COMPLETE", files: string[] }
      | { type: "CODE_FAILED", error: string }
      | { type: "TESTS_PASSED" }
      | { type: "TESTS_FAILED", error: string }
      | { type: "REVIEW_APPROVED" }
      | { type: "CHANGES_REQUESTED", feedback: string }
      | { type: "PR_OPENED", url: string }
      | { type: "PR_FAILED", error: string }
      | { type: "MERGED" }
      | { type: "RETRY" }
    } */ ({}),
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
          actions: ({ context, event }) => {
            context.task = event.task;
            context.error = null;
            context.retries = 0;
          },
        },
      },
    },

    planning: {
      // Planner agent decomposes the task
      on: {
        PLAN_COMPLETE: {
          target: "developing",
          actions: ({ context, event }) => {
            context.plan = event.plan;
          },
        },
        PLAN_FAILED: {
          target: "failed",
          actions: ({ context, event }) => {
            context.error = event.error;
          },
        },
      },
    },

    developing: {
      // Developer agent writes code
      on: {
        CODE_COMPLETE: {
          target: "testing",
          actions: ({ context, event }) => {
            context.result = { files: event.files };
          },
        },
        CODE_FAILED: {
          target: "failed",
          actions: ({ context, event }) => {
            context.error = event.error;
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
        TESTS_FAILED: {
          target: "developing",
          actions: ({ context, event }) => {
            context.error = event.error;
            context.retries += 1;
          },
        },
      },
    },

    reviewing: {
      // Reviewer agent checks code quality
      on: {
        REVIEW_APPROVED: {
          target: "merging",
        },
        CHANGES_REQUESTED: {
          target: "developing",
          actions: ({ context, event }) => {
            context.error = event.feedback;
            context.retries += 1;
          },
        },
      },
    },

    merging: {
      // Githubber agent opens PR and merges
      on: {
        MERGED: {
          target: "done",
        },
        PR_FAILED: {
          target: "failed",
          actions: ({ context, event }) => {
            context.error = event.error;
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
          actions: ({ context }) => {
            context.error = null;
            context.retries += 1;
          },
        },
      },
    },
  },
});
