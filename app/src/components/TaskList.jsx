import { TaskCard } from "./TaskCard.jsx";

export function TaskList({ tasks, agentLogs, onSendEvent, onDelete }) {
  if (tasks.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#999", padding: 48, fontSize: 14 }}>
        No tasks yet. Create one above to get started.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          logs={agentLogs[task.id] || []}
          onSendEvent={onSendEvent}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
