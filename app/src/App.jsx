import { useWorkflow } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";

export function App() {
  const { tasks, connected, createTask, sendEvent, deleteTask } = useWorkflow();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Agent Workflows</h1>
        <span style={{ fontSize: 12, color: connected ? "#22c55e" : "#ef4444" }}>
          {connected ? "connected" : "disconnected"}
        </span>
      </header>

      <CreateTask onCreate={createTask} />
      <TaskList tasks={tasks} onSendEvent={sendEvent} onDelete={deleteTask} />
    </div>
  );
}
