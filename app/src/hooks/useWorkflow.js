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
  // pendingReviews: { [taskId]: { markdown, verdict, feedback } }
  const [pendingReviews, setPendingReviews] = useState({});
  // pendingPrs: { [taskId]: { branchName, diffSummary } }
  const [pendingPrs, setPendingPrs] = useState({});
  // errors: { [taskId]: Array<{ time, agent, error }> }
  const [errors, setErrors] = useState({});
  // agentMemory: { [role]: Array<{ id, timestamp, type, content, taskId, projectPath }> }
  const [agentMemory, setAgentMemory] = useState({});
  // avatarStates: { [taskId]: { [agent]: { action, message, targetX, direction, timestamp } } }
  const [avatarStates, setAvatarStates] = useState({});
  // evaluationResults: { [projectPath]: { score, dimensions, suggestions, summary, timestamp } }
  const [evaluationResults, setEvaluationResults] = useState({});
  // evaluatingProjects: Set of projectPaths currently being evaluated
  const [evaluatingProjects, setEvaluatingProjects] = useState(new Set());
  // visualTestResults: { [projectPath]: { status, results: [{ taskId, status, screenshot?, error? }], timestamp } }
  const [visualTestResults, setVisualTestResults] = useState({});
  // visualTestingProjects: Set of projectPaths currently being visual-tested
  const [visualTestingProjects, setVisualTestingProjects] = useState(new Set());
  // visualTestProgress: { [projectPath]: string } — current step text while a test is running
  const [visualTestProgress, setVisualTestProgress] = useState({});
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
              if (sk === "reviewing.awaitingApproval" && task.context?.review) {
                setPendingReviews((prev) => prev[task.id] ? prev : {
                  ...prev,
                  [task.id]: task.context.review,
                });
              }
              if (sk === "merging.awaitingApproval") {
                setPendingPrs((prev) => prev[task.id] ? prev : {
                  ...prev,
                  [task.id]: {
                    branchName: task.context?.result?.branchName || task.context?.branchName || null,
                    diffSummary: task.context?.result?.diffSummary || task.context?.diffSummary || null,
                  },
                });
              }
            }
            // Hydrate initial agent memory from REST API
            fetch(`${API_BASE}/memory`)
              .then((r) => r.ok ? r.json() : {})
              .then((all) => { if (all && typeof all === "object") setAgentMemory(all); })
              .catch(() => {});
            // Hydrate lastEvaluation from project settings on connect
            fetch(`${API_BASE}/config`)
              .then((r) => r.ok ? r.json() : { projects: [] })
              .then((config) => {
                const initial = {};
                for (const p of (config.projects || [])) {
                  if (p.settings?.lastEvaluation) {
                    initial[p.path] = p.settings.lastEvaluation;
                  }
                }
                if (Object.keys(initial).length > 0) {
                  setEvaluationResults((prev) => ({ ...initial, ...prev }));
                }
              })
              .catch(() => {});
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
            // Auto-avatar: agent walks into the room
            setAvatarStates((prev) => ({
              ...prev,
              [msg.taskId]: {
                ...(prev[msg.taskId] || {}),
                [msg.agent]: { action: "walk", message: "reporting in", direction: "right", timestamp: Date.now() },
              },
            }));
            break;

          case "AGENT_OUTPUT":
            appendLog(msg.taskId, {
              type: "output",
              agent: msg.agent,
              stream: msg.stream,
              data: msg.data,
            });
            // Auto-avatar: agent is working (throttled — only set if not already coding/thinking)
            setAvatarStates((prev) => {
              const current = prev[msg.taskId]?.[msg.agent];
              if (current && (current.action === "code" || current.action === "think") && Date.now() - current.timestamp < 3000) return prev;
              return {
                ...prev,
                [msg.taskId]: {
                  ...(prev[msg.taskId] || {}),
                  [msg.agent]: { action: "code", direction: current?.direction, timestamp: Date.now() },
                },
              };
            });
            break;

          case "AGENT_STATUS":
            appendLog(msg.taskId, {
              type: "status",
              agent: msg.agent,
              data: `[${msg.agent}] ${msg.status.currentStep || msg.status.state}`,
              status: msg.status,
            });
            // Auto-avatar: show status as speech bubble
            setAvatarStates((prev) => ({
              ...prev,
              [msg.taskId]: {
                ...(prev[msg.taskId] || {}),
                [msg.agent]: {
                  action: "think",
                  message: (msg.status.currentStep || msg.status.state || "").slice(0, 60),
                  direction: prev[msg.taskId]?.[msg.agent]?.direction,
                  timestamp: Date.now(),
                },
              },
            }));
            break;

          case "AGENT_EXITED":
            appendLog(msg.taskId, {
              type: "exited",
              agent: msg.agent,
              data: `Agent ${msg.agent} exited (code: ${msg.exitCode})`,
              exitCode: msg.exitCode,
            });
            // Auto-avatar: agent leaves
            setAvatarStates((prev) => ({
              ...prev,
              [msg.taskId]: {
                ...(prev[msg.taskId] || {}),
                [msg.agent]: { action: "walk", message: "done", direction: "left", targetX: -10, timestamp: Date.now() },
              },
            }));
            break;

          case "AGENT_ERROR":
            appendError(msg.taskId, msg.agent, msg.error);
            // Auto-avatar: confused on error
            setAvatarStates((prev) => ({
              ...prev,
              [msg.taskId]: {
                ...(prev[msg.taskId] || {}),
                [msg.agent]: { action: "confused", message: "something went wrong", timestamp: Date.now() },
              },
            }));
            break;

          case "AGENT_RESULT":
            appendLog(msg.taskId, {
              type: "message",
              agent: msg.agent,
              data: `[${msg.agent}] result: ${msg.result?.summary || msg.result?.status || ""}`,
              result: msg.result,
            });
            // Auto-avatar: celebrate on result
            setAvatarStates((prev) => ({
              ...prev,
              [msg.taskId]: {
                ...(prev[msg.taskId] || {}),
                [msg.agent]: { action: "celebrate", message: "finished!", timestamp: Date.now() },
              },
            }));
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

          case "REVIEW_READY":
            // Server broadcasts this when XState enters reviewing.awaitingApproval
            if (msg.review) {
              setPendingReviews((prev) => ({
                ...prev,
                [msg.taskId]: msg.review,
              }));
              appendLog(msg.taskId, {
                type: "review_link",
                data: "review ready \u2014 click to view",
              });
            }
            break;

          case "PR_READY":
            // Server broadcasts this when XState enters merging.awaitingApproval and autoApprovePr is false
            if (msg.pr) {
              setPendingPrs((prev) => ({
                ...prev,
                [msg.taskId]: msg.pr,
              }));
              appendLog(msg.taskId, {
                type: "pr_link",
                data: "PR ready \u2014 click to review",
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
            // Clear pending review on review approval/action
            if (msg.approval === "review") {
              setPendingReviews((prev) => {
                const next = { ...prev };
                delete next[msg.taskId];
                return next;
              });
            }
            // Clear pending PR on pr approval
            if (msg.approval === "pr") {
              setPendingPrs((prev) => {
                const next = { ...prev };
                delete next[msg.taskId];
                return next;
              });
            }
            break;

          case "TASK_UPDATED":
            setTasks((prev) =>
              prev.map((t) =>
                t.id === msg.task.id ? { ...t, ...msg.task } : t
              )
            );
            break;

          case "MESSAGE_SENT":
            appendLog(msg.taskId, {
              type: "message",
              agent: msg.message?.from,
              data: `[${msg.message?.from}] ${msg.message?.type}: ${msg.message?.payload?.summary || msg.message?.payload?.message || ""}`,
              message: msg.message,
            });
            break;

          case "TASK_CONTINUED":
            appendLog(msg.taskId, {
              type: "system",
              data: `Continuing from ${msg.fromState}...`,
            });
            break;

          case "AVATAR_UPDATE":
            if (msg.taskId && msg.agent) {
              setAvatarStates((prev) => ({
                ...prev,
                [msg.taskId]: {
                  ...(prev[msg.taskId] || {}),
                  [msg.agent]: {
                    action: msg.action || "idle",
                    message: msg.message,
                    targetX: msg.targetX,
                    direction: msg.direction,
                    timestamp: Date.now(),
                  },
                },
              }));
            }
            break;

          case "MEMORY_UPDATED":
            if (msg.role && msg.entry) {
              setAgentMemory((prev) => ({
                ...prev,
                [msg.role]: [...(prev[msg.role] || []), msg.entry],
              }));
            }
            break;

          case "EVALUATION_STARTED":
            if (msg.projectPath) {
              setEvaluatingProjects((prev) => {
                const next = new Set(prev);
                next.add(msg.projectPath);
                return next;
              });
            }
            break;

          case "EVALUATION_COMPLETE":
            if (msg.projectPath && msg.result) {
              setEvaluationResults((prev) => ({
                ...prev,
                [msg.projectPath]: msg.result,
              }));
              setEvaluatingProjects((prev) => {
                const next = new Set(prev);
                next.delete(msg.projectPath);
                return next;
              });
            }
            break;

          case "VISUAL_TEST_STARTED":
            if (msg.projectPath) {
              setVisualTestingProjects((prev) => {
                const next = new Set(prev);
                next.add(msg.projectPath);
                return next;
              });
              setVisualTestProgress((prev) => {
                const next = { ...prev };
                delete next[msg.projectPath];
                return next;
              });
            }
            break;

          case "VISUAL_TEST_PROGRESS":
            if (msg.projectPath && msg.status?.currentStep) {
              setVisualTestProgress((prev) => ({
                ...prev,
                [msg.projectPath]: msg.status.currentStep,
              }));
            }
            break;

          case "VISUAL_TEST_COMPLETE":
            if (msg.projectPath && msg.result) {
              setVisualTestResults((prev) => ({
                ...prev,
                [msg.projectPath]: msg.result,
              }));
              setVisualTestingProjects((prev) => {
                const next = new Set(prev);
                next.delete(msg.projectPath);
                return next;
              });
              setVisualTestProgress((prev) => {
                const next = { ...prev };
                delete next[msg.projectPath];
                return next;
              });
            }
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

  const createTask = async (description, projectPath, { autoStart = false } = {}) => {
    const body = { description, projectPath };
    if (autoStart) body.autoStart = true;
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const approveTask = async (taskId, message, reviewComments) => {
    const body = { message: message || "Approved" };
    if (reviewComments) body.reviewComments = reviewComments;
    const res = await fetch(`${API_BASE}/tasks/${taskId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const clearPendingReview = (taskId) => {
    setPendingReviews((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const clearPendingPr = (taskId) => {
    setPendingPrs((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const reviewAction = async (taskId, action, comments, feedback) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, comments, feedback, message: `Review: ${action}` }),
    });
    if (!res.ok) throw new Error(`Failed to perform review action: ${res.statusText}`);
    return res.json();
  };

  const planAction = async (taskId, action, comments) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, comments, message: `Plan: ${action}` }),
    });
    if (!res.ok) throw new Error(`Failed to perform plan action: ${res.statusText}`);
    return res.json();
  };

  const startTask = async (taskId) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to start task: ${res.statusText}`);
    return res.json();
  };

  const stopTask = async (taskId) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to stop task: ${res.statusText}`);
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
    setPendingReviews((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    setPendingPrs((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    return res.json();
  };

  const continueTask = async (taskId) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to continue task: ${res.statusText}`);
    // Clear errors but keep logs for context
    setErrors((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    return res.json();
  };

  const clearErrors = (taskId) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const startAllTasks = async (taskIds) => {
    const results = await Promise.allSettled(taskIds.map((id) => startTask(id)));
    return results;
  };

  const updateTask = async (taskId, description) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error(`Failed to update task: ${res.statusText}`);
    return res.json();
  };

  const triggerEvaluation = async (projectPath) => {
    const res = await fetch(`${API_BASE}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Failed to start evaluation: ${res.statusText}`);
    }
    return res.json();
  };

  const triggerVisualTest = async (projectPath) => {
    const res = await fetch(`${API_BASE}/visual-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Failed to start visual test: ${res.statusText}`);
    }
    return res.json();
  };

  const launchIvyStudio = async (branch) => {
    const res = await fetch(`${API_BASE}/ivy-studio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Failed to launch Ivy Studio: ${res.statusText}`);
    }
    return res.json();
  };

  const deploy = async () => {
    const res = await fetch(`${API_BASE}/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Deploy failed: ${res.statusText}`);
    }
    return res.json();
  };

  return { tasks, connected, agentLogs, pendingPlans, pendingReviews, pendingPrs, errors, agentMemory, avatarStates, evaluationResults, evaluatingProjects, triggerEvaluation, visualTestResults, visualTestingProjects, visualTestProgress, triggerVisualTest, launchIvyStudio, deploy, createTask, startTask, startAllTasks, stopTask, restartTask, continueTask, sendEvent, deleteTask, approveTask, clearPendingPlan, clearPendingReview, clearPendingPr, reviewAction, planAction, clearErrors, updateTask };
}

export { stateKey };
