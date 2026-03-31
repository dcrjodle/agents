import { useRef, useEffect, useState, useCallback } from "react";
import "../styles/ana-character.css";

// Ana character colours — teal/coral scheme
const TEAL = "#14b8a6";
const CORAL = "#f97316";

const SKIN = "#fdd";
const DARK = "#334";
const SHOE = "#543";

/**
 * Draw the pixel-art Ana character.
 * Based on EvaluatorCharacter's drawEvalChar with teal/coral colors
 * and a slightly cuter/smaller appearance.
 */
function drawAnaChar(ctx, x, y, scale, frame, action, direction) {
  const hair = TEAL;
  const body = CORAL;
  const flip = direction === "left";
  const _ = null;

  const armUp = action === "celebrate" || (action === "wave" && frame % 2 === 0);
  const isThinking = action === "think" || action === "code";
  const bounce = (action === "walk" && frame % 2 === 0) ? -1 : 0;
  const isConfused = action === "confused";

  // Slightly cuter variant: rounder hair, same body proportions
  const sprite = [
    // Row 0-1: Hair (slightly rounder top)
    [_, _, hair, hair, hair, hair, hair, hair, hair, _, _, _],
    [_, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _],
    // Row 2-3: Face
    [_, _, hair, SKIN, SKIN, SKIN, SKIN, SKIN, hair, _, _, _],
    [_, _, _, SKIN, DARK, SKIN, SKIN, DARK, SKIN, _, _, _],
    // Row 4: Mouth (small smile pixel)
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
 * Draw a chat bubble badge at the given centre coordinates.
 * isActive causes a glow effect; glowPhase drives the pulse animation.
 */
function drawChatBubbleBadge(ctx, cx, cy, scale, isActive, glowPhase) {
  const radius = scale * 4.5;

  // Glow / pulse when active
  if (isActive) {
    const glowAlpha = 0.3 + Math.sin(glowPhase) * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + scale * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(20,184,166,${glowAlpha})`;
    ctx.fill();
  }

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,10,20,0.85)";
  ctx.fill();

  // Ring colour
  const ringColor = isActive ? TEAL : "#555";
  ctx.lineWidth = scale * 0.7;
  ctx.strokeStyle = ringColor;
  ctx.stroke();

  // Chat bubble icon drawn with pixels
  const iconSize = Math.max(6, scale * 3);
  const iconX = cx - iconSize / 2;
  const iconY = cy - iconSize / 2 - scale * 0.3;

  ctx.fillStyle = isActive ? TEAL : "#888";

  // Rounded rectangle for bubble body (simplified as rect)
  const bw = iconSize;
  const bh = iconSize * 0.65;
  const br = bh * 0.25;

  ctx.beginPath();
  ctx.moveTo(iconX + br, iconY);
  ctx.lineTo(iconX + bw - br, iconY);
  ctx.quadraticCurveTo(iconX + bw, iconY, iconX + bw, iconY + br);
  ctx.lineTo(iconX + bw, iconY + bh - br);
  ctx.quadraticCurveTo(iconX + bw, iconY + bh, iconX + bw - br, iconY + bh);
  ctx.lineTo(iconX + bw * 0.45, iconY + bh);
  // Tail pointing down-left
  ctx.lineTo(iconX + bw * 0.2, iconY + bh + bh * 0.4);
  ctx.lineTo(iconX + bw * 0.35, iconY + bh);
  ctx.lineTo(iconX + br, iconY + bh);
  ctx.quadraticCurveTo(iconX, iconY + bh, iconX, iconY + bh - br);
  ctx.lineTo(iconX, iconY + br);
  ctx.quadraticCurveTo(iconX, iconY, iconX + br, iconY);
  ctx.closePath();
  ctx.fill();

  // Three dots inside bubble
  const dotColor = isActive ? "rgba(10,10,20,0.9)" : "rgba(255,255,255,0.3)";
  ctx.fillStyle = dotColor;
  const dotR = Math.max(1, bh * 0.1);
  const dotY2 = iconY + bh * 0.45;
  for (let i = 0; i < 3; i++) {
    const dotX = iconX + bw * (0.25 + i * 0.25);
    ctx.beginPath();
    ctx.arc(dotX, dotY2, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

const CANVAS_W = 80;
const CANVAS_H = 100;
const CHAR_SCALE = 4;

const COMPACT_CANVAS_W = 50;
const COMPACT_CANVAS_H = 34;
const COMPACT_CHAR_SCALE = 2;

/**
 * AnaCharacter — pixel-art Ana chat widget.
 * When compact={true}, renders at half scale to fit inline in a toolbar.
 *
 * Props:
 *   compact    — render smaller for toolbar
 *   onClick    — called when character is clicked (toggles chat panel)
 *   isActive   — whether the chat panel is open (badge glows)
 *   isLoading  — whether Ana is processing (shows think animation)
 */
export function AnaCharacter({ compact = false, onClick, isActive = false, isLoading = false }) {
  const canvasW = compact ? COMPACT_CANVAS_W : CANVAS_W;
  const canvasH = compact ? COMPACT_CANVAS_H : CANVAS_H;
  const charScale = compact ? COMPACT_CHAR_SCALE : CHAR_SCALE;

  const canvasRef = useRef(null);
  const animFrameRef = useRef(0);
  const frameCountRef = useRef(0);
  const prevLoadingRef = useRef(false);

  // Animation state
  const [animAction, setAnimAction] = useState("idle");
  const celebrateTimerRef = useRef(null);

  // isLoading → think; loading finished → celebrate → idle
  useEffect(() => {
    if (isLoading && !prevLoadingRef.current) {
      setAnimAction("think");
    } else if (!isLoading && prevLoadingRef.current) {
      setAnimAction("celebrate");
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = setTimeout(() => {
        setAnimAction("idle");
      }, 2500);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  const handleClick = useCallback(() => {
    if (isLoading) {
      setAnimAction("confused");
      setTimeout(() => setAnimAction("think"), 1000);
      return;
    }
    if (onClick) onClick();
  }, [isLoading, onClick]);

  const tooltipText = "Chat with Ana - ask questions or request actions";

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
      const glowPhase = frameCountRef.current * 0.05;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvasW * dpr;
      canvas.height = canvasH * dpr;
      ctx.scale(dpr, dpr);

      // Clear
      ctx.clearRect(0, 0, canvasW, canvasH);

      const scale = charScale;
      const charW = 12 * scale;
      const charH = 14 * scale;

      let charX, charY, badgeCx, badgeCy;
      if (compact) {
        // Badge to the left of the character
        const badgeAreaW = 22;
        charX = badgeAreaW;
        charY = Math.round((canvasH - charH) / 2);
        badgeCx = badgeAreaW / 2;
        badgeCy = charY + charH / 2;
      } else {
        const cx = canvasW / 2;
        charX = cx - charW / 2;
        charY = canvasH - charH - 4;
        const badgeRadius = scale * 4.5;
        badgeCx = cx;
        badgeCy = charY - badgeRadius - scale * 2;
      }
      const charCx = charX + charW / 2;

      // Draw chat bubble badge
      drawChatBubbleBadge(ctx, badgeCx, badgeCy, scale, isActive, glowPhase);

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(charCx, charY + charH + 2, charW / 2.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Character
      drawAnaChar(ctx, charX, charY, scale, frame, animAction, "left");

      // Celebrate sparkles
      if (animAction === "celebrate") {
        const sparkleColors = ["#14b8a6", "#f97316", "#ffd700", "#fb7185", "#38bdf8"];
        for (let i = 0; i < 5; i++) {
          const angle = (frame * 0.5 + i * 1.2) % (Math.PI * 2);
          const radius = 15 + Math.sin(frame * 0.3 + i) * 8;
          const sx = charCx + Math.cos(angle) * radius;
          const sy = charY + charH / 2 + Math.sin(angle) * radius;
          ctx.fillStyle = sparkleColors[i % sparkleColors.length];
          ctx.fillRect(sx - 1, sy - 1, 3, 3);
        }
      }

      // Think bubbles (teal tinted)
      if (animAction === "think") {
        const dotX = charX - 8;
        const dotY = charY + 4;
        ctx.fillStyle = "rgba(20,184,166,0.6)";
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
  }, [animAction, isActive, canvasW, canvasH, charScale, compact]);

  return (
    <div className={`ana-character${isActive ? " ana-character--active" : ""}`}>
      <canvas
        ref={canvasRef}
        className="ana-character-canvas"
        width={canvasW}
        height={canvasH}
        style={{ width: canvasW, height: canvasH }}
        onClick={handleClick}
        title={tooltipText}
      />
    </div>
  );
}
