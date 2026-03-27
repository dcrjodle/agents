import { useState, useCallback } from "react";
import { stateKey } from "../hooks/useWorkflow.js";
import { STATE_LABELS, STATE_PRIORITY } from "../constants.js";
import { StatusIcon } from "./StatusIcon.jsx";
import { ContextMenu } from "./ContextMenu.jsx";
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
  onStop,
  onViewPlan,
  onApprove,
  pendingPlans,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [doneCollapsed, setDoneCollapsed] = useState(getInitialCollapsed);

  const handleContextMenu = useCallback((e, task) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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

  const buildMenuItems = (task) => {
    const sk = task.stateKey || stateKey(task.state);
    const isIdle = sk === "idle";
    const isDone = sk === "done";
    const isFailed = sk === "failed";
    const isRunning = !isIdle && !isDone && !isFailed;
    const items = [];

    if (isIdle && onStart) {
      items.push({
        label: "start",
        icon: "\u25B6",
        action: () => onStart(task.id),
      });
    }

    if (!isIdle && onRestart) {
      items.push({
        label: "restart",
        icon: "\u21BA",
        action: () => onRestart(task.id),
      });
    }

    if (isRunning && onStop) {
      items.push({
        label: "stop",
        icon: "\u23F9",
        action: () => onStop(task.id),
      });
    }

    if (sk === "planning.awaitingApproval" && pendingPlans?.[task.id] && onViewPlan) {
      items.push({
        label: "view plan",
        icon: "\uD83D\uDCCB",
        action: () => onViewPlan(task.id),
      });
    }

    if (sk === "merging.awaitingApproval" && onApprove) {
      items.push({
        label: "approve pr",
        icon: "\u2714",
        action: () => onApprove(task.id),
      });
    }

    if (items.length > 0) {
      items.push({ separator: true });
    }

    items.push({
      label: "delete",
      icon: "\u00D7",
      danger: true,
      action: () => onDelete(task.id),
    });

    return items;
  };

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

    let descClass = "task-row-description-text";
    if (isDone) descClass += " done";
    if (isFailed) descClass += " failed";

    return (
      <div
        key={task.id}
        className={`task-row${isSelected ? " selected" : ""}`}
        onClick={() => onSelectTask(isSelected ? null : task.id)}
        onContextMenu={(e) => handleContextMenu(e, task)}
      >
        <div className="task-row-header">
          <StatusIcon stateKey={sk} size={16} />
          <span className="task-row-state-label">{label}</span>
          <div className="task-row-spacer" />
        </div>
        <div className="task-row-description">
          <span className={descClass}>{task.description}</span>
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
          items={buildMenuItems(contextMenu.task)}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
