import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

const API_BASE = "/api";
const DEFAULT_CLONE_ROOT = "/home/joel.bystedt/projects";

function parseGithubUrl(url) {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function SettingsDialog({
  darkMode,
  onToggleDark,
  projects,
  onAddProject,
  onRemoveProject,
  onClose,
  onCloneRepo,
}) {
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleGithubUrlChange = (url) => {
    setGithubUrl(url);
    setCloneError(null);
    const parsed = parseGithubUrl(url);
    if (parsed) {
      setNewName(parsed.repo);
      setNewPath(`${DEFAULT_CLONE_ROOT}/${parsed.repo}`);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newPath.trim()) return;
    setCloneError(null);

    // If a GitHub URL is provided, clone first
    if (githubUrl.trim() && onCloneRepo) {
      setCloning(true);
      try {
        await onCloneRepo(githubUrl.trim(), newPath.trim());
      } catch (err) {
        // If directory already exists, that's fine — just add the project
        if (!err.message.includes("already exists")) {
          setCloneError(err.message);
          setCloning(false);
          return;
        }
      }
      setCloning(false);
    }

    await onAddProject(newName.trim(), newPath.trim());
    setNewName("");
    setNewPath("");
    setGithubUrl("");
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
          <input
            value={githubUrl}
            onChange={(e) => handleGithubUrlChange(e.target.value)}
            placeholder="github url (auto-fills name & path)"
            style={{
              fontSize: 11,
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: 3,
              background: "var(--bg-muted)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
            }}
          />
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
            <Button variant="secondary" size="sm" disabled={cloning} onClick={handleAdd}>
              {cloning ? "cloning..." : githubUrl.trim() ? "clone & add" : "add"}
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
          {cloneError && (
            <div style={{ fontSize: 10, color: "var(--accent-red, #ef4444)" }}>
              {cloneError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
