import { stateKey } from "../hooks/useWorkflow.js";
import { STATE_LABELS, STATE_COLORS } from "../constants.js";
import { StatusIcon } from "./StatusIcon.jsx";

export function TaskList({ tasks, selectedTaskId, onSelectTask, onDelete, onStart }) {
  if (tasks.length === 0) {
    return (
      <div style={{
        textAlign: "center",
        color: "var(--text-dim)",
        padding: "48px 0",
        fontSize: 12,
        letterSpacing: "0.02em",
      }}>
        no tasks yet
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {tasks.map((task) => {
        const sk = task.stateKey || stateKey(task.state);
        const label = STATE_LABELS[sk] || sk;
        const isSelected = task.id === selectedTaskId;
        const isDone = sk === "done";
        const isFailed = sk === "failed";
        const isIdle = sk === "idle";

        return (
          <div
            key={task.id}
            onClick={() => onSelectTask(isSelected ? null : task.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              cursor: "pointer",
              borderRadius: 4,
              background: isSelected ? "var(--bg-hover)" : "transparent",
              borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all 0.15s ease",
              position: "relative",
            }}
          >
            <StatusIcon stateKey={sk} size={14} />

            <span style={{
              flex: 1,
              fontSize: 13,
              color: isDone ? "var(--text-dim)" : "var(--text)",
              textDecoration: isDone ? "line-through" : "none",
              opacity: isFailed ? 0.6 : 1,
            }}>
              {task.description}
            </span>

            <span style={{
              fontSize: 10,
              color: "var(--text-muted)",
              textTransform: "lowercase",
              letterSpacing: "0.03em",
              flexShrink: 0,
            }}>
              {label}
            </span>

            {isIdle && onStart && (
              <button
                onClick={(e) => { e.stopPropagation(); onStart(task.id); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "2px 4px",
                  opacity: 0.6,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => e.target.style.opacity = 1}
                onMouseLeave={(e) => e.target.style.opacity = 0.6}
                title="start task"
              >
                ▶
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                fontSize: 11,
                padding: "2px 4px",
                opacity: 0.4,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => e.target.style.opacity = 1}
              onMouseLeave={(e) => e.target.style.opacity = 0.4}
              title="delete task"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
