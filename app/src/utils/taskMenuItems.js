import { stateKey } from "../hooks/useWorkflow.js";

/**
 * Build context menu items for a task.
 *
 * @param {object} task - The task object
 * @param {object} handlers - Handler functions:
 *   - onStart(taskId) — start the task (only shown for idle tasks)
 *   - onRestart(taskId) — restart the task (only shown for non-idle tasks)
 *   - onDelete(taskId) — delete the task
 *   - onViewPlan(taskId) — view the plan (only shown when plan is awaiting approval)
 *   - onApprove(taskId) — approve a PR (only shown when PR is awaiting approval)
 *   - pendingPlans — map of taskId → plan (used to check if plan is available)
 *   - onStartEditing(task) — trigger inline editing (optional; "edit" item hidden if omitted)
 * @returns {Array} Menu items (may include separator objects with { separator: true })
 */
export function buildTaskMenuItems(task, handlers = {}) {
  const {
    onStart,
    onRestart,
    onDelete,
    onViewPlan,
    onApprove,
    pendingPlans,
    onStartEditing,
  } = handlers;

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

  if (isIdle && onStartEditing) {
    items.push({
      label: "edit",
      icon: "\u270E",
      action: () => onStartEditing(task),
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

  if (!isIdle && onRestart) {
    items.push({
      label: "restart",
      icon: "\u21BA",
      action: () => onRestart(task.id),
    });
  }

  if (onDelete) {
    items.push({
      label: "delete",
      icon: "\u00D7",
      danger: true,
      action: () => onDelete(task.id),
    });
  }

  return items;
}
