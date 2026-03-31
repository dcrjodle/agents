import { useState } from "react";
import { VisualTestCharacter } from "./VisualTestCharacter.jsx";

function VisualTestHoverMenu({ isRunning, results, onTrigger, onStop, onSendToGithubber, eligibleTaskCount, progress }) {
  const hasResults = results && results.results && results.results.length > 0;
  const passedCount = hasResults ? results.results.filter((r) => r.status === "complete").length : 0;
  const totalCount = hasResults ? results.results.length : 0;
  const hasError = results && results.error;

  return (
    <div className="evaluator-hover-menu">
      <div className="evaluator-hover-menu-title">Visual Tester</div>

      {isRunning && (
        <div style={{ fontSize: 10, color: "var(--text-dim)", padding: "4px 0" }}>
          {progress || "running..."}
        </div>
      )}

      {hasError && (
        <div style={{
          background: "rgba(239,68,68,0.12)",
          border: "1px solid var(--dot-failed, #ef4444)",
          borderRadius: 4,
          padding: "6px 8px",
          color: "var(--dot-failed, #ef4444)",
          marginBottom: hasResults ? 8 : 0,
          fontSize: 10,
          wordBreak: "break-word",
        }}>
          {results.error}
        </div>
      )}

      {hasResults && (
        <>
          <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4, fontSize: 11 }}>
            Results ({passedCount}/{totalCount} passed)
          </div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 6 }}>
            {results.timestamp ? new Date(results.timestamp).toLocaleString() : ""}
          </div>
          {results.results.map((r) => (
            <div key={r.taskId || r.branchName} style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 0",
              borderBottom: "1px solid var(--border-light)",
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: r.status === "complete" ? "var(--dot-done, #22c55e)" : "var(--dot-failed, #ef4444)",
                flexShrink: 0,
              }} />
              <span style={{
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                fontSize: 10,
              }}>
                {r.branchName || (r.taskId ? `${r.taskId.slice(0, 8)}...` : "unknown")}
              </span>
              {r.error && (
                <span style={{ color: "var(--dot-failed, #ef4444)", fontSize: 9 }}>
                  {r.error.slice(0, 30)}
                </span>
              )}
            </div>
          ))}
          {passedCount > 0 && onSendToGithubber && (
            <button
              onClick={() => {
                const passedBranches = results.results
                  .filter((r) => r.status === "complete" && r.branchName)
                  .map((r) => r.branchName);
                if (passedBranches.length > 0) onSendToGithubber(passedBranches);
              }}
              className="evaluator-run-btn"
              style={{ marginTop: 6, background: "var(--dot-done, #22c55e)", color: "#000" }}
            >
              send {passedCount} branch{passedCount !== 1 ? "es" : ""} to githubber
            </button>
          )}
        </>
      )}

      {isRunning && (
        <div className="evaluator-hover-menu-footer">
          <button
            className="evaluator-run-btn"
            onClick={onStop}
            style={{ background: "var(--dot-failed, #ef4444)" }}
          >
            stop visual test
          </button>
        </div>
      )}

      {!isRunning && (
        <div className="evaluator-hover-menu-footer">
          <button
            className="evaluator-run-btn"
            disabled={eligibleTaskCount === 0}
            onClick={onTrigger}
          >
            {eligibleTaskCount > 0 ? `run visual tests (${eligibleTaskCount})` : "no tasks ready"}
          </button>
        </div>
      )}
    </div>
  );
}

export function VisualTestButton({ isRunning, results, onTrigger, onStop, onSendToGithubber, eligibleTaskCount, progress }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="evaluator-character"
      onMouseEnter={() => setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      {showMenu && (
        <VisualTestHoverMenu
          isRunning={isRunning}
          results={results}
          onTrigger={() => {
            if (!isRunning && eligibleTaskCount > 0) onTrigger();
          }}
          onStop={onStop}
          onSendToGithubber={onSendToGithubber}
          eligibleTaskCount={eligibleTaskCount}
          progress={progress}
        />
      )}
      <VisualTestCharacter
        isRunning={isRunning}
        disabled={isRunning || eligibleTaskCount === 0}
        onClick={() => {
          if (!isRunning && eligibleTaskCount > 0) onTrigger();
        }}
        style={{
          opacity: isRunning ? 1 : eligibleTaskCount > 0 ? 1 : 0.4,
        }}
      />
    </div>
  );
}
