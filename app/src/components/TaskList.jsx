import { useRef, useEffect } from "react";
import { stateKey } from "../hooks/useWorkflow.js";
import { STATE_LABELS } from "../constants.js";
import { StatusIcon } from "./StatusIcon.jsx";

export function TaskList({ tasks, selectedTaskId, onSelectTask, onDelete, onStart, onRestart, rowRefsCallback }) {
  const rowRefs = useRef({});

  // Report row refs to parent whenever tasks or selection changes
  useEffect(() => {
    if (rowRefsCallback) {
      rowRefsCallback(rowRefs.current);
    }
  });

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
        const isTerminal = isDone || isFailed;

        return (
          <div
            key={task.id}
            ref={(el) => { rowRefs.current[task.id] = el; }}
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: 4,
              background: isSelected ? "var(--bg-hover)" : "transparent",
              borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all 0.15s ease",
              position: "relative",
            }}
          >
            {/* Header bar with status + action buttons */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px 2px 12px",
            }}>
              <StatusIcon stateKey={sk} size={16} />

              <span style={{
                fontSize: 10,
                color: "var(--text-muted)",
                textTransform: "lowercase",
                letterSpacing: "0.03em",
              }}>
                {label}
              </span>

              <div style={{ flex: 1 }} />

              {/* Start button — only for idle tasks */}
              {isIdle && onStart && (
                <button
                  onClick={(e) => { e.stopPropagation(); onStart(task.id); }}
                  style={{
                    background: "none",
                    border: "1px solid var(--accent)",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 3,
                    opacity: 0.7,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = 1}
                  onMouseLeave={(e) => e.target.style.opacity = 0.7}
                  title="Start task"
                >
                  ▶
                </button>
              )}

              {/* Restart button — available for non-idle tasks */}
              {!isIdle && onRestart && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRestart(task.id); }}
                  style={{
                    background: "none",
                    border: "1px solid var(--text-dim)",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 3,
                    opacity: 0.6,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = 1}
                  onMouseLeave={(e) => e.target.style.opacity = 0.6}
                  title="Restart task (reset to idle)"
                >
                  ↺
                </button>
              )}

              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                style={{
                  background: "none",
                  border: "1px solid var(--text-dim)",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 3,
                  opacity: 0.4,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => e.target.style.opacity = 1}
                onMouseLeave={(e) => e.target.style.opacity = 0.4}
                title="Delete task"
              >
                ×
              </button>
            </div>

            {/* Task description row */}
            <div
              onClick={() => onSelectTask(isSelected ? null : task.id)}
              style={{
                padding: "2px 12px 8px 12px",
                paddingLeft: 36,
                cursor: "pointer",
              }}
            >
              <span style={{
                fontSize: 13,
                color: isDone ? "var(--text-dim)" : "var(--text)",
                textDecoration: isDone ? "line-through" : "none",
                opacity: isFailed ? 0.6 : 1,
              }}>
                {task.description}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
