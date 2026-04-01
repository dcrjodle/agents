import { z } from "zod/v4";
import { supabase } from "../../server/supabase.js";

export const tools = [
  {
    name: "list_tasks",
    description: "List all tasks for the current project, optionally filtered by state",
    inputSchema: {
      projectPath: z.string().describe("Path to the project"),
      state: z.string().optional().describe("Optional state filter (idle, done, failed, etc.)"),
    },
    handler: async ({ projectPath, state }) => {
      try {
        let query = supabase
          .from("tasks")
          .select("id, title, state, created_at, updated_at, error")
          .eq("project_path", projectPath)
          .order("created_at", { ascending: false });

        if (state) {
          query = query.eq("state", state);
        }

        const { data, error } = await query;

        if (error) throw error;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ tasks: data || [], count: (data || []).length }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: err.message, tasks: [] }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  },

  {
    name: "get_task_details",
    description: "Get detailed information about a specific task including recent logs and errors",
    inputSchema: {
      taskId: z.string().describe("The task ID"),
    },
    handler: async ({ taskId }) => {
      try {
        const [taskResult, logsResult] = await Promise.all([
          supabase
            .from("tasks")
            .select("*")
            .eq("id", taskId)
            .single(),
          supabase
            .from("task_logs")
            .select("id, level, message, created_at")
            .eq("task_id", taskId)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        if (taskResult.error) throw taskResult.error;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  task: taskResult.data,
                  recentLogs: logsResult.data || [],
                  logsError: logsResult.error?.message || null,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: err.message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  },

  {
    name: "get_recent_errors",
    description: "Get recent errors from tasks, useful for debugging",
    inputSchema: {
      projectPath: z.string().describe("Path to the project"),
      limit: z.number().optional().describe("Max errors to return (default 10)"),
    },
    handler: async ({ projectPath, limit = 10 }) => {
      try {
        const { data, error } = await supabase
          .from("tasks")
          .select("id, title, state, error, updated_at")
          .eq("project_path", projectPath)
          .not("error", "is", null)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (error) throw error;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ errors: data || [], count: (data || []).length }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: err.message, errors: [] }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  },

  {
    name: "query_database",
    description: "Run a read-only query against the Supabase database. Use carefully.",
    inputSchema: {
      table: z.string().describe("Table name (tasks, task_logs, projects)"),
      select: z.string().optional().describe("Columns to select (default: *)"),
      filter: z.record(z.string(), z.unknown()).optional().describe("Filter conditions as key-value pairs"),
      limit: z.number().optional().describe("Max rows to return (default 20)"),
    },
    handler: async ({ table, select = "*", filter = {}, limit = 20 }) => {
      try {
        let query = supabase.from(table).select(select).limit(limit);

        for (const [key, value] of Object.entries(filter)) {
          query = query.eq(key, value);
        }

        const { data, error } = await query;

        if (error) throw error;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ rows: data || [], count: (data || []).length }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: err.message, rows: [] }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  },
];
