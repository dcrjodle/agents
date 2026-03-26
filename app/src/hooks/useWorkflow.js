import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = `ws://${window.location.host}/ws`;
const API_BASE = "/api";

/**
 * Normalize XState compound state values to dot-notation strings.
 * Mirrors server's stateKey().
 */
function stateKey(value) {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return String(value);
    const [parent, child] = entries[0];
    if (typeof child === "string") return `${parent}.${child}`;
    return `${parent}.${stateKey(child)}`;
  }
  return String(value);
}

export function useWorkflow() {
  const [tasks, setTasks] = useState([]);
  const [connected, setConnected] = useState(false);
  // agentLogs: { [taskId]: Array<{ time, type, agent?, stream?, data?, status?, message?, exitCode? }> }
  const [agentLogs, setAgentLogs] = useState({});
  // pendingPlans: { [taskId]: { markdown, projectPath } }
  const [pendingPlans, setPendingPlans] = useState({});
  // errors: { [taskId]: Array<{ time, agent, error }> }
  const [errors, setErrors] = useState({});
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(2000);

  const appendLog = useCallback((taskId, entry) => {
    setAgentLogs((prev) => ({
      ...prev,
      [taskId]: [...(prev[taskId] || []), { time: new Date().toISOString(), ...entry }],
    }));
  }, []);

  const appendError = useCallback((taskId, agent, error) => {
    const entry = { time: new Date().toISOString(), agent, error };
    setErrors((prev) => ({
      ...prev,
      [taskId]: [...(prev[taskId] || []), entry],
    }));
    // Also add to logs so it shows in the event stream
    appendLog(taskId, {
      type: "error",
      agent,
      data: `ERROR [${agent}]: ${error}`,
      error,
    });
  }, [appendLog]);

  useEffect(() => {
    let disposed = false;

    function connect() {
      if (disposed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        setConnected(true);
        reconnectDelay.current = 2000; // reset backoff on success
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        // Exponential backoff: 2s, 4s, 8s, max 30s
        const delay = reconnectDelay.current;
        reconnectDelay.current = Math.min(delay * 2, 30000);
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onmessage = (e) => {
        if (disposed) return;

        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err, e.data);
          return;
        }

        switch (msg.type) {
          case "INIT":
            setTasks(msg.tasks);
            // Hydrate persisted logs from server
            if (msg.logs && typeof msg.logs === "object") {
              setAgentLogs(msg.logs);
              // Restore errors from persisted log entries
              const restoredErrors = {};
              for (const [taskId, entries] of Object.entries(msg.logs)) {
                const errorEntries = entries.filter((e) => e.type === "error");
                if (errorEntries.length > 0) {
                  restoredErrors[taskId] = errorEntries.map((e) => ({
                    time: e.time,
                    agent: e.agent,
                    error: e.error || e.data,
                  }));
                }
              }
              if (Object.keys(restoredErrors).length > 0) {
                setErrors(restoredErrors);
              }
            }
            // Check for any tasks already in awaitingApproval with plans
            for (const task of msg.tasks) {
              const sk = task.stateKey || stateKey(task.state);
              if (sk === "planning.awaitingApproval" && task.context?.plan?.markdown) {
                setPendingPlans((prev) => prev[task.id] ? prev : {
                  ...prev,
                  [task.id]: {
                    markdown: task.context.plan.markdown,
                    projectPath: task.context.plan.projectPath,
                  },
                });
              }
            }
            break;

          case "TASK_CREATED":
            setTasks((prev) => [...prev, msg.task]);
            appendLog(msg.task.id, {
              type: "system",
              data: `Task created: ${msg.task.description}`,
            });
            break;

          case "STATE_UPDATE":
            setTasks((prev) =>
              prev.map((t) =>
                t.id === msg.taskId
                  ? { ...t, state: msg.state, stateKey: msg.stateKey, label: msg.label, context: msg.context }
                  : t
              )
            );
            appendLog(msg.taskId, {
              type: "state",
              data: `State: ${msg.stateKey || stateKey(msg.state)}`,
              state: msg.state,
              stateKey: msg.stateKey,
              label: msg.label,
            });
            break;

          case "TASK_DELETED":
            setTasks((prev) => prev.filter((t) => t.id !== msg.taskId));
            break;

          case "AGENT_SPAWNED":
            appendLog(msg.taskId, {
              type: "spawned",
              agent: msg.agent,
              data: `Agent ${msg.agent} spawned (pid: ${msg.pid})`,
              pid: msg.pid,
            });
            break;

          case "AGENT_OUTPUT":
            appendLog(msg.taskId, {
              type: "output",
              agent: msg.agent,
              stream: msg.stream,
              data: msg.data,
            });
            break;

          case "AGENT_STATUS":
            appendLog(msg.taskId, {
              type: "status",
              agent: msg.agent,
              data: `[${msg.agent}] ${msg.status.currentStep || msg.status.state}`,
              status: msg.status,
            });
            break;

          case "AGENT_EXITED":
            appendLog(msg.taskId, {
              type: "exited",
              agent: msg.agent,
              data: `Agent ${msg.agent} exited (code: ${msg.exitCode})`,
              exitCode: msg.exitCode,
            });
            break;

          case "AGENT_ERROR":
            appendError(msg.taskId, msg.agent, msg.error);
            break;

          case "AGENT_RESULT":
            appendLog(msg.taskId, {
              type: "message",
              agent: msg.agent,
              data: `[${msg.agent}] result: ${msg.result?.summary || msg.result?.status || ""}`,
              result: msg.result,
            });
            break;

          case "PLAN_READY":
            // Server broadcasts this when XState enters planning.awaitingApproval
            if (msg.plan?.markdown) {
              setPendingPlans((prev) => ({
                ...prev,
                [msg.taskId]: {
                  markdown: msg.plan.markdown,
                  projectPath: msg.plan.projectPath,
                },
              }));
              // Add a clickable plan link entry to the stream
              appendLog(msg.taskId, {
                type: "plan_link",
                data: "plan ready \u2014 click to review",
              });
            }
            break;

          case "APPROVAL":
            appendLog(msg.taskId, {
              type: "system",
              data: `${msg.approval} approved: ${msg.message}`,
            });
            // Clear pending plan on plan approval
            if (msg.approval === "plan") {
              setPendingPlans((prev) => {
                const next = { ...prev };
                delete next[msg.taskId];
                return next;
              });
            }
            break;

          case "MESSAGE_SENT":
            appendLog(msg.taskId, {
              type: "message",
              agent: msg.message?.from,
              data: `[${msg.message?.from}] ${msg.message?.type}: ${msg.message?.payload?.summary || msg.message?.payload?.message || ""}`,
              message: msg.message,
            });
            break;
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [appendLog, appendError]);

  const createTask = async (description, projectPath) => {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, projectPath }),
    });
    if (!res.ok) throw new Error(`Failed to create task: ${res.statusText}`);
    return res.json();
  };

  const sendEvent = async (taskId, event) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
    if (!res.ok) throw new Error(`Failed to send event: ${res.statusText}`);
    return res.json();
  };

  const deleteTask = async (taskId) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete task: ${res.statusText}`);
  };

  const approveTask = async (taskId, message) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message || "Approved" }),
    });
    if (!res.ok) throw new Error(`Failed to approve task: ${res.statusText}`);
    return res.json();
  };

  const clearPendingPlan = (taskId) => {
    setPendingPlans((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const startTask = async (taskId) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to start task: ${res.statusText}`);
    return res.json();
  };

  const restartTask = async (taskId) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to restart task: ${res.statusText}`);
    // Clear logs and errors for this task
    setAgentLogs((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    setErrors((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    setPendingPlans((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    return res.json();
  };

  const clearErrors = (taskId) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  return { tasks, connected, agentLogs, pendingPlans, errors, createTask, startTask, restartTask, sendEvent, deleteTask, approveTask, clearPendingPlan, clearErrors };
}

export { stateKey };
