import { useRef, useEffect, forwardRef } from "react";
import { AGENT_COLUMN_COLORS } from "../constants.js";
import { LogLine } from "./LogLine.jsx";

/**
 * StreamColumn - An independent scrollable column that displays logs for a single agent.
 *
 * @param {Object} props
 * @param {"system" | "agent"} props.variant - Column variant type
 * @param {string} props.agent - Agent name (or "_system")
 * @param {Array} props.logs - Log entries to display
 * @param {string} [props.color] - Override background color
 * @param {boolean} [props.isLast] - Whether this is the last column (no connector line)
 */
export const StreamColumn = forwardRef(function StreamColumn(
  { variant = "agent", agent, logs, color, isLast },
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
      style={{
        display: "flex",
        alignItems: "stretch",
        flexShrink: 0,
        minWidth: 280,
      }}
    >
      {/* Column content */}
      <div
        ref={ref}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 280,
          maxHeight: "calc(100vh - 260px)",
          background: bgColor,
          borderRight: isLast ? "none" : "1px solid var(--border-light)",
          overflow: "hidden",
        }}
      >
        {/* Column header */}
        <div
          style={{
            fontSize: 9,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "8px 10px 0 10px",
            marginBottom: 6,
            fontWeight: 600,
            flexShrink: 0,
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
            padding: "0 10px 8px 10px",
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

      {/* Connector line between columns */}
      {!isLast && (
        <div
          style={{
            width: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              height: 1,
              borderTop: "1px dashed var(--line-color)",
              animation: "draw-line 0.3s ease-out",
            }}
          />
        </div>
      )}
    </div>
  );
});
