import { createActor } from "xstate";
import { workflowMachine } from "./machine.js";

const task = process.argv[2] || "Build a hello world API";

// Create the actor
const actor = createActor(workflowMachine);

// Log every transition
actor.subscribe((snapshot) => {
  const { value, context } = snapshot;
  console.log(`[${value}] task="${context.task}" retries=${context.retries}${context.error ? ` error="${context.error}"` : ""}`);
});

actor.start();

// --- Simulate a workflow run ---
// In a real setup, each agent would be a long-running process
// that sends events back to the orchestrator.

console.log("\n--- Starting workflow ---\n");
actor.send({ type: "START", task });

// Simulate: planner finishes
actor.send({
  type: "PLAN_COMPLETE",
  plan: { tasks: ["setup project", "add endpoints", "write tests"] },
});

// Simulate: developer finishes
actor.send({
  type: "CODE_COMPLETE",
  files: ["src/index.js", "src/routes.js"],
});

// Simulate: tests fail first time
actor.send({
  type: "TESTS_FAILED",
  error: "GET /users returns 500",
});

// Simulate: developer fixes it
actor.send({
  type: "CODE_COMPLETE",
  files: ["src/routes.js"],
});

// Simulate: tests pass
actor.send({ type: "TESTS_PASSED" });

// Simulate: reviewer approves
actor.send({ type: "REVIEW_APPROVED" });

// Simulate: merged
actor.send({ type: "MERGED" });

console.log("\n--- Workflow complete ---");
