import { STATE_COLORS } from "../constants.js";

const ICON_PATHS = {
  "idle": "M12 6v6l4 2",
  "planning.running": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  "planning.awaitingApproval": "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01",
  "branching": "M6 3v12M18 9a3 3 0 01-3 3h-6",
  "developing": "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  "committing": "M5 13l4 4L19 7",
  "testing": "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  "reviewing": "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  "pushing": "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  "merging.awaitingApproval": "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01",
  "merging.creatingPr": "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  "done": "M5 13l4 4L19 7",
  "failed": "M6 18L18 6M6 6l12 12",
};

export function StatusIcon({ stateKey, size = 16 }) {
  const color = STATE_COLORS[stateKey] || "var(--dot-idle)";
  const path = ICON_PATHS[stateKey] || ICON_PATHS["idle"];
  const isAnimating = stateKey.includes("running") || stateKey === "developing" || stateKey === "testing" || stateKey === "reviewing" || stateKey === "branching" || stateKey === "committing" || stateKey === "pushing";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        animation: isAnimating ? "pulse 2s infinite" : "none",
      }}
    >
      <path d={path} />
    </svg>
  );
}
