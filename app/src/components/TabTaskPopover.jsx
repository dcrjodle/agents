import { createPortal } from "react-dom";
import { StatusIcon } from "./StatusIcon.jsx";
import { stateKey } from "../hooks/useWorkflow.js";
import "../styles/tab-task-popover.css";


function getActionLabel(sk) {
  if (sk === "idle") return "start";
  if (sk === "planning.awaitingApproval") return "view plan";
  if (sk === "merging.awaitingApproval") return "approve";
  if (sk === "failed") return "restart";
  if (sk === "done") return "view";
  return "open";
}

function handleTaskAction(task, pendingPlans, onStart, onRestart, onViewPlan, onApprove, onSelectTask) {
  const sk = task.stateKey || stateKey(task.state);
  if (sk === "idle") {
    onStart(task.id);
  } else if (sk === "planning.awaitingApproval" && pendingPlans[task.id]) {
    onViewPlan(task.id);
  } else if (sk === "merging.awaitingApproval") {
    onApprove(task.id);
  } else if (sk === "failed") {
    onRestart(task.id);
  } else {
    onSelectTask(task.id);
  }
}

export function TabTaskPopover({
  project,
  tasks,
  pendingPlans,
  anchorRect,
  onStart,
  onRestart,
  onViewPlan,
  onApprove,
  onSelectTask,
  onMouseEnter,
  onMouseLeave,
}) {
  const projectTasks = tasks.filter((t) => t.projectPath === project.path);
  const activeTasks = projectTasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk !== "done";
  });
  const doneTasks = projectTasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk === "done";
  });

  // Position below the anchor tab, clamped to viewport
  const POPOVER_WIDTH = 280;
  const GAP = 6;
  let left = anchorRect.left;
  if (left + POPOVER_WIDTH > window.innerWidth - 8) {
    left = window.innerWidth - POPOVER_WIDTH - 8;
  }
  const top = anchorRect.bottom + GAP;

  const popover = (
    <div
      className="tab-task-popover"
      style={{ top, left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {activeTasks.length === 0 && doneTasks.length === 0 && (
        <div className="tab-task-popover-empty">no tasks</div>
      )}

      {activeTasks.map((task) => {
        const sk = task.stateKey || stateKey(task.state);
        const actionLabel = getActionLabel(sk);
        return (
          <button
            key={task.id}
            className="tab-task-popover-row"
            onClick={() =>
              handleTaskAction(task, pendingPlans, onStart, onRestart, onViewPlan, onApprove, onSelectTask)
            }
          >
            <StatusIcon stateKey={sk} size={12} />
            <span className="tab-task-popover-description">{task.description}</span>
            <span className="tab-task-popover-action">{actionLabel}</span>
          </button>
        );
      })}

      {activeTasks.length > 0 && doneTasks.length > 0 && (
        <div className="tab-task-popover-separator" />
      )}

      {doneTasks.length > 0 && (
        <div className="tab-task-popover-done-count">
          +{doneTasks.length} done
        </div>
      )}
    </div>
  );

  return createPortal(popover, document.body);
}
