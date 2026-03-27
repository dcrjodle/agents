import { useRef, useEffect, forwardRef } from "react";
import { stateKey } from "../hooks/useWorkflow.js";
import { STATE_LABELS, NEXT_EVENTS } from "../constants.js";
import { LogLine } from "./LogLine.jsx";
import { PipelineBar } from "./PipelineBar.jsx";
import { Button } from "./Button.jsx";

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

  const sk = task.stateKey || stateKey(task.state);
  const events = NEXT_EVENTS[sk] || [];
  const label = STATE_LABELS[sk] || sk;

  useEffect(() => {
    if (!columnsMode && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, columnsMode]);

  return (
    <div ref={ref} style={{
      flex: columnsMode ? "none" : 1,
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      overflow: "hidden",
      animation: "fade-in 0.25s ease-out",
      minHeight: 0,
      width: columnsMode ? 320 : undefined,
      flexShrink: 0,
      alignSelf: columnsMode ? "flex-start" : undefined,
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

        <Button
          variant="toggle"
          active={columnsMode}
          size="sm"
          onClick={onToggleColumns}
          style={{ flexShrink: 0 }}
        >
          {columnsMode ? "stream" : "columns"}
        </Button>
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

      {/* Log area — only shown in stream mode; columns mode renders nodes externally */}
      {!columnsMode && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
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
              logs.map((entry, i) => (
                <LogLine
                  key={i}
                  entry={entry}
                  onViewPlan={entry.type === "plan_link" ? () => onViewPlan(task.id) : undefined}
                />
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

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
            <Button
              variant="action"
              color="var(--dot-planning)"
              size="sm"
              onClick={() => onViewPlan(task.id)}
            >
              view plan
            </Button>
          )}
          {sk === "merging.awaitingApproval" && onApprove && (
            <Button
              variant="action"
              color="var(--dot-done)"
              size="sm"
              onClick={() => onApprove(task.id)}
            >
              approve pr
            </Button>
          )}
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
      </div>
    </div>
  );
});
