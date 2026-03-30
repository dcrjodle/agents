import { useState } from "react";
import { Play } from "lucide-react";
import { IconButton } from "./IconButton.jsx";

export function LaunchStudioButton({ onLaunch }) {
  const [showInput, setShowInput] = useState(false);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState(null);

  const handleLaunch = async () => {
    if (!branch.trim()) return;
    setError(null);
    try {
      await onLaunch(branch.trim());
      setShowInput(false);
      setBranch("");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLaunch();
    if (e.key === "Escape") {
      setShowInput(false);
      setBranch("");
    }
  };

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <IconButton
        icon={Play}
        title="Launch Ivy Studio on a branch"
        onClick={() => setShowInput(!showInput)}
      />

      {showInput && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 6,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: 8,
          minWidth: 240,
          zIndex: 50,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
            Launch Ivy Studio
          </div>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Branch name..."
            autoFocus
            style={{
              width: "100%",
              padding: "4px 8px",
              fontSize: 11,
              background: "var(--bg-input, var(--bg-inset))",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {error && (
            <div style={{ fontSize: 10, color: "var(--dot-failed, #ef4444)", marginTop: 4 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, gap: 4 }}>
            <button
              onClick={() => { setShowInput(false); setBranch(""); }}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                background: "transparent",
                color: "var(--text-dim)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleLaunch}
              disabled={!branch.trim()}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                background: branch.trim() ? "var(--dot-done, #22c55e)" : "var(--border)",
                color: branch.trim() ? "#000" : "var(--text-dim)",
                border: "none",
                borderRadius: 4,
                cursor: branch.trim() ? "pointer" : "default",
                fontWeight: 600,
              }}
            >
              Launch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
