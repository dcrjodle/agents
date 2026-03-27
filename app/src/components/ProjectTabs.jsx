import { useState, useRef } from "react";
import { Play, Settings } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { TabTaskPopover } from "./TabTaskPopover.jsx";

export function ProjectTabs({ projects, selected, onSelect, onReorder, onOpenSettings, onStartAll, idleCount, tasks = [], pendingPlans = {}, onStart, onRestart, onViewPlan, onApprove, onSelectTask }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNode = useRef(null);
  const [hoveredProject, setHoveredProject] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const hoverTimerRef = useRef(null);
  const leaveTimerRef = useRef(null);

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    dragNode.current = e.target;
    e.dataTransfer.effectAllowed = "move";
    // Delay to allow the browser to capture the drag image before styling
    setTimeout(() => {
      dragNode.current?.classList.add("dragging");
    }, 0);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex === null || index === dragIndex) {
      setDragOverIndex(null);
      return;
    }
    setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordered = [...projects];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    if (onReorder) onReorder(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    if (dragNode.current) {
      dragNode.current.classList.remove("dragging");
    }
    dragNode.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
    // Cancel any pending hover timers when drag ends
    clearTimeout(hoverTimerRef.current);
    clearTimeout(leaveTimerRef.current);
    setHoveredProject(null);
  };

  const handleTabMouseEnter = (e, project) => {
    clearTimeout(leaveTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => {
      setHoveredProject(project);
      setAnchorRect(rect);
    }, 250);
  };

  const handleTabMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setHoveredProject(null);
    }, 150);
  };

  const handlePopoverMouseEnter = () => {
    clearTimeout(leaveTimerRef.current);
  };

  const handlePopoverMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => {
      setHoveredProject(null);
    }, 150);
  };

  return (
    <div style={{
      display: "flex",
      gap: 0,
      borderBottom: "1px solid var(--border)",
      marginBottom: 16,
    }}>
      {projects.map((project, index) => {
        const isActive = project.path === selected.path;
        const isDragging = dragIndex === index;
        const isDragOver = dragOverIndex === index;
        return (
          <div
            key={project.path}
            style={{
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <button
              draggable
              onClick={() => onSelect(project)}
              onDragStart={(e) => {
                clearTimeout(hoverTimerRef.current);
                clearTimeout(leaveTimerRef.current);
                setHoveredProject(null);
                handleDragStart(e, index);
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => {
                if (dragOverIndex === index) setDragOverIndex(null);
              }}
              onMouseEnter={(e) => handleTabMouseEnter(e, project)}
              onMouseLeave={handleTabMouseLeave}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--text)" : "var(--text-muted)",
                background: isActive ? "var(--bg-surface)" : "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                borderLeft: isDragOver ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: isDragging ? "grabbing" : "grab",
                fontFamily: "var(--font-mono)",
                transition: "all 0.15s",
                letterSpacing: "0.01em",
                opacity: isDragging ? 0.4 : 1,
              }}
            >
              {project.name}
            </button>
            {isActive && idleCount > 0 && onStartAll && (
              <IconButton
                icon={Play}
                size={11}
                title={`Start all ${idleCount} idle task${idleCount !== 1 ? "s" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onStartAll();
                }}
                style={{
                  color: "var(--accent)",
                  opacity: 0.8,
                  padding: "4px",
                }}
              />
            )}
            {isActive && onOpenSettings && (
              <IconButton
                icon={Settings}
                size={11}
                title="project settings"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings(project);
                }}
                style={{
                  color: "var(--text-dim)",
                  opacity: 0.6,
                  padding: "4px",
                }}
              />
            )}
          </div>
        );
      })}
      {hoveredProject && anchorRect && (
        <TabTaskPopover
          project={hoveredProject}
          tasks={tasks}
          pendingPlans={pendingPlans}
          anchorRect={anchorRect}
          onStart={onStart}
          onRestart={onRestart}
          onViewPlan={onViewPlan}
          onApprove={onApprove}
          onSelectTask={onSelectTask}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        />
      )}
    </div>
  );
}
