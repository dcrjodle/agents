export function ProjectTabs({ projects, selected, onSelect }) {
  return (
    <div style={{
      display: "flex",
      gap: 0,
      borderBottom: "1px solid var(--border)",
      marginBottom: 16,
    }}>
      {projects.map((project) => {
        const isActive = project.path === selected.path;
        return (
          <button
            key={project.path}
            onClick={() => onSelect(project)}
            style={{
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--text)" : "var(--text-muted)",
              background: isActive ? "var(--bg-surface)" : "transparent",
              border: "none",
              borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              transition: "all 0.15s",
              letterSpacing: "0.01em",
            }}
          >
            {project.name}
          </button>
        );
      })}
    </div>
  );
}
