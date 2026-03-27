import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const TASK_ID = process.env.TASK_ID;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

if (!TASK_ID) {
  console.error("TASK_ID env var is required");
  process.exit(1);
}

const server = new McpServer({
  name: "workflow",
  version: "1.0.0",
});

async function post(path, body) {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: TASK_ID, ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// report_status — send progress updates
server.registerTool("report_status", {
  description: "Send a progress status update to the orchestrator (e.g., 'Analyzing project structure')",
  inputSchema: {
    message: z.string().describe("Status message describing current progress"),
  },
}, async ({ message }) => {
  await post("/internal/agent-status", { message });
  return { content: [{ type: "text", text: "Status reported." }] };
});

// report_error — report errors
server.registerTool("report_error", {
  description: "Report an error or blocker to the orchestrator",
  inputSchema: {
    message: z.string().describe("Error message describing the issue"),
  },
}, async ({ message }) => {
  await post("/internal/agent-error", { message });
  return { content: [{ type: "text", text: "Error reported." }] };
});

// report_result — submit final result
server.registerTool("report_result", {
  description: "Submit the final result of this agent's work. You MUST call this when done.",
  inputSchema: {
    result: z.string().describe("JSON string of the result payload (e.g. {\"status\":\"complete\",\"plan\":{...}})"),
  },
}, async ({ result }) => {
  let parsed;
  try {
    parsed = JSON.parse(result);
  } catch {
    return { content: [{ type: "text", text: "ERROR: result must be a valid JSON string" }], isError: true };
  }
  await post("/internal/agent-result", parsed);
  return { content: [{ type: "text", text: "Result submitted." }] };
});

// get_task_context — read current task context
server.registerTool("get_task_context", {
  description: "Read the current task context including task description, plan, result, errors, and retry count",
}, async () => {
  const ctx = await get(`/internal/task-context/${TASK_ID}`);
  return { content: [{ type: "text", text: JSON.stringify(ctx, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
