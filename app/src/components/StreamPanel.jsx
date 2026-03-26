import { useState, useRef, useEffect, forwardRef } from "react";
import { stateKey } from "../hooks/useWorkflow.js";
import { STATE_LABELS, NEXT_EVENTS, AGENT_COLUMN_COLORS } from "../constants.js";
import { LogLine } from "./LogLine.jsx";
import { PipelineBar } from "./PipelineBar.jsx";

export const StreamPanel = forwardRef(function StreamPanel({
  task,
  logs,
  errors,
  pendingPlan,
  onSendEvent,
  onApprove,
  onViewPlan,
  columnsMode,
  onToggleColumns,
  columnRefsCallback,
}, ref) {
  const logEndRef = useRef(null);
  const columnRefs = useRef({});

  const sk = task.stateKey || stateKey(task.state);
  const events = NEXT_EVENTS[sk] || [];
  const label = STATE_LABELS[sk] || sk;

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length]);

  // Group logs by agent for columns view
  const agentLogs = {};
  if (columnsMode) {
    for (const entry of logs) {
      const agent = entry.agent || "_system";
      if (!agentLogs[agent]) agentLogs[agent] = [];
      agentLogs[agent].push(entry);
    }
  }

  const activeAgents = Object.keys(agentLogs).filter((a) => a !== "_system");

  // Report column header refs to parent
  useEffect(() => {
    if (columnRefsCallback) {
      columnRefsCallback(columnRefs.current);
    }
  });

  return (
    <div ref={ref} style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      overflow: "hidden",
      animation: "fade-in 0.25s ease-out",
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid var(--border-light)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "lowercase",
            letterSpacing: "0.03em",
            flexShrink: 0,
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 12,
            color: "var(--text)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {task.description}
          </span>
        </div>

        <button
          onClick={onToggleColumns}
          style={{
            background: columnsMode ? "var(--bg-muted)" : "transparent",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "3px 8px",
            fontSize: 10,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.03em",
            flexShrink: 0,
          }}
        >
          {columnsMode ? "stream" : "columns"}
        </button>
      </div>

      {/* Pipeline */}
      <div style={{ padding: "0 14px", flexShrink: 0 }}>
        <PipelineBar sk={sk} />
      </div>

      {/* Error banner */}
      {((sk === "failed" && task.context?.error) || (errors && errors.length > 0)) && (
        <div style={{
          padding: "6px 14px",
          background: "color-mix(in srgb, var(--dot-failed) 8%, var(--bg-surface))",
          borderBottom: "1px solid color-mix(in srgb, var(--dot-failed) 20%, var(--border-light))",
          flexShrink: 0,
        }}>
          {sk === "failed" && task.context?.error && (
            <div style={{ color: "var(--dot-failed)", fontSize: 11 }}>
              {task.context.error}
            </div>
          )}
          {errors && errors.length > 0 && errors.slice(-3).map((err, i) => (
            <div key={i} style={{ color: "var(--dot-failed)", fontSize: 11 }}>
              [{err.agent}] {err.error}
            </div>
          ))}
        </div>
      )}

      {/* Log area */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
        {columnsMode ? (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {agentLogs["_system"] && agentLogs["_system"].length > 0 && (
              <div
                ref={(el) => { columnRefs.current["_system"] = el; }}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "8px 10px",
                  borderRight: "1px solid var(--border-light)",
                  background: "var(--bg-muted)",
                  minWidth: 0,
                }}
              >
                <div style={{
                  fontSize: 9,
                  color: "var(--text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                  fontWeight: 600,
                }}>
                  system
                </div>
                {agentLogs["_system"].map((entry, i) => (
                  <LogLine key={i} entry={entry} />
                ))}
              </div>
            )}
            {activeAgents.map((agent) => (
              <div
                key={agent}
                ref={(el) => { columnRefs.current[agent] = el; }}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "8px 10px",
                  borderRight: "1px solid var(--border-light)",
                  background: AGENT_COLUMN_COLORS[agent] || "var(--bg-surface)",
                  minWidth: 0,
                }}
              >
                <div style={{
                  fontSize: 9,
                  color: "var(--text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                  fontWeight: 600,
                }}>
                  {agent}
                </div>
                {agentLogs[agent].map((entry, i) => (
                  <LogLine key={i} entry={entry} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 14px",
          }}>
            {logs.length === 0 ? (
              <div style={{ color: "var(--text-dim)", fontSize: 11, padding: "8px 0" }}>
                waiting for events...
              </div>
            ) : (
              logs.map((entry, i) => <LogLine key={i} entry={entry} />)
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 14px",
        borderTop: "1px solid var(--border-light)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {sk === "planning.awaitingApproval" && pendingPlan && onViewPlan && (
            <button
              onClick={() => onViewPlan(task.id)}
              style={{
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 3,
                border: "1px solid var(--dot-planning)",
                background: "transparent",
                color: "var(--dot-planning)",
                cursor: "pointer",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
              }}
            >
              view plan
            </button>
          )}
          {sk === "merging.awaitingApproval" && onApprove && (
            <button
              onClick={() => onApprove(task.id)}
              style={{
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 3,
                border: "1px solid var(--dot-done)",
                background: "transparent",
                color: "var(--dot-done)",
                cursor: "pointer",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
              }}
            >
              approve pr
            </button>
          )}
          {events.map((evt) => (
            <button
              key={evt.type}
              onClick={() => onSendEvent(task.id, evt)}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 3,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              {evt.type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
