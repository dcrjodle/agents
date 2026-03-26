import { useRef, useEffect } from "react";
import { AGENT_COLUMN_COLORS } from "../constants.js";
import { LogLine } from "./LogLine.jsx";
import "../styles/agent-node.css";

export function AgentNode({ agent, logs, onViewPlan }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const isSystem = agent === "_system";
  const displayName = isSystem ? "system" : agent;
  const bgColor = isSystem
    ? "var(--bg-muted)"
    : AGENT_COLUMN_COLORS[agent] || "var(--bg-surface)";
  const dotColor = isSystem
    ? "var(--text-dim)"
    : AGENT_COLUMN_COLORS[agent] || "var(--dot-idle)";

  return (
    <div className="agent-node" style={{ background: bgColor }}>
      <div className="agent-node-header">
        <span className="agent-node-header-dot" style={{ background: dotColor }} />
        {displayName}
      </div>
      <div className="agent-node-logs" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="agent-node-empty">no events yet</div>
        ) : (
          logs.map((entry, i) => (
            <LogLine
              key={i}
              entry={entry}
              onViewPlan={entry.type === "plan_link" ? onViewPlan : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
