import { useState, useRef, useEffect } from "react";

const STATE_AGENTS = {
  planning: "planner",
  developing: "developer",
  testing: "tester",
  reviewing: "reviewer",
  merging: "githubber",
};

const STATE_COLORS = {
  idle: "#94a3b8",
  planning: "#8b5cf6",
  developing: "#3b82f6",
  testing: "#f59e0b",
  reviewing: "#ec4899",
  merging: "#06b6d4",
  done: "#22c55e",
  failed: "#ef4444",
};

const PIPELINE_STAGES = ["planning", "developing", "testing", "reviewing", "merging", "done"];

// Simulation events for manual override
const NEXT_EVENTS = {
  planning: [
    { type: "PLAN_COMPLETE", plan: { tasks: ["task 1", "task 2"] } },
    { type: "PLAN_FAILED", error: "Planning failed" },
  ],
  developing: [
    { type: "CODE_COMPLETE", files: ["src/index.js"] },
    { type: "CODE_FAILED", error: "Build error" },
  ],
  testing: [
    { type: "TESTS_PASSED" },
    { type: "TESTS_FAILED", error: "Test failure" },
  ],
  reviewing: [
    { type: "REVIEW_APPROVED" },
    { type: "CHANGES_REQUESTED", feedback: "Needs refactor" },
  ],
  merging: [
    { type: "MERGED" },
    { type: "PR_FAILED", error: "Merge conflict" },
  ],
  failed: [{ type: "RETRY" }],
};

function PipelineBar({ currentState }) {
  const currentIdx = PIPELINE_STAGES.indexOf(currentState);

  return (
    <div style={{ display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden" }}>
      {PIPELINE_STAGES.map((stage, i) => {
        let bg = "#e5e7eb";
        if (currentState === "failed") {
          bg = i <= Math.max(currentIdx, 0) ? "#ef4444" : "#e5e7eb";
        } else if (i < currentIdx) {
          bg = "#22c55e";
        } else if (i === currentIdx) {
          bg = STATE_COLORS[stage] || "#3b82f6";
        }
        return <div key={stage} style={{ flex: 1, background: bg, borderRadius: 1 }} />;
      })}
    </div>
  );
}

function LogLine({ entry }) {
  const timeStr = new Date(entry.time).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  let color = "#6b7280";
  let prefix = "";
  let text = entry.data || "";

  switch (entry.type) {
    case "system":
      color = "#6b7280";
      prefix = "SYS";
      break;
    case "state":
      color = STATE_COLORS[entry.state] || "#6b7280";
      prefix = "STATE";
      break;
    case "spawned":
      color = "#22c55e";
      prefix = entry.agent?.toUpperCase() || "AGENT";
      break;
    case "output":
      color = entry.stream === "stderr" ? "#f59e0b" : "#d1d5db";
      prefix = entry.agent?.toUpperCase() || "OUT";
      // Trim trailing newlines from stdout
      text = text.replace(/\n+$/, "");
      break;
    case "status":
      color = "#8b5cf6";
      prefix = entry.agent?.toUpperCase() || "STATUS";
      break;
    case "exited":
      color = entry.exitCode === 0 ? "#22c55e" : "#ef4444";
      prefix = entry.agent?.toUpperCase() || "EXIT";
      break;
    case "message":
      color = "#06b6d4";
      prefix = entry.agent?.toUpperCase() || "MSG";
      break;
    default:
      prefix = "LOG";
  }

  return (
    <div style={{ display: "flex", gap: 8, fontFamily: "monospace", fontSize: 12, lineHeight: "20px" }}>
      <span style={{ color: "#6b7280", flexShrink: 0 }}>{timeStr}</span>
      <span
        style={{
          color: "#fff",
          background: color,
          padding: "0 5px",
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 600,
          lineHeight: "20px",
          flexShrink: 0,
          minWidth: 48,
          textAlign: "center",
        }}
      >
        {prefix}
      </span>
      <span style={{ color: "#e5e7eb", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{text}</span>
    </div>
  );
}

export function TaskCard({ task, logs, onSendEvent, onDelete }) {
  const [expanded, setExpanded] = useState(true);
  const logEndRef = useRef(null);
  const events = NEXT_EVENTS[task.state] || [];
  const agent = STATE_AGENTS[task.state];
  const stateColor = STATE_COLORS[task.state] || "#94a3b8";
  const isTerminal = task.state === "done" || task.state === "failed";

  // Auto-scroll log to bottom
  useEffect(() => {
    if (expanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, expanded]);

  return (
    <div
      style={{
        border: "1px solid #2d2d2d",
        borderRadius: 8,
        background: "#1a1a1a",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #2d2d2d" : "none",
        }}
      >
        <span style={{ color: "#6b7280", fontSize: 12, flexShrink: 0 }}>{expanded ? "▼" : "▶"}</span>

        {/* Status badge */}
        <span
          style={{
            background: stateColor,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            flexShrink: 0,
            textTransform: "uppercase",
          }}
        >
          {task.state}
        </span>

        {/* Task description */}
        <span style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 500, flex: 1 }}>{task.description}</span>

        {/* Active agent */}
        {agent && !isTerminal && (
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            {agent}
            <span style={{ marginLeft: 4, animation: "pulse 1.5s infinite", display: "inline-block" }}>
              ...
            </span>
          </span>
        )}

        {/* Log count */}
        <span style={{ color: "#6b7280", fontSize: 11 }}>{logs.length} events</span>
      </div>

      {/* Pipeline progress bar */}
      <div style={{ padding: "0 16px" }}>
        <PipelineBar currentState={task.state} />
      </div>

      {expanded && (
        <>
          {/* Log stream */}
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              padding: "8px 16px",
              background: "#111",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#4b5563", fontFamily: "monospace", fontSize: 12, padding: "8px 0" }}>
                Waiting for events...
              </div>
            ) : (
              logs.map((entry, i) => <LogLine key={i} entry={entry} />)
            )}
            <div ref={logEndRef} />
          </div>

          {/* Controls */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 16px",
              borderTop: "1px solid #2d2d2d",
            }}
          >
            {/* Sim buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {events.map((evt) => (
                <button
                  key={evt.type}
                  onClick={() => onSendEvent(task.id, evt)}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: "1px solid #3d3d3d",
                    background: "#2d2d2d",
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontFamily: "monospace",
                  }}
                >
                  {evt.type}
                </button>
              ))}
            </div>

            <button
              onClick={() => onDelete(task.id)}
              style={{
                fontSize: 11,
                color: "#6b7280",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 8px",
              }}
            >
              delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
