import { useState, useCallback } from "react";
import { stateKey } from "../hooks/useWorkflow.js";
import { STATE_LABELS } from "../constants.js";
import { StatusIcon } from "./StatusIcon.jsx";
import { ContextMenu } from "./ContextMenu.jsx";
import "../styles/task-list.css";

export function TaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  onDelete,
  onStart,
  onRestart,
  onViewPlan,
  onApprove,
  pendingPlans,
}) {
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = useCallback((e, task) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  if (tasks.length === 0) {
    return <div className="task-list-empty">no tasks yet</div>;
  }

  const buildMenuItems = (task) => {
    const sk = task.stateKey || stateKey(task.state);
    const isIdle = sk === "idle";
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

  return (
    <div className="task-list">
      {tasks.map((task) => {
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
      })}

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
