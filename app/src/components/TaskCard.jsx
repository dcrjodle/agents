import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { stateKey } from "../hooks/useWorkflow.js";
import { Button } from "./Button.jsx";

// Map state keys to agent/script roles
const STATE_AGENTS = {
  "planning.running": "planner",
  "branching": "script",
  "developing": "developer",
  "committing": "script",
  "testing": "tester",
  "reviewing": "reviewer",
  "pushing": "script",
  "merging.creatingPr": "githubber",
};

const STATE_COLORS = {
  "idle": "#94a3b8",
  "planning.running": "#8b5cf6",
  "planning.awaitingApproval": "#a78bfa",
  "branching": "#6366f1",
  "developing": "#3b82f6",
  "committing": "#2563eb",
  "testing": "#f59e0b",
  "reviewing": "#ec4899",
  "pushing": "#06b6d4",
  "merging.awaitingApproval": "#22d3ee",
  "merging.creatingPr": "#06b6d4",
  "done": "#22c55e",
  "failed": "#ef4444",
};

const PIPELINE_STAGES = ["planning", "branching", "developing", "testing", "reviewing", "merging", "done"];

// State display names
const STATE_LABELS = {
  "idle": "IDLE",
  "planning.running": "PLANNING",
  "planning.awaitingApproval": "AWAITING APPROVAL",
  "branching": "BRANCHING",
  "developing": "DEVELOPING",
  "committing": "COMMITTING",
  "testing": "TESTING",
  "reviewing": "REVIEWING",
  "pushing": "PUSHING",
  "merging.awaitingApproval": "AWAITING APPROVAL",
  "merging.creatingPr": "CREATING PR",
  "done": "DONE",
  "failed": "FAILED",
};

// Simulation events for manual override
const NEXT_EVENTS = {
  "planning.running": [
    { type: "PLAN_READY", plan: { markdown: "# Test Plan", projectPath: "/tmp" } },
    { type: "PLAN_FAILED", error: "Planning failed" },
  ],
  "planning.awaitingApproval": [
    { type: "PLAN_APPROVED" },
    { type: "PLAN_REJECTED" },
  ],
  "branching": [
    { type: "BRANCH_READY", worktreePath: "/tmp/worktree", branchName: "task/test" },
    { type: "BRANCH_FAILED", error: "Worktree creation failed" },
  ],
  "developing": [
    { type: "CODE_COMPLETE", files: ["src/index.js"] },
    { type: "CODE_FAILED", error: "Build error" },
  ],
  "committing": [
    { type: "COMMIT_COMPLETE", files: ["src/index.js"] },
    { type: "COMMIT_FAILED", error: "Commit failed" },
  ],
  "testing": [
    { type: "TESTS_PASSED" },
    { type: "TESTS_FAILED", error: "Test failure" },
  ],
  "reviewing": [
    { type: "REVIEW_APPROVED" },
    { type: "CHANGES_REQUESTED", feedback: "Needs refactor" },
  ],
  "pushing": [
    { type: "PUSH_COMPLETE", branchName: "task/test", diffSummary: "1 file changed" },
    { type: "PUSH_FAILED", error: "Push failed" },
  ],
  "merging.awaitingApproval": [
    { type: "PR_APPROVED" },
  ],
  "merging.creatingPr": [
    { type: "MERGED", url: "https://github.com/test/pr/1" },
    { type: "PR_FAILED", error: "Merge conflict" },
  ],
  "failed": [{ type: "RETRY" }],
};

/**
 * Get the parent stage name from a state key for pipeline bar matching.
 */
function parentStage(sk) {
  // Map sub-states to their pipeline stage
  const stageMap = {
    "committing": "developing",
    "pushing": "merging",
  };
  const dot = sk.indexOf(".");
  const base = dot >= 0 ? sk.substring(0, dot) : sk;
  return stageMap[base] || base;
}

