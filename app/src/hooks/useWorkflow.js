import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = `ws://${window.location.hostname}:3001`;

export function useWorkflow() {
  const [tasks, setTasks] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect with backoff
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
          break;

        case "STATE_UPDATE":
          setTasks((prev) =>
            prev.map((t) =>
              t.id === msg.taskId
                ? { ...t, state: msg.state, label: msg.label, context: msg.context }
                : t
            )
          );
          break;

        case "TASK_DELETED":
          setTasks((prev) => prev.filter((t) => t.id !== msg.taskId));
          break;
      }
    };
  }, []);

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

  return { tasks, connected, createTask, sendEvent, deleteTask };
}
