import { useWorkflow } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";

export function App() {
  const { tasks, connected, agentLogs, createTask, sendEvent, deleteTask } = useWorkflow();

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Agent Workflows</h1>
        <span
          style={{
            fontSize: 12,
            color: connected ? "#22c55e" : "#ef4444",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#22c55e" : "#ef4444",
              display: "inline-block",
            }}
          />
          {connected ? "connected" : "disconnected"}
        </span>
      </header>

      <CreateTask onCreate={createTask} />
      <TaskList tasks={tasks} agentLogs={agentLogs} onSendEvent={sendEvent} onDelete={deleteTask} />
    </div>
  );
}
