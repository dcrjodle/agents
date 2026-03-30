import { useRef, useEffect, useState, useCallback } from "react";
import "../styles/evaluator-character.css";

// Evaluator character colours — purple/teal scheme
const EVAL_HAIR = "#a78bfa";
const EVAL_BODY = "#6d28d9";

const SKIN = "#fdd";
const DARK = "#334";
const SHOE = "#543";

/**
 * Draw the pixel-art evaluator character.
 * Adapted from AgentRoom.jsx drawPixelChar.
 */
function drawEvalChar(ctx, x, y, scale, frame, action, direction) {
  const hair = EVAL_HAIR;
  const body = EVAL_BODY;
  const flip = direction === "left";
  const _ = null;

  const armUp = action === "celebrate" || (action === "wave" && frame % 2 === 0);
  const isThinking = action === "think" || action === "code";
  const bounce = (action === "walk" && frame % 2 === 0) ? -1 : 0;
  const isConfused = action === "confused";

  const sprite = [
    // Row 0-1: Hair
    [_, _, _, hair, hair, hair, hair, hair, _, _, _, _],
    [_, _, hair, hair, hair, hair, hair, hair, hair, _, _, _],
    // Row 2-3: Face
    [_, _, hair, SKIN, SKIN, SKIN, SKIN, SKIN, hair, _, _, _],
    [_, _, _, SKIN, DARK, SKIN, SKIN, DARK, SKIN, _, _, _],
    // Row 4: Mouth
    [_, _, _, SKIN, SKIN, SKIN, SKIN, SKIN, SKIN, _, _, _],
    // Row 5: Neck
    [_, _, _, _, SKIN, SKIN, SKIN, SKIN, _, _, _, _],
    // Row 6-8: Body
    [_, _, _, body, body, body, body, body, body, _, _, _],
    [_, armUp ? body : _, body, body, body, body, body, body, body, armUp ? body : _, _, _],
    [_, armUp ? body : _, body, body, body, body, body, body, body, armUp ? body : _, _, _],
    // Row 9: Belt area
    [_, _, _, body, body, DARK, DARK, body, body, _, _, _],
    // Row 10-12: Legs
    [_, _, _, DARK, DARK, _, _, DARK, DARK, _, _, _],
    [_, _, _, DARK, DARK, _, _, DARK, DARK, _, _, _],
    [_, _, _, DARK, DARK, _, _, DARK, DARK, _, _, _],
    // Row 13: Shoes
    [_, _, SHOE, SHOE, SHOE, _, _, SHOE, SHOE, SHOE, _, _],
  ];

  if (isThinking) {
    sprite[7] = [_, _, body, body, body, body, body, body, body, SKIN, _, _];
    sprite[3] = [_, _, _, SKIN, DARK, SKIN, SKIN, DARK, SKIN, _, _, _];
  }

  if (isConfused) {
    sprite[3] = [_, _, _, SKIN, "×", SKIN, SKIN, "×", SKIN, _, _, _];
  }

  if (action === "walk" && frame % 2 === 1) {
    sprite[12] = [_, _, _, _, DARK, _, DARK, DARK, _, _, _, _];
    sprite[13] = [_, _, _, SHOE, SHOE, _, _, SHOE, SHOE, _, _, _];
  }

  if (action === "celebrate") {
    sprite[6] = [_, body, _, body, body, body, body, body, _, body, _, _];
    sprite[7] = [body, body, _, body, body, body, body, body, _, body, body, _];
    sprite[8] = [_, _, _, body, body, body, body, body, _, _, _, _];
  }

  const drawY = y + bounce * scale;

  for (let row = 0; row < sprite.length; row++) {
    const cols = sprite[row];
    for (let col = 0; col < cols.length; col++) {
      const color = cols[col];
      if (!color || color === "×") continue;
      const drawCol = flip ? (cols.length - 1 - col) : col;
      ctx.fillStyle = color;
      ctx.fillRect(x + drawCol * scale, drawY + row * scale, scale, scale);
    }
  }

  // Draw × eyes for confused
  if (isConfused) {
    ctx.fillStyle = "#c62828";
    ctx.font = `${scale * 1.2}px monospace`;
    const eyeRow = 3;
    const eye1Col = flip ? 7 : 4;
    const eye2Col = flip ? 4 : 7;
    ctx.fillText("×", x + eye1Col * scale - scale * 0.1, drawY + eyeRow * scale + scale * 0.9);
    ctx.fillText("×", x + eye2Col * scale - scale * 0.1, drawY + eyeRow * scale + scale * 0.9);
  }

  return { width: 12 * scale, height: 14 * scale };
}

/**
 * Draw score badge above the character.
 */
