import { useState, useRef } from "react";
import { Play, Settings } from "lucide-react";
import { IconButton } from "./IconButton.jsx";

export function ProjectTabs({ projects, selected, onSelect, onReorder, onOpenSettings, onStartAll, idleCount }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNode = useRef(null);

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
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => {
                if (dragOverIndex === index) setDragOverIndex(null);
              }}
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
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {project.name}
              {isActive && onOpenSettings && (
                <span
                  role="button"
                  tabIndex={0}
                  title="project settings"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSettings(project);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onOpenSettings(project);
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    color: "var(--text-dim)",
                    opacity: 0.6,
                    cursor: "pointer",
                  }}
                >
                  <Settings size={11} />
                </span>
              )}
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
          </div>
        );
      })}
    </div>
  );
}
