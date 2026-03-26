export function ProjectTabs({ projects, selected, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid #2d2d2d" }}>
      {projects.map((project) => {
        const isActive = project.path === selected.path;
        return (
          <button
            key={project.path}
            onClick={() => onSelect(project)}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#e5e7eb" : "#6b7280",
              background: isActive ? "#2d2d2d" : "transparent",
              border: "none",
              borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "monospace",
              transition: "all 0.15s",
            }}
          >
            {project.name}
            <span style={{ color: "#4b5563", fontSize: 11, marginLeft: 8 }}>{project.path}</span>
          </button>
        );
      })}
    </div>
  );
}