function drawScoreBadge(ctx, cx, y, score, scale) {
  const text = score != null ? String(score) : "?";
  const radius = scale * 4.5;
  const badgeY = y - radius - scale * 2;

  // Ring colour
  let ringColor = "#888";
  if (score != null) {
    if (score >= 7) ringColor = "#4ade80";
    else if (score >= 4) ringColor = "#fbbf24";
    else ringColor = "#f87171";
  }

  // Ring
  ctx.beginPath();
  ctx.arc(cx, badgeY, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,10,20,0.85)";
  ctx.fill();
  ctx.lineWidth = scale * 0.7;
  ctx.strokeStyle = ringColor;
  ctx.stroke();

  // Score text
  ctx.fillStyle = ringColor;
  ctx.font = `bold ${Math.max(9, scale * 2.8)}px "SF Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, badgeY);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/**
 * EvaluatorHoverMenu — shown on hover, lists top suggestions.
 */
function EvaluatorHoverMenu({ evaluationResult, isEvaluating, onAddTask, onEvaluate }) {
  const suggestions = evaluationResult?.suggestions || [];
  const score = evaluationResult?.score;
  const summary = evaluationResult?.summary;
  const timestamp = evaluationResult?.timestamp;

  let scoreClass = "score-none";
  if (score != null) {
    if (score >= 7) scoreClass = "score-green";
    else if (score >= 4) scoreClass = "score-amber";
    else scoreClass = "score-red";
  }

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleString()
    : null;

  return (
    <div className="evaluator-hover-menu">
      <div className="evaluator-hover-menu-title">Code Evaluator</div>

      <div className="evaluator-hover-menu-score">
        <div className={`evaluator-score-ring ${scoreClass}`}>
          {score != null ? score : "?"}
        </div>
        <div className="evaluator-score-summary">
          {summary || (formattedTime ? `Last run: ${formattedTime}` : "No evaluation yet")}
        </div>
      </div>

      {suggestions.length > 0 && (
        <>
          <div className="evaluator-suggestions-title">Suggestions</div>
          {suggestions.slice(0, 5).map((s, i) => (
            <div key={i} className="evaluator-suggestion-row">
              <div className="evaluator-suggestion-info">
                <div className="evaluator-suggestion-title">{s.title}</div>
                <div className={`evaluator-suggestion-priority ${s.priority}`}>{s.priority}</div>
              </div>
              <button
                className="evaluator-suggestion-add-btn"
                title={`Add as task: ${s.description}`}
                onClick={() => onAddTask(`${s.title}: ${s.description}`)}
              >
                +
              </button>
            </div>
          ))}
        </>
      )}

      <div className="evaluator-hover-menu-footer">
        <button
          className="evaluator-run-btn"
          disabled={isEvaluating}
          onClick={onEvaluate}
        >
          {isEvaluating ? "evaluating…" : "run evaluation"}
        </button>
      </div>
    </div>
  );
}

const CANVAS_W = 80;
const CANVAS_H = 100;
const CHAR_SCALE = 4;

/**
 * EvaluatorCharacter — pixel-art evaluator widget fixed in top-right corner.
 */
export function EvaluatorCharacter({ evaluationResult, isEvaluating, onEvaluate, onAddTask }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(0);
  const frameCountRef = useRef(0);
  const [showMenu, setShowMenu] = useState(false);
  const celebrateTimerRef = useRef(null);
  const prevEvaluatingRef = useRef(false);

  // Animation state derived from props
  const [animAction, setAnimAction] = useState("idle");

  // When isEvaluating changes: think → celebrate → idle
  useEffect(() => {
    if (isEvaluating && !prevEvaluatingRef.current) {
      setAnimAction("think");
    } else if (!isEvaluating && prevEvaluatingRef.current) {
      setAnimAction("celebrate");
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = setTimeout(() => {
        setAnimAction("idle");
      }, 2500);
    }
    prevEvaluatingRef.current = isEvaluating;
  }, [isEvaluating]);

  const handleClick = useCallback(() => {
    if (isEvaluating) {
      setAnimAction("confused");
      setTimeout(() => setAnimAction("think"), 1000);
      return;
    }
    onEvaluate();
  }, [isEvaluating, onEvaluate]);

  const score = evaluationResult?.score;
  const timestamp = evaluationResult?.timestamp;
  const tooltipText = timestamp
    ? `Last evaluated: ${new Date(timestamp).toLocaleString()} — Score: ${score}`
    : "Click to evaluate code quality";

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let running = true;

    function render() {
      if (!running) return;
      frameCountRef.current++;
      const frame = Math.floor(frameCountRef.current / 15);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = CANVAS_W * dpr;
      canvas.height = CANVAS_H * dpr;
      ctx.scale(dpr, dpr);

      // Clear
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      const scale = CHAR_SCALE;
      const charW = 12 * scale;
      const charH = 14 * scale;
      const cx = CANVAS_W / 2;
      const charX = cx - charW / 2;
      const charY = CANVAS_H - charH - 4;

      // Draw score badge above character
      drawScoreBadge(ctx, cx, charY, score, scale);

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, charY + charH + 2, charW / 2.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Character
      drawEvalChar(ctx, charX, charY, scale, frame, animAction, "left");

      // Particles
      if (animAction === "celebrate") {
        const sparkleColors = ["#ffd700", "#a78bfa", "#48dbfb", "#ff9ff3", "#6d28d9"];
        for (let i = 0; i < 5; i++) {
          const angle = (frame * 0.5 + i * 1.2) % (Math.PI * 2);
          const radius = 15 + Math.sin(frame * 0.3 + i) * 8;
          const sx = cx + Math.cos(angle) * radius;
          const sy = charY + charH / 2 + Math.sin(angle) * radius;
          ctx.fillStyle = sparkleColors[i % sparkleColors.length];
          ctx.fillRect(sx - 1, sy - 1, 3, 3);
        }
      }

      if (animAction === "think") {
        const dotX = charX - 8;
        const dotY = charY + 4;
        ctx.fillStyle = "rgba(167,139,250,0.6)";
        for (let i = 0; i < 3; i++) {
          const dy = -i * 6 - Math.sin(frame * 0.5 + i) * 2;
          const r = 1.5 + i * 0.5;
          ctx.beginPath();
          ctx.arc(dotX, dotY + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [animAction, score]);

  return (
    <div
      className="evaluator-character"
      onMouseEnter={() => setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      {showMenu && (
        <EvaluatorHoverMenu
          evaluationResult={evaluationResult}
          isEvaluating={isEvaluating}
          onAddTask={onAddTask}
          onEvaluate={onEvaluate}
        />
      )}
      <canvas
        ref={canvasRef}
        className="evaluator-character-canvas"
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ width: CANVAS_W, height: CANVAS_H }}
        onClick={handleClick}
        title={tooltipText}
      />
    </div>
  );
}
