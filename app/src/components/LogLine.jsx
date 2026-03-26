import { useState } from "react";
import { STATE_COLORS } from "../constants.js";

const TYPE_STYLES = {
  system: { color: "var(--text-muted)", prefix: "sys" },
  state: { color: null, prefix: "state" },
  spawned: { color: "var(--dot-done)", prefix: null },
  output: { color: null, prefix: null },
  status: { color: "var(--dot-planning)", prefix: null },
  exited: { color: null, prefix: null },
  message: { color: "var(--dot-merging)", prefix: null },
  error: { color: "var(--dot-failed)", prefix: "err" },
  plan_link: { color: "var(--dot-planning)", prefix: "plan" },
};

export function LogLine({ entry, onViewPlan }) {
  const timeStr = new Date(entry.time).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const [hovered, setHovered] = useState(false);

  const style = TYPE_STYLES[entry.type] || { color: "var(--text-muted)", prefix: "log" };
  let color = style.color;
  let prefix = style.prefix;
  let text = entry.data || "";

  switch (entry.type) {
    case "state":
      color = STATE_COLORS[entry.stateKey] || "var(--text-muted)";
      prefix = "state";
      break;
    case "spawned":
      prefix = entry.agent || "agent";
      break;
    case "output":
      color = entry.stream === "stderr" ? "var(--dot-testing)" : "var(--text)";
      prefix = entry.agent || "out";
      text = text.replace(/\n+$/, "");
      break;
    case "status":
      prefix = entry.agent || "status";
      break;
    case "exited":
      color = entry.exitCode === 0 ? "var(--dot-done)" : "var(--dot-failed)";
      prefix = entry.agent || "exit";
      break;
    case "message":
      prefix = entry.agent || "msg";
      break;
  }

  // Render plan link as a highlighted clickable entry
  if (entry.type === "plan_link") {
    return (
      <div
        onClick={() => onViewPlan && onViewPlan()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          gap: 8,
          fontSize: 11,
          lineHeight: "20px",
          fontFamily: "var(--font-mono)",
          padding: "4px 8px",
          margin: "4px -8px",
          borderRadius: 4,
          cursor: "pointer",
          background: hovered
            ? "color-mix(in srgb, var(--dot-planning) 15%, var(--bg-surface))"
            : "color-mix(in srgb, var(--dot-planning) 8%, var(--bg-surface))",
          border: "1px solid color-mix(in srgb, var(--dot-planning) 25%, var(--border-light))",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{timeStr}</span>
        <span style={{
          color: "var(--dot-planning)",
          flexShrink: 0,
          minWidth: 48,
          fontWeight: 600,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}>
          {prefix}
        </span>
        <span style={{
          color: "var(--dot-planning)",
          fontWeight: 600,
          textDecoration: hovered ? "underline" : "none",
        }}>
          {"\uD83D\uDCCB"} {text}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      gap: 8,
      fontSize: 11,
      lineHeight: "20px",
      fontFamily: "var(--font-mono)",
    }}>
      <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{timeStr}</span>
      <span style={{
        color,
        flexShrink: 0,
        minWidth: 48,
        fontWeight: 500,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}>
        {prefix}
      </span>
      <span style={{
        color: "var(--text)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        opacity: entry.type === "output" ? 0.85 : 1,
      }}>
        {text}
      </span>
    </div>
  );
}
