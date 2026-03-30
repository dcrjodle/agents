import { useState } from "react";
import { Camera } from "lucide-react";
import { IconButton } from "./IconButton.jsx";

export function VisualTestButton({ isRunning, results, onTrigger, eligibleTaskCount }) {
  const [showResults, setShowResults] = useState(false);

  const hasResults = results && results.results && results.results.length > 0;
  const passedCount = hasResults ? results.results.filter((r) => r.status === "complete").length : 0;
  const totalCount = hasResults ? results.results.length : 0;

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <IconButton
        icon={Camera}
        title={
          isRunning
            ? "Visual test running..."
            : eligibleTaskCount > 0
              ? `Run visual tests (${eligibleTaskCount} task${eligibleTaskCount !== 1 ? "s" : ""} ready)`
              : "No tasks awaiting PR approval"
        }
        disabled={isRunning || eligibleTaskCount === 0}
        onClick={() => {
          if (!isRunning && eligibleTaskCount > 0) {
            onTrigger();
          }
        }}
        onMouseEnter={() => hasResults && setShowResults(true)}
        onMouseLeave={() => setShowResults(false)}
        style={{
          opacity: isRunning ? 1 : eligibleTaskCount > 0 ? 1 : 0.4,
          animation: isRunning ? "pulse 1.5s ease-in-out infinite" : undefined,
        }}
      />

      {/* Badge showing eligible count or last result */}
      {!isRunning && eligibleTaskCount > 0 && (
        <span style={{
          position: "absolute",
          top: -2,
          right: -2,
          background: "var(--dot-awaiting, #f59e0b)",
          color: "#000",
          fontSize: 9,
          fontWeight: 700,
          borderRadius: "50%",
          width: 14,
          height: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}>
          {eligibleTaskCount}
        </span>
      )}

      {isRunning && (
        <span style={{
          position: "absolute",
          top: -2,
          right: -2,
          background: "var(--dot-developing, #3b82f6)",
          borderRadius: "50%",
          width: 10,
          height: 10,
          animation: "pulse 1s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}

      {/* Results popover */}
      {showResults && hasResults && !isRunning && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 6,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: 10,
          minWidth: 220,
          zIndex: 50,
          fontSize: 11,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
            Visual Test Results ({passedCount}/{totalCount} passed)
          </div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 8 }}>
            {results.timestamp ? new Date(results.timestamp).toLocaleString() : ""}
          </div>
          {results.results.map((r) => (
            <div key={r.taskId} style={{
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
              }}>
                {r.taskId.slice(0, 8)}...
              </span>
              {r.error && (
                <span style={{ color: "var(--dot-failed, #ef4444)", fontSize: 10 }}>
                  {r.error.slice(0, 30)}
                </span>
              )}
              {r.screenshot && (
                <span style={{ color: "var(--dot-done, #22c55e)", fontSize: 10 }}>screenshot</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