function PipelineBar({ sk }) {
  const stage = parentStage(sk);
  const currentIdx = PIPELINE_STAGES.indexOf(stage);

  return (
    <div style={{ display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden" }}>
      {PIPELINE_STAGES.map((s, i) => {
        let bg = "#e5e7eb";
        if (sk === "failed") {
          bg = i <= Math.max(currentIdx, 0) ? "#ef4444" : "#e5e7eb";
        } else if (i < currentIdx) {
          bg = "#22c55e";
        } else if (i === currentIdx) {
          bg = STATE_COLORS[sk] || STATE_COLORS[stage] || "#3b82f6";
        }
        return <div key={s} style={{ flex: 1, background: bg, borderRadius: 1 }} />;
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
      color = STATE_COLORS[entry.stateKey] || "#6b7280";
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
    case "error":
      color = "#ef4444";
      prefix = "ERROR";
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

export function TaskCard({ task, logs, errors, onSendEvent, onDelete, onApprove, pendingPlan, onViewPlan, pendingPr, onViewPr }) {
  const [expanded, setExpanded] = useState(true);
  const logEndRef = useRef(null);

  const sk = task.stateKey || stateKey(task.state);
  const events = NEXT_EVENTS[sk] || [];
  const agent = STATE_AGENTS[sk];
  const stateColor = STATE_COLORS[sk] || "#94a3b8";
  const stateDisplay = STATE_LABELS[sk] || sk.toUpperCase();
  const isTerminal = sk === "done" || sk === "failed";
  const isAwaitingApproval = sk === "planning.awaitingApproval" || sk === "merging.awaitingApproval";
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
        <span style={{ color: "#6b7280", flexShrink: 0, display: "inline-flex" }}>{expanded ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}</span>

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
          {stateDisplay}
        </span>

        {/* Task description */}
        <span style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 500, flex: 1 }}>{task.description}</span>

        {/* Active agent */}
        {agent && !isTerminal && !isAwaitingApproval && (
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            {agent}
            <span style={{ marginLeft: 4, animation: "pulse 1.5s infinite", display: "inline-block" }}>
              ...
            </span>
          </span>
        )}

        {/* Awaiting approval indicator */}
        {isAwaitingApproval && (
          <span style={{ color: "#f59e0b", fontSize: 12 }}>
            awaiting approval
          </span>
        )}

        {/* Log count */}
        <span style={{ color: "#6b7280", fontSize: 11 }}>{logs.length} events</span>
      </div>

      {/* Pipeline progress bar */}
      <div style={{ padding: "0 16px" }}>
        <PipelineBar sk={sk} />
      </div>

      {/* Error banner */}
      {(sk === "failed" && task.context?.error) || (errors && errors.length > 0) ? (
        <div
          style={{
            padding: "8px 16px",
            background: "#450a0a",
            borderBottom: "1px solid #7f1d1d",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ color: "#fca5a5", flexShrink: 0, display: "inline-flex" }}><AlertTriangle size={14} strokeWidth={1.75} /></span>
          <div style={{ flex: 1 }}>
            {sk === "failed" && task.context?.error && (
              <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {task.context.failedFrom && (
                  <span style={{ opacity: 0.7 }}>failed during {task.context.failedFrom}: </span>
                )}
                {task.context.error}
              </div>
            )}
            {errors && errors.length > 0 && errors.slice(-3).map((err, i) => (
              <div key={i} style={{ color: "#fca5a5", fontSize: 12, fontFamily: "monospace", marginTop: task.context?.error ? 4 : 0 }}>
                [{err.agent}] {err.error}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
            {/* Action buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {/* View Plan button when plan is ready */}
              {sk === "planning.awaitingApproval" && pendingPlan && onViewPlan && (
                <Button
                  variant="action"
                  color="var(--dot-planning)"
                  onClick={() => onViewPlan(task.id)}
                  style={{ animation: "pulse-border 2s infinite" }}
                >
                  View Plan
                </Button>
              )}
              {/* View PR button for merging awaiting approval */}
              {sk === "merging.awaitingApproval" && pendingPr && onViewPr && (
                <Button
                  variant="action"
                  color="var(--dot-done)"
                  onClick={() => onViewPr(task.id)}
                  style={{ animation: "pulse-border 2s infinite" }}
                >
                  View PR
                </Button>
              )}
              {/* Fallback Approve PR button when no pending PR data */}
              {sk === "merging.awaitingApproval" && !pendingPr && onApprove && (
                <Button
                  variant="action"
                  color="var(--dot-done)"
                  onClick={() => onApprove(task.id)}
                >
                  Approve PR
                </Button>
              )}
              {/* Sim buttons */}
              {events.map((evt) => (
                <Button
                  key={evt.type}
                  variant="sim"
                  onClick={() => onSendEvent(task.id, evt)}
                >
                  {evt.type}
                </Button>
              ))}
            </div>

            <Button variant="ghost" size="sm" onClick={() => onDelete(task.id)}>
              delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
