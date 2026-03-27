import { useState, useRef } from "react";
import { Play, Settings } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

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
            <Button
              variant="tab"
              active={isActive}
              draggable
              onClick={() => onSelect(project)}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => {
                if (dragOverIndex === index) setDragOverIndex(null);
              }}
              className={[
                isDragOver && "drag-over",
                isDragging && "dragging",
              ].filter(Boolean).join(" ")}
            >
              {project.name}
            </Button>
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
    </div>
  );
}
