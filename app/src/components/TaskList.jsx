import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { stateKey } from "../hooks/useWorkflow.js";
import { useContextMenu, useLongPress } from "../hooks/useContextMenu.js";
import { STATE_LABELS, STATE_PRIORITY } from "../constants.js";
import { StatusIcon } from "./StatusIcon.jsx";
import { ContextMenu } from "./ContextMenu.jsx";
import { buildTaskMenuItems, buildBulkTaskMenuItems } from "../utils/taskMenuItems.js";
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
  onStop,
  onRestart,
  onContinue,
  onViewPlan,
  onViewReview,
  onViewPr,
  onApprove,
  onEdit,
  pendingPlans,
  pendingReviews,
  pendingPrs,
}) {
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const [doneCollapsed, setDoneCollapsed] = useState(getInitialCollapsed);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef(null);

  // Drag-to-multi-select state
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);

  // Long-press ref — stores which task is being pressed so the single hook can act on it
  const longPressTaskRef = useRef(null);
  const longPressIsEditing = useRef(false);
  const longPressHandlers = useLongPress((pos) => {
    const task = longPressTaskRef.current;
    if (!task || longPressIsEditing.current) return;
    const fakeEvent = { clientX: pos.clientX, clientY: pos.clientY, preventDefault: () => {} };
    if (selectedTaskIds.size > 1 && selectedTaskIds.has(task.id)) {
      const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id));
      openContextMenu(fakeEvent, { _bulk: true, tasks: selectedTasks });
    } else {
      setSelectedTaskIds(new Set());
      openContextMenu(fakeEvent, task);
    }
  }, 500);

  // Refs for auto-scroll RAF loop
  const listRef = useRef(null);
  const rafRef = useRef(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const cleanupDragListeners = useRef(null);

  // End drag on mouseup (or window blur) anywhere
  useEffect(() => {
    const stopDrag = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setIsDraggingState(false);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (cleanupDragListeners.current) {
        cleanupDragListeners.current();
        cleanupDragListeners.current = null;
      }
    };
    document.addEventListener("mouseup", stopDrag);
    window.addEventListener("blur", stopDrag);
    return () => {
      document.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("blur", stopDrag);
    };
  }, []);

  // Clear multi-selection when clicking outside the task list
  useEffect(() => {
    if (selectedTaskIds.size === 0) return;

    const handleClickOutside = (e) => {
      // Don't clear selection if click was inside the task list
      if (listRef.current?.contains(e.target)) return;
      // Don't clear if clicking on context menu (handled separately)
      if (e.target.closest('.context-menu, .context-menu-overlay')) return;

      setSelectedTaskIds(new Set());
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedTaskIds.size]);

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
    const isMultiSelected = selectedTaskIds.has(task.id);
    const isDone = sk === "done";
    const isFailed = sk === "failed";
    const isEditing = task.id === editingTaskId;

    let descClass = "task-row-description-text";
    if (isDone) descClass += " done";
    if (isFailed) descClass += " failed";

    let rowClass = "task-row";
    if (isSelected) rowClass += " selected";
    if (isMultiSelected) rowClass += " multi-selected";

    return (
      <div
        key={task.id}
        className={rowClass}
        data-task-id={task.id}
        style={{ touchAction: "pan-y" }}
        onTouchStart={(e) => {
          longPressTaskRef.current = task;
          longPressIsEditing.current = isEditing;
          longPressHandlers.onTouchStart(e);
        }}
        onTouchMove={longPressHandlers.onTouchMove}
        onTouchEnd={longPressHandlers.onTouchEnd}
        onMouseDown={(e) => {
          if (isEditing) return;
          // Only primary button
          if (e.button !== 0) return;
          isDragging.current = true;
          setIsDraggingState(true);
          setSelectedTaskIds(new Set([task.id]));

          // Track mouse position during drag
          const handleMouseMove = (ev) => {
            mousePos.current = { x: ev.clientX, y: ev.clientY };
          };
          document.addEventListener("mousemove", handleMouseMove);
          cleanupDragListeners.current = () => {
            document.removeEventListener("mousemove", handleMouseMove);
          };

          // Start auto-scroll RAF loop
          const loop = () => {
            if (!isDragging.current) {
              rafRef.current = null;
              return;
            }
            const container = listRef.current?.closest(".task-list-container");
            if (container) {
              const { x, y } = mousePos.current;
              const rect = container.getBoundingClientRect();
              const SCROLL_ZONE = 60;
              const MAX_SPEED = 15;
              const distFromTop = y - rect.top;
              const distFromBottom = rect.bottom - y;
              let delta = 0;
              if (distFromTop >= 0 && distFromTop < SCROLL_ZONE) {
                delta = -Math.round(MAX_SPEED * (1 - distFromTop / SCROLL_ZONE));
              } else if (distFromBottom >= 0 && distFromBottom < SCROLL_ZONE) {
                delta = Math.round(MAX_SPEED * (1 - distFromBottom / SCROLL_ZONE));
              }
              if (delta !== 0) {
                container.scrollTop += delta;
                // Hit-test the element under cursor after scroll
                const el = document.elementFromPoint(x, y);
                const row = el?.closest(".task-row");
                if (row?.dataset.taskId) {
                  setSelectedTaskIds((prev) => {
                    if (prev.has(row.dataset.taskId)) return prev;
                    return new Set([...prev, row.dataset.taskId]);
                  });
                }
              }
            }
            rafRef.current = requestAnimationFrame(loop);
          };
          rafRef.current = requestAnimationFrame(loop);
        }}
        onMouseEnter={() => {
          if (!isDragging.current) return;
          setSelectedTaskIds((prev) => new Set([...prev, task.id]));
        }}
        onClick={(e) => {
          if (isEditing) return;
          // If we were dragging and selected multiple, don't trigger single-select
          if (selectedTaskIds.size > 1) return;
          // Clear multi-selection on plain click
          setSelectedTaskIds(new Set());
          // On mobile, always open the context menu instead of performing direct actions
          const isMobile = window.innerWidth <= 768;
          if (isMobile) {
            openContextMenu(e, task);
            return;
          }
          // Desktop: perform direct actions
          if (sk === "planning.awaitingApproval" && pendingPlans[task.id]) {
            onViewPlan(task.id);
          } else if (sk === "reviewing.awaitingApproval" && pendingReviews?.[task.id] && onViewReview) {
            onViewReview(task.id);
          } else if (sk === "merging.awaitingApproval" && pendingPrs?.[task.id] && onViewPr) {
            onViewPr(task.id);
          } else if (sk === "done" && task.context?.prUrl) {
            window.open(task.context.prUrl, "_blank", "noopener,noreferrer");
          } else {
            onSelectTask(isSelected ? null : task.id);
          }
        }}
        onContextMenu={(e) => {
          if (isEditing) return; // Allow native context menu (copy/paste) when editing
          e.preventDefault(); // Suppress native browser context menu (important on mobile)
          // If right-clicking inside a multi-selection, show bulk menu
          if (selectedTaskIds.size > 1 && selectedTaskIds.has(task.id)) {
            const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id));
            openContextMenu(e, { _bulk: true, tasks: selectedTasks });
          } else {
            // Clear multi-selection and show normal single-task menu
            setSelectedTaskIds(new Set());
            openContextMenu(e, task);
          }
        }}
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
              autoComplete="off"
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
            <span className={descClass}>
              {task.description}
              {isDone && task.context?.prUrl && (
                <ExternalLink size={11} style={{ marginLeft: 4, verticalAlign: "middle", flexShrink: 0 }} />
              )}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={listRef}
      className={`task-list${isDraggingState ? " task-list--dragging" : ""}`}
    >
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
              <ChevronRight size={14} strokeWidth={1.75} />
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
          items={
            contextMenu.target?._bulk
              ? buildBulkTaskMenuItems(contextMenu.target.tasks, {
                  onStart,
                  onStop,
                  onRestart,
                  onContinue,
                  onDelete,
                })
              : buildTaskMenuItems(contextMenu.target, {
                  onStart,
                  onStop,
                  onRestart,
                  onContinue,
                  onDelete,
                  onViewPlan,
                  onViewReview,
                  onViewPr,
                  onApprove,
                  onSelectTask,
                  pendingPlans,
                  pendingReviews,
                  pendingPrs,
                  onStartEditing: onEdit ? startEditing : undefined,
                })
          }
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
