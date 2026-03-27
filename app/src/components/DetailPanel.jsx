import { useRef, useEffect } from "react";
import { stateKey } from "../hooks/useWorkflow.js";
import { STATE_LABELS } from "../constants.js";
import { PipelineBar } from "./PipelineBar.jsx";
import { AgentNode } from "./AgentNode.jsx";
import { LogLine } from "./LogLine.jsx";
import "../styles/detail-panel.css";
import "../styles/agent-node.css";

export function DetailPanel({
  task,
  logs,
  errors,
  agentMemory,
  onViewPlan,
  onClose,
  viewMode,
  onToggleViewMode,
}) {
  const streamEndRef = useRef(null);
  const sk = task.stateKey || stateKey(task.state);
  const label = STATE_LABELS[sk] || sk;

  // Group logs by agent
  const grouped = {};
  for (const entry of logs) {
    const agent = entry.agent || "_system";
    if (!grouped[agent]) grouped[agent] = [];
    grouped[agent].push(entry);
  }
  const agents = Object.keys(grouped).filter((a) => a !== "_system");
  const ordered = [...agents].reverse();
  if (grouped["_system"]) ordered.push("_system");

  // Collect memory entries relevant to this task
  const memoryEntries = [];
  if (agentMemory && typeof agentMemory === "object") {
    for (const [, entries] of Object.entries(agentMemory)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry.taskId === task.id) {
          memoryEntries.push(entry);
        }
      }
    }
    // Sort by timestamp ascending
    memoryEntries.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
  }

  useEffect(() => {
    if (viewMode === "stream" && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, viewMode]);

  return (
    <div className="detail-panel">
      {/* Header */}
      <div className="detail-panel-header">
        <div className="detail-panel-header-left">
          <span className="detail-panel-state-label">{label}</span>
          <span className="detail-panel-task-description">{task.description}</span>
        </div>
        <div className="detail-panel-header-controls">
          <button
            className={`detail-panel-toggle-btn${viewMode === "stream" ? " active" : ""}`}
            onClick={() => onToggleViewMode(viewMode === "nodes" ? "stream" : "nodes")}
          >
            {viewMode === "nodes" ? "stream" : "nodes"}
          </button>
          <button className="detail-panel-close-btn" onClick={onClose}>
            close
          </button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="detail-panel-pipeline">
        <PipelineBar sk={sk} />
      </div>

      {/* Error banner */}
      {((sk === "failed" && task.context?.error) || (errors && errors.length > 0)) && (
        <div className="detail-panel-errors">
          {sk === "failed" && task.context?.error && (
            <div className="detail-panel-error-line">{task.context.error}</div>
          )}
          {errors && errors.length > 0 && errors.slice(-3).map((err, i) => (
            <div key={i} className="detail-panel-error-line">
              [{err.agent}] {err.error}
            </div>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="detail-panel-content">
        {viewMode === "nodes" ? (
          <div className="node-chain">
            {ordered.length === 0 ? (
              <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                waiting for agents...
              </div>
            ) : (
              ordered.map((agent) => (
                <AgentNode
                  key={agent}
                  agent={agent}
                  logs={grouped[agent]}
                  onViewPlan={() => onViewPlan(task.id)}
                />
              ))
            )}
          </div>
        ) : (
          <div className="stream-unified">
            {logs.length === 0 ? (
              <div className="stream-unified-empty">waiting for events...</div>
            ) : (
              <>
                {logs.map((entry, i) => (
                  <LogLine
                    key={i}
                    entry={entry}
                    onViewPlan={entry.type === "plan_link" ? () => onViewPlan(task.id) : undefined}
                  />
                ))}
                <div ref={streamEndRef} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Agent Memory */}
      {memoryEntries.length > 0 && (
        <div className="detail-panel-memory">
          <div className="detail-panel-memory-title">agent memory</div>
          {memoryEntries.map((entry) => (
            <div key={entry.id} className="detail-panel-memory-entry">
              <span className={`detail-panel-memory-badge detail-panel-memory-badge--${entry.type}`}>
                {entry.type}
              </span>
              <span className="detail-panel-memory-content">{entry.content}</span>
              <span className="detail-panel-memory-time">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
