import { Play, Pencil, ClipboardList, Check, RotateCcw, X, Square } from "lucide-react";
import { stateKey } from "../hooks/useWorkflow.js";

/**
 * Build bulk context menu items for a set of selected tasks.
 *
 * @param {Array} tasks - Array of selected task objects
 * @param {object} handlers - Handler functions:
 *   - onStart(taskId)
 *   - onRestart(taskId)
 *   - onContinue(taskId)
 *   - onDelete(taskId)
 * @returns {Array} Menu items
 */
export function buildBulkTaskMenuItems(tasks, handlers = {}) {
  const { onStart, onStop, onRestart, onContinue, onDelete } = handlers;

  const idleTasks = tasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk === "idle";
  });
  const nonIdleTasks = tasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk !== "idle";
  });
  const runningTasks = tasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk !== "idle" && sk !== "done" && sk !== "failed";
  });
  const continuableTasks = tasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk === "failed" && t.context?.failedFrom;
  });

  const items = [];

  if (idleTasks.length > 0 && onStart) {
    items.push({
      label: `start ${idleTasks.length}`,
      icon: Play,
      action: () => idleTasks.forEach((t) => onStart(t.id)),
    });
  }

  if (runningTasks.length > 0 && onStop) {
    items.push({
      label: `stop ${runningTasks.length}`,
      icon: Square,
      danger: true,
      action: () => runningTasks.forEach((t) => onStop(t.id)),
    });
  }

  if (continuableTasks.length > 0 && onContinue) {
    items.push({
      label: `continue ${continuableTasks.length}`,
      icon: Play,
      action: () => continuableTasks.forEach((t) => onContinue(t.id)),
    });
  }

  if (nonIdleTasks.length > 0 && onRestart) {
    items.push({
      label: `restart ${nonIdleTasks.length}`,
      icon: RotateCcw,
      action: () => nonIdleTasks.forEach((t) => onRestart(t.id)),
    });
  }

  if (items.length > 0) {
    items.push({ separator: true });
  }

  if (onDelete) {
    items.push({
      label: `delete ${tasks.length}`,
      icon: X,
      danger: true,
      action: () => tasks.forEach((t) => onDelete(t.id)),
    });
  }

  return items;
}

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
    onStop,
    onRestart,
    onContinue,
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
      icon: Play,
      action: () => onStart(task.id),
    });
  }

  if (isIdle && onStartEditing) {
    items.push({
      label: "edit",
      icon: Pencil,
      action: () => onStartEditing(task),
    });
  }

  const isRunning = !isIdle && sk !== "done" && sk !== "failed";
  if (isRunning && onStop) {
    items.push({
      label: "stop",
      icon: Square,
      danger: true,
      action: () => onStop(task.id),
    });
  }

  if (sk === "planning.awaitingApproval" && pendingPlans?.[task.id] && onViewPlan) {
    items.push({
      label: "view plan",
      icon: ClipboardList,
      action: () => onViewPlan(task.id),
    });
  }

  if (sk === "merging.awaitingApproval" && onApprove) {
    items.push({
      label: "approve pr",
      icon: Check,
      action: () => onApprove(task.id),
    });
  }

  if (items.length > 0) {
    items.push({ separator: true });
  }

  // "continue" — resume from failure point (only when failedFrom is recorded)
  if (sk === "failed" && task.context?.failedFrom && onContinue) {
    items.push({
      label: "continue",
      icon: Play,
      action: () => onContinue(task.id),
    });
  }

  if (!isIdle && onRestart) {
    items.push({
      label: "restart",
      icon: RotateCcw,
      action: () => onRestart(task.id),
    });
  }

  if (onDelete) {
    items.push({
      label: "delete",
      icon: X,
      danger: true,
      action: () => onDelete(task.id),
    });
  }

  return items;
}
