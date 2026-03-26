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
};

export function LogLine({ entry }) {
  const timeStr = new Date(entry.time).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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
