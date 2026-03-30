import {
  Clock,
  FileText,
  HelpCircle,
  GitBranch,
  Code2,
  GitCommit,
  ClipboardCheck,
  Eye,
  Upload,
  GitPullRequest,
  CheckCircle2,
  GitMerge,
  XCircle,
} from "lucide-react";
import { STATE_COLORS } from "../constants.js";

const STATE_ICONS = {
  "idle": Clock,
  "planning.running": FileText,
  "planning.awaitingApproval": HelpCircle,
  "branching": GitBranch,
  "developing": Code2,
  "committing": GitCommit,
  "testing": ClipboardCheck,
  "reviewing": Eye,
  "reviewing.awaitingApproval": HelpCircle,
  "pushing": Upload,
  "merging.awaitingApproval": HelpCircle,
  "merging.creatingPr": GitPullRequest,
  "done": CheckCircle2,
  "directMerging": GitMerge,
  "failed": XCircle,
};

export function StatusIcon({ stateKey, size = 14 }) {
  const color = STATE_COLORS[stateKey] || "var(--dot-idle)";
  const Icon = STATE_ICONS[stateKey] || Clock;
  const isAnimating = stateKey.includes("running") || stateKey === "developing" || stateKey === "testing" || stateKey === "reviewing" || stateKey === "branching" || stateKey === "committing" || stateKey === "pushing" || stateKey === "directMerging";

  return (
    <span
      style={{
        display: "inline-flex",
        flexShrink: 0,
        color,
        animation: isAnimating ? "pulse 2s infinite" : "none",
      }}
    >
      <Icon size={size} strokeWidth={1.75} />
    </span>
  );
}
