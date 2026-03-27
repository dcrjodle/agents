import { useState } from "react";

const API_BASE = "/api";

export function ProjectSettingsDialog({ project, onClose, onUpdated }) {
  const settings = project.settings || {};
  const [createPr, setCreatePr] = useState(settings.createPr !== false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/config/projects/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: project.path, settings: { createPr } }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (onUpdated) onUpdated(updated);
        onClose();
      }
    } finally {
      setSaving(false);
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
          width: 360,
          animation: "fade-in 0.2s ease-out",
        }}
      >
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {project.name} settings
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

        {/* Workflow settings */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
            workflow
          </span>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
            borderBottom: "1px solid var(--border-light)",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "var(--text)" }}>create pull request</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
              {createPr ? "branch is pushed, PR created for review" : "changes are pushed directly to main"}
            </div>
          </div>
          <button
            onClick={() => setCreatePr((v) => !v)}
            style={{
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 3,
              border: "1px solid var(--border)",
              background: createPr ? "var(--bg-muted)" : "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              minWidth: 32,
            }}
          >
            {createPr ? "on" : "off"}
          </button>
        </label>

        {/* Save */}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 11,
              padding: "5px 14px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              fontSize: 11,
              padding: "5px 14px",
              borderRadius: 4,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "#fff",
              cursor: saving ? "default" : "pointer",
              fontFamily: "var(--font-mono)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "saving..." : "save"}
          </button>
        </div>
      </div>
    </div>
  );
}
