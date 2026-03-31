import { useRef, useEffect } from "react";
import "../styles/evaluator-character.css";

// Studio character colours — amber/orange scheme (builder/launcher)
const ST_HAIR = "#fbbf24";
const ST_BODY = "#d97706";

const SKIN = "#fdd";
const DARK = "#334";
const SHOE = "#543";
const TOOL = "#94a3b8";

function drawStudioChar(ctx, x, y, scale, frame, action) {
  const hair = ST_HAIR;
  const body = ST_BODY;
  const _ = null;

  const isRunning = action === "run";
  const bounce = (isRunning && frame % 2 === 0) ? -1 : 0;

  const sprite = [
    // Row 0-1: Hair (helmet-like)
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
    [_, _, body, body, body, body, body, body, body, _, _, _],
    [_, _, body, body, body, body, body, body, body, _, _, _],
    // Row 9: Belt area
    [_, _, _, body, body, DARK, DARK, body, body, _, _, _],
    // Row 10-12: Legs
    [_, _, _, DARK, DARK, _, _, DARK, DARK, _, _, _],
    [_, _, _, DARK, DARK, _, _, DARK, DARK, _, _, _],
    [_, _, _, DARK, DARK, _, _, DARK, DARK, _, _, _],
    // Row 13: Shoes
    [_, _, SHOE, SHOE, SHOE, _, _, SHOE, SHOE, SHOE, _, _],
  ];

  // Holding wrench when running
  if (isRunning) {
    sprite[7] = [_, TOOL, body, body, body, body, body, body, body, _, _, _];
    sprite[6] = [_, TOOL, _, body, body, body, body, body, body, _, _, _];
    // Running legs
    if (frame % 2 === 1) {
      sprite[12] = [_, _, _, _, DARK, _, DARK, DARK, _, _, _, _];
      sprite[13] = [_, _, _, SHOE, SHOE, _, _, SHOE, SHOE, _, _, _];
    }
  }

  const drawY = y + bounce * scale;

  for (let row = 0; row < sprite.length; row++) {
    const cols = sprite[row];
    for (let col = 0; col < cols.length; col++) {
      const color = cols[col];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + col * scale, drawY + row * scale, scale, scale);
    }
  }
}

const CANVAS_W = 34;
const CANVAS_H = 34;
const CHAR_SCALE = 2;

export function StudioCharacter({ isRunning, onClick, title, disabled, style }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(0);
  const frameCountRef = useRef(0);

  const action = isRunning ? "run" : "idle";

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
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      const scale = CHAR_SCALE;
      const charW = 12 * scale;
      const charH = 14 * scale;
      const charX = Math.round((CANVAS_W - charW) / 2);
      const charY = Math.round((CANVAS_H - charH) / 2);

      // Shadow
      const charCx = charX + charW / 2;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(charCx, charY + charH + 2, charW / 2.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      drawStudioChar(ctx, charX, charY, scale, frame, action);

      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [action]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ width: CANVAS_W, height: CANVAS_H, cursor: disabled ? "default" : "pointer", ...style }}
      onClick={disabled ? undefined : onClick}
      title={title}
    />
  );
}
