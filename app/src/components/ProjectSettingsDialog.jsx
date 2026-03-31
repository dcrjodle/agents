import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

const API_BASE = "/api";

export function ProjectSettingsDialog({ project, onClose, onUpdated }) {
  const settings = project.settings || {};
  const [projectPath, setProjectPath] = useState(project.path);
  const [createPr, setCreatePr] = useState(settings.createPr !== false);
  const [autoApprovePlans, setAutoApprovePlans] = useState(settings.autoApprovePlans === true);
  const [autoApproveReviews, setAutoApproveReviews] = useState(settings.autoApproveReviews === true);
  const [autoApprovePr, setAutoApprovePr] = useState(settings.autoApprovePr !== false);
  const [skipTesting, setSkipTesting] = useState(settings.skipTesting === true);
  const [agentMode, setAgentMode] = useState(settings.agentMode || "sdk");
  const [maxRetries, setMaxRetries] = useState(settings.maxRetries ?? 5);
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
      const trimmedPath = projectPath.trim();

      // Update path if changed
      if (trimmedPath && trimmedPath !== project.path) {
        const pathRes = await fetch(`${API_BASE}/config/projects/path`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPath: project.path, newPath: trimmedPath }),
        });
        if (!pathRes.ok) {
          const err = await pathRes.json().catch(() => ({}));
          alert(err.error || "Failed to update project path");
          setSaving(false);
          return;
        }
      }

      const res = await fetch(`${API_BASE}/config/projects/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: trimmedPath || project.path, settings: { createPr, autoApprovePr, autoApprovePlans, autoApproveReviews, skipTesting, agentMode, maxRetries } }),
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

        {/* Project path */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
            project path
          </div>
          <input
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="/path/to/project"
            autoComplete="off"
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontSize: 11,
              padding: "6px 8px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-input, var(--bg))",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            working directory for agents on the server
          </div>
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

        {createPr && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 0",
              paddingLeft: 16,
              borderBottom: "1px solid var(--border-light)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--text)" }}>skip PR creation approval step</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                {autoApprovePr ? "PR is created automatically without waiting for approval" : "pause before creating PR so you can review the diff"}
              </div>
            </div>
            <Button variant="toggle" active={autoApprovePr} size="sm" onClick={() => setAutoApprovePr((v) => !v)}>
              {autoApprovePr ? "on" : "off"}
            </Button>
          </label>
        )}

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
            <div style={{ fontSize: 12, color: "var(--text)" }}>auto-approve reviews</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
              {autoApproveReviews ? "reviews are approved automatically, overriding the reviewer's verdict" : "reviews require manual approval before pushing"}
            </div>
          </div>
          <Button variant="toggle" active={autoApproveReviews} size="sm" onClick={() => setAutoApproveReviews((v) => !v)}>
            {autoApproveReviews ? "on" : "off"}
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
            <div style={{ fontSize: 12, color: "var(--text)" }}>skip testing</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
              {skipTesting ? "testing stage is skipped, code goes straight to review" : "tester agent runs after each commit"}
            </div>
          </div>
          <Button variant="toggle" active={skipTesting} size="sm" onClick={() => setSkipTesting((v) => !v)}>
            {skipTesting ? "on" : "off"}
          </Button>
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
            borderBottom: "1px solid var(--border-light)",
            cursor: "default",
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "var(--text)" }}>max retries</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
              auto-continue limit for failed agents (1–10)
            </div>
          </div>
          <input
            type="number"
            min={1}
            max={10}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
            autoComplete="off"
            style={{
              width: 48,
              textAlign: "center",
              background: "var(--bg-input, var(--bg))",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              fontSize: 12,
              padding: "4px 6px",
            }}
          />
        </label>

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
