import { useState } from "react";

/**
 * SettingsDialog - Modal dialog for application settings.
 *
 * @param {Object} props
 * @param {boolean} props.darkMode - Current dark mode state
 * @param {Function} props.onToggleDark - Toggle dark mode callback
 * @param {Array} props.projects - List of projects
 * @param {Function} props.onAddProject - Add project callback
 * @param {Function} props.onRemoveProject - Remove project callback
 * @param {Function} props.onClose - Close dialog callback
 */
export function SettingsDialog({
  darkMode,
  onToggleDark,
  projects,
  onAddProject,
  onRemoveProject,
  onClose,
}) {
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");

  const handleAdd = () => {
    if (newName.trim() && newPath.trim()) {
      onAddProject(newName.trim(), newPath.trim());
      setNewName("");
      setNewPath("");
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 24,
          width: 420,
          maxHeight: "80vh",
          overflowY: "auto",
          animation: "fade-in 0.2s ease-out",
        }}
      >
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            x
          </button>
        </div>

        {/* Dark mode toggle */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 0",
          borderBottom: "1px solid var(--border-light)",
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>dark mode</span>
          <button
            onClick={onToggleDark}
            style={{
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 3,
              border: "1px solid var(--border)",
              background: darkMode ? "var(--bg-muted)" : "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            {darkMode ? "on" : "off"}
          </button>
        </div>

        {/* Projects */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
            projects
          </span>
        </div>
        {projects.map((p) => (
          <div
            key={p.path}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 0",
              fontSize: 11,
            }}
          >
            <span style={{ color: "var(--text)" }}>{p.name}</span>
            <button
              onClick={() => onRemoveProject(p.path)}
              style={{
                background: "none",
                border: "none",
                color: "var(--dot-failed)",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
              }}
            >
              remove
            </button>
          </div>
        ))}

        {/* Add project */}
        <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="name"
            style={{
              flex: 1,
              fontSize: 11,
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: 3,
              background: "var(--bg-muted)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="path"
            style={{
              flex: 2,
              fontSize: 11,
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: 3,
              background: "var(--bg-muted)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              fontSize: 10,
              padding: "4px 10px",
              borderRadius: 3,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            add
          </button>
        </div>
      </div>
    </div>
  );
}
