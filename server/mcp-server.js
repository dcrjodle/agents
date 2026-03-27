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

// add_memory — save a useful discovery to persistent memory
server.registerTool("add_memory", {
  description: "Save a useful discovery (problem, error, warning, rule or pattern) to this agent's persistent memory so it can be referenced in future runs.",
  inputSchema: {
    content: z.string().describe("The useful information to remember (one concise sentence)"),
    type: z.enum(["problem", "error", "warning", "rule", "pattern", "info"]).describe("Category of the memory entry"),
  },
}, async ({ content, type }) => {
  await post("/internal/add-memory", { content, type });
  return { content: [{ type: "text", text: "Memory entry saved." }] };
});

// update_avatar — control the agent's 2D character in the room view
server.registerTool("update_avatar", {
  description: "Control your 2D character avatar in the room visualization. Call this to express what you're doing visually — e.g., walk to a position, start thinking, celebrate success, or show an emotion. The frontend renders you as an animated pixel-art character.",
  inputSchema: {
    action: z.enum(["idle", "walk", "think", "code", "celebrate", "confused", "wave"]).describe("Animation action for your character"),
    message: z.string().optional().describe("Short speech bubble text (max 60 chars) shown above your character"),
    targetX: z.number().optional().describe("X position to walk to (0-100, percentage of room width)"),
    direction: z.enum(["left", "right"]).optional().describe("Direction the character faces"),
  },
}, async ({ action, message, targetX, direction }) => {
  await post("/internal/avatar-update", { action, message, targetX, direction });
  return { content: [{ type: "text", text: "Avatar updated." }] };
});

// get_memory — retrieve entries from agent memory database
server.registerTool("get_memory", {
  description: "Retrieve entries from this agent's memory database (or another role's memory).",
  inputSchema: {
    role: z.string().optional().describe("Agent role to fetch memory for. Omit to fetch all memory entries."),
  },
}, async ({ role } = {}) => {
  const path = role ? `/memory/${encodeURIComponent(role)}` : "/memory";
  const data = await get(path);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
