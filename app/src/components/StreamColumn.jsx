import { useRef, useEffect, forwardRef } from "react";
import { AGENT_COLUMN_COLORS } from "../constants.js";
import { LogLine } from "./LogLine.jsx";

/**
 * StreamColumn - An independent scrollable node that displays logs for a single agent.
 * Renders as a standalone card with its own border and background.
 */
export const StreamColumn = forwardRef(function StreamColumn(
  { variant = "agent", agent, logs, color },
  ref
) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const isSystem = variant === "system";
  const displayName = isSystem ? "system" : agent;
  const bgColor =
    color ||
    (isSystem
      ? "var(--bg-muted)"
      : AGENT_COLUMN_COLORS[agent] || "var(--bg-surface)");

  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 280,
        width: 320,
        maxHeight: "calc(100vh - 260px)",
        background: bgColor,
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Column header */}
      <div
        style={{
          fontSize: 9,
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          padding: "8px 10px",
          fontWeight: 600,
          flexShrink: 0,
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        {displayName}
      </div>

      {/* Scrollable log area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 10px 8px 10px",
        }}
      >
        {logs.length === 0 ? (
          <div
            style={{
              color: "var(--text-dim)",
              fontSize: 10,
              padding: "4px 0",
              fontStyle: "italic",
            }}
          >
            no events yet
          </div>
        ) : (
          logs.map((entry, i) => <LogLine key={i} entry={entry} />)
        )}
      </div>
    </div>
  );
});
