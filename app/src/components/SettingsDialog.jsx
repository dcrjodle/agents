import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

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
const API_BASE = "/api";

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
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
          <IconButton icon={X} onClick={onClose} title="close" />
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
          <Button variant="toggle" active={darkMode} size="sm" onClick={onToggleDark}>
            {darkMode ? "on" : "off"}
          </Button>
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
            <Button variant="danger" size="sm" onClick={() => onRemoveProject(p.path)}>
              remove
            </Button>
          </div>
        ))}

        {/* Add project */}
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
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
            <Button variant="secondary" size="sm" onClick={handleAdd}>
              add
            </Button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
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
            <Button
              variant="secondary"
              size="sm"
              disabled={picking}
              onClick={async () => {
                if (picking) return;
                setPicking(true);
                try {
                  const res = await fetch(`${API_BASE}/config/pick-folder`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setNewPath(data.path);
                    if (!newName) setNewName(data.name);
                  }
                } catch (err) {
                  console.error("pick-folder failed:", err);
                } finally {
                  setPicking(false);
                }
              }}
            >
              {picking ? "…" : "browse"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
