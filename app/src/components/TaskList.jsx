import { useState, useCallback, useRef } from "react";
import { stateKey } from "../hooks/useWorkflow.js";
import { useContextMenu } from "../hooks/useContextMenu.js";
import { STATE_LABELS, STATE_PRIORITY } from "../constants.js";
import { StatusIcon } from "./StatusIcon.jsx";
import { ContextMenu } from "./ContextMenu.jsx";
import { buildTaskMenuItems } from "../utils/taskMenuItems.js";
import "../styles/task-list.css";

const DONE_COLLAPSED_KEY = "taskList.doneCollapsed";

function getInitialCollapsed() {
  try {
    const stored = localStorage.getItem(DONE_COLLAPSED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function TaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  onDelete,
  onStart,
  onRestart,
  onViewPlan,
  onApprove,
  onEdit,
  pendingPlans,
}) {
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const [doneCollapsed, setDoneCollapsed] = useState(getInitialCollapsed);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef(null);

  const startEditing = useCallback((task) => {
    setEditingTaskId(task.id);
    setEditValue(task.description);
    // Focus the input on next render
    setTimeout(() => {
      if (editInputRef.current) editInputRef.current.focus();
    }, 0);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingTaskId(null);
    setEditValue("");
  }, []);

  const commitEditing = useCallback(async (taskId) => {
    const trimmed = editValue.trim();
    if (trimmed && onEdit) {
      try {
        await onEdit(taskId, trimmed);
      } catch (err) {
        console.error("Failed to update task:", err);
      }
    }
    setEditingTaskId(null);
    setEditValue("");
  }, [editValue, onEdit]);

  const handleToggle = useCallback((e) => {
    const isOpen = e.target.open;
    const collapsed = !isOpen;
    setDoneCollapsed(collapsed);
    try {
      localStorage.setItem(DONE_COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, []);

  if (tasks.length === 0) {
    return <div className="task-list-empty">no tasks yet</div>;
  }


  const activeTasks = [];
  const doneTasks = [];

  for (const task of tasks) {
    const sk = task.stateKey || stateKey(task.state);
    if (sk === "done") {
      doneTasks.push(task);
    } else {
      activeTasks.push(task);
    }
  }

  activeTasks.sort((a, b) => {
    const skA = a.stateKey || stateKey(a.state);
    const skB = b.stateKey || stateKey(b.state);
    const pA = STATE_PRIORITY[skA] ?? 2;
    const pB = STATE_PRIORITY[skB] ?? 2;
    if (pA !== pB) return pA - pB;
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tB - tA;
  });

  const renderTask = (task) => {
    const sk = task.stateKey || stateKey(task.state);
    const label = STATE_LABELS[sk] || sk;
    const isSelected = task.id === selectedTaskId;
    const isDone = sk === "done";
    const isFailed = sk === "failed";
    const isEditing = task.id === editingTaskId;

    let descClass = "task-row-description-text";
    if (isDone) descClass += " done";
    if (isFailed) descClass += " failed";

    return (
      <div
        key={task.id}
        className={`task-row${isSelected ? " selected" : ""}`}
        onClick={() => !isEditing && onSelectTask(isSelected ? null : task.id)}
        onContextMenu={(e) => !isEditing && openContextMenu(e, task)}
      >
        <div className="task-row-header">
          <StatusIcon stateKey={sk} size={16} />
          <span className="task-row-state-label">{label}</span>
          <div className="task-row-spacer" />
        </div>
        <div className="task-row-description">
          {isEditing ? (
            <input
              ref={editInputRef}
              className="task-row-edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEditing(task.id);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              onBlur={() => commitEditing(task.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={descClass}>{task.description}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="task-list">
      {activeTasks.map(renderTask)}

      {doneTasks.length > 0 && (
        <details
          className="task-list-done-section"
          open={!doneCollapsed}
          onToggle={handleToggle}
        >
          <summary className="task-list-done-summary">
            <span
              className="task-list-done-triangle"
              style={{
                transform: doneCollapsed ? "rotate(0deg)" : "rotate(90deg)",
              }}
            >
              ▶
            </span>
            <span>done</span>
            <span className="task-list-done-badge">
              {doneTasks.length}
            </span>
          </summary>

          <div className="task-list-done-items">
            {doneTasks.map(renderTask)}
          </div>
        </details>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildTaskMenuItems(contextMenu.target, {
            onStart,
            onRestart,
            onDelete,
            onViewPlan,
            onApprove,
            pendingPlans,
            onStartEditing: onEdit ? startEditing : undefined,
          })}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
