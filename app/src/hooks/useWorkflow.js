import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = `ws://${window.location.hostname}:3001`;

export function useWorkflow() {
  const [tasks, setTasks] = useState([]);
  const [connected, setConnected] = useState(false);
  // agentLogs: { [taskId]: Array<{ time, type, agent?, stream?, data?, status?, message?, exitCode? }> }
  const [agentLogs, setAgentLogs] = useState({});
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const appendLog = useCallback((taskId, entry) => {
    setAgentLogs((prev) => ({
      ...prev,
      [taskId]: [...(prev[taskId] || []), { time: new Date().toISOString(), ...entry }],
    }));
  }, []);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      switch (msg.type) {
        case "INIT":
          setTasks(msg.tasks);
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
                ? { ...t, state: msg.state, label: msg.label, context: msg.context }
                : t
            )
          );
          appendLog(msg.taskId, {
            type: "state",
            data: `State: ${msg.state}`,
            state: msg.state,
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
  }, [appendLog]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const createTask = async (description) => {
    const res = await fetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    return res.json();
  };

  const sendEvent = async (taskId, event) => {
    const res = await fetch(`/tasks/${taskId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
    return res.json();
  };

  const deleteTask = async (taskId) => {
    await fetch(`/tasks/${taskId}`, { method: "DELETE" });
  };

  return { tasks, connected, agentLogs, createTask, sendEvent, deleteTask };
}
