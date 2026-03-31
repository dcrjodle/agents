import { useState } from "react";
import { StudioCharacter } from "./StudioCharacter.jsx";

function StudioHoverMenu({ onLaunch, isRunning }) {
  const [branch, setBranch] = useState("");
  const [error, setError] = useState(null);

  const handleLaunch = async () => {
    if (!branch.trim()) return;
    setError(null);
    try {
      await onLaunch(branch.trim());
      setBranch("");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLaunch();
  };

  return (
    <div className="evaluator-hover-menu">
      <div className="evaluator-hover-menu-title">Ivy Studio</div>

      {isRunning && (
        <div style={{ fontSize: 10, color: "var(--dot-developing, #3b82f6)", padding: "4px 0" }}>
          studio is running...
        </div>
      )}

      {!isRunning && (
        <>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="branch name..."
            autoFocus
            autoComplete="off"
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
              marginBottom: 6,
            }}
          />
          {error && (
            <div style={{ fontSize: 10, color: "var(--dot-failed, #ef4444)", marginBottom: 4 }}>
              {error}
            </div>
          )}
          <div className="evaluator-hover-menu-footer">
            <button
              className="evaluator-run-btn"
              disabled={!branch.trim()}
              onClick={handleLaunch}
            >
              launch studio
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function LaunchStudioButton({ onLaunch, isRunning }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="evaluator-character"
      onMouseEnter={() => setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      {showMenu && (
        <StudioHoverMenu
          onLaunch={onLaunch}
          isRunning={isRunning}
        />
      )}
      <StudioCharacter
        isRunning={isRunning}
        disabled={isRunning}
        onClick={() => {}}
      />
    </div>
  );
}
