import { TaskCard } from "./TaskCard.jsx";

const COLUMNS = [
  { label: "Todo", key: "todo" },
  { label: "Planned", key: "planned" },
  { label: "In Progress", key: "in_progress" },
  { label: "Testing", key: "testing" },
  { label: "Reviewing", key: "reviewing" },
  { label: "Published", key: "published" },
  { label: "Failed", key: "failed" },
];

export function TaskList({ tasks, onSendEvent, onDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 12 }}>
      {COLUMNS.map((col) => (
        <div key={col.key}>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "#666", marginBottom: 8 }}>
            {col.label}
            <span style={{ marginLeft: 4, color: "#999" }}>
              {tasks.filter((t) => t.label === col.key).length}
            </span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks
              .filter((t) => t.label === col.key)
              .map((task) => (
                <TaskCard key={task.id} task={task} onSendEvent={onSendEvent} onDelete={onDelete} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
