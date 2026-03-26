import { PIPELINE_STAGES, STATE_COLORS } from "../constants.js";

function parentStage(sk) {
  const dot = sk.indexOf(".");
  return dot >= 0 ? sk.substring(0, dot) : sk;
}

export function PipelineBar({ sk }) {
  const stage = parentStage(sk);
  const currentIdx = PIPELINE_STAGES.indexOf(stage);

  return (
    <div style={{ display: "flex", gap: 2, height: 3 }}>
      {PIPELINE_STAGES.map((s, i) => {
        let bg = "var(--border-light)";
        if (sk === "failed") {
          bg = i <= Math.max(currentIdx, 0) ? "var(--dot-failed)" : "var(--border-light)";
        } else if (i < currentIdx) {
          bg = "var(--dot-done)";
        } else if (i === currentIdx) {
          bg = STATE_COLORS[sk] || STATE_COLORS[stage] || "var(--dot-developing)";
        }
        return <div key={s} style={{ flex: 1, background: bg, borderRadius: 1 }} />;
      })}
    </div>
  );
}
