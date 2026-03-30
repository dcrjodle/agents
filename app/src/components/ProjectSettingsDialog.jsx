import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

const API_BASE = "/api";

export function ProjectSettingsDialog({ project, onClose, onUpdated }) {
  const settings = project.settings || {};
  const [createPr, setCreatePr] = useState(settings.createPr !== false);
  const [autoApprovePlans, setAutoApprovePlans] = useState(settings.autoApprovePlans === true);
  const [testingMode, setTestingMode] = useState(settings.testingMode || "build");
  const [agentMode, setAgentMode] = useState(settings.agentMode || "sdk");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/config/projects/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: project.path, settings: { createPr, autoApprovePlans, testingMode, agentMode } }),
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
          <IconButton icon={X} onClick={onClose} title="close" />
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
          <Button variant="toggle" active={createPr} size="sm" onClick={() => setCreatePr((v) => !v)}>
            {createPr ? "on" : "off"}
          </Button>
        </label>

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
            <div style={{ fontSize: 12, color: "var(--text)" }}>auto-approve plans</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
              {autoApprovePlans ? "plans are approved automatically without review" : "plans require manual approval before running"}
            </div>
          </div>
          <Button variant="toggle" active={autoApprovePlans} size="sm" onClick={() => setAutoApprovePlans((v) => !v)}>
            {autoApprovePlans ? "on" : "off"}
          </Button>
        </label>

        {/* Testing mode */}
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 6 }}>testing mode</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["build", "sync", "async"].map((mode) => (
              <Button
                key={mode}
                variant="seg"
                active={testingMode === mode}
                onClick={() => setTestingMode(mode)}
                style={{ flex: 1 }}
              >
                {mode}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            {testingMode === "build" && "run build + tests only (default)"}
            {testingMode === "sync" && "visual test all tasks in parallel with browser screenshots"}
            {testingMode === "async" && "queue tasks for one-at-a-time visual testing"}
          </div>
        </div>

        {/* Agent mode */}
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 6 }}>agent runtime</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["sdk", "cli"].map((mode) => (
              <Button
                key={mode}
                variant="seg"
                active={agentMode === mode}
                onClick={() => setAgentMode(mode)}
                style={{ flex: 1 }}
              >
                {mode}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            {agentMode === "sdk" && "use anthropic agent sdk to spawn agents (requires api key)"}
            {agentMode === "cli" && "use headless claude code cli to spawn agents (uses local auth)"}
          </div>
        </div>

        {/* Save */}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" size="md" onClick={onClose}>
            cancel
          </Button>
          <Button variant="primary" size="md" disabled={saving} onClick={handleSave}>
            {saving ? "saving..." : "save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
