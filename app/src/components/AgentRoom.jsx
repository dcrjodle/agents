import { useRef, useEffect, useCallback } from "react";
import "../styles/agent-room.css";

// Agent role → default spawn position (percentage of room width)
const AGENT_POSITIONS = {
  planner: 15,
  developer: 35,
  reviewer: 55,
  tester: 70,
  githubber: 85,
  merger: 50,
  "visual-tester": 70,
  script: 50,
  _system: 5,
};

// Pixel art sprite data for each animation frame
// Each sprite is a 16x16 grid encoded as rows of hex color values
// null = transparent

const SKIN = "#fdd";
const DARK = "#334";
const SHOE = "#543";
const HAIR_COLORS = {
  planner: "#64b5f6",
  developer: "#81c784",
  reviewer: "#e57373",
  tester: "#ffb74d",
  githubber: "#ce93d8",
  merger: "#4dd0e1",
  "visual-tester": "#ffb74d",
  script: "#90a4ae",
  _system: "#78909c",
};

const BODY_COLORS = {
  planner: "#1565c0",
  developer: "#2e7d32",
  reviewer: "#c62828",
  tester: "#e65100",
  githubber: "#7b1fa2",
  merger: "#00838f",
  "visual-tester": "#e65100",
  script: "#455a64",
  _system: "#546e7a",
};

function drawPixelChar(ctx, x, y, scale, agent, frame, action, direction) {
  const hair = HAIR_COLORS[agent] || "#90a4ae";
  const body = BODY_COLORS[agent] || "#455a64";
  const flip = direction === "left";

  // Base character: 12x16 pixel art
  // Row format: each cell is a color or null (transparent)
  const _ = null;

  // Frame-based arm/leg variation
  const armUp = action === "celebrate" || (action === "wave" && frame % 2 === 0);
  const isThinking = action === "think" || action === "code";
  const bounce = (action === "walk" && frame % 2 === 0) ? -1 : 0;
  const isConfused = action === "confused";

  // Build sprite rows
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

  // Thinking: add hand to chin
  if (isThinking) {
    sprite[7] = [_, _, body, body, body, body, body, body, body, SKIN, _, _];
    sprite[3] = [_, _, _, SKIN, DARK, SKIN, SKIN, DARK, SKIN, _, _, _]; // eyes look up
  }

  // Confused: add question marks via eyes
  if (isConfused) {
    sprite[3] = [_, _, _, SKIN, "×", SKIN, SKIN, "×", SKIN, _, _, _];
  }

  // Walk animation: offset legs
  if (action === "walk" && frame % 2 === 1) {
    sprite[12] = [_, _, _, _, DARK, _, DARK, DARK, _, _, _, _];
    sprite[13] = [_, _, _, SHOE, SHOE, _, _, SHOE, SHOE, _, _, _];
  }

  // Celebrate: arms up
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
      ctx.fillRect(
        x + drawCol * scale,
        drawY + row * scale,
        scale,
        scale
      );
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

function drawSpeechBubble(ctx, x, y, text, scale) {
  if (!text) return;
  ctx.font = `${Math.max(10, scale * 3)}px "SF Mono", "Fira Code", monospace`;
  const metrics = ctx.measureText(text);
  const padding = 6;
  const bubbleW = metrics.width + padding * 2;
  const bubbleH = scale * 4 + padding * 2;
  const bubbleX = x - bubbleW / 2;
  const bubbleY = y - bubbleH - 6;

  // Bubble background
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 4);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.moveTo(x - 4, bubbleY + bubbleH);
  ctx.lineTo(x, bubbleY + bubbleH + 5);
  ctx.lineTo(x + 4, bubbleY + bubbleH);
  ctx.fill();

  // Text
  ctx.fillStyle = "#333";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, bubbleY + bubbleH / 2);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawNameTag(ctx, x, y, name, color, scale) {
  ctx.font = `bold ${Math.max(9, scale * 2.5)}px "SF Mono", "Fira Code", monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = color || "#666";
  ctx.fillText(name, x, y);
  ctx.textAlign = "start";
}

// Room background elements
function drawRoom(ctx, w, h) {
  // Floor
  const floorY = h * 0.72;
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, w, h);

  // Back wall
  const gradient = ctx.createLinearGradient(0, 0, 0, floorY);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, floorY);

  // Floor tiles
  ctx.fillStyle = "#0f3460";
  ctx.fillRect(0, floorY, w, h - floorY);

  // Grid lines on floor (perspective)
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const y = floorY + (i * (h - floorY)) / 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const x = (i * w) / 15;
    ctx.beginPath();
    ctx.moveTo(x, floorY);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Desk/workstations (simple rectangles)
  ctx.fillStyle = "#1a1a3a";
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;

  // Left desk
  ctx.fillRect(w * 0.05, floorY - 10, w * 0.25, 8);
  ctx.strokeRect(w * 0.05, floorY - 10, w * 0.25, 8);

  // Center desk
  ctx.fillRect(w * 0.38, floorY - 10, w * 0.25, 8);
  ctx.strokeRect(w * 0.38, floorY - 10, w * 0.25, 8);

  // Right desk
  ctx.fillRect(w * 0.7, floorY - 10, w * 0.25, 8);
  ctx.strokeRect(w * 0.7, floorY - 10, w * 0.25, 8);

  // Monitor outlines on desks
  ctx.strokeStyle = "rgba(100,200,255,0.15)";
  ctx.lineWidth = 1;
  const monitorH = 18;
  const monitorW = 22;
  [w * 0.12, w * 0.22, w * 0.45, w * 0.55, w * 0.77, w * 0.87].forEach((mx) => {
    ctx.strokeRect(mx - monitorW / 2, floorY - 10 - monitorH - 2, monitorW, monitorH);
    // Screen glow
    ctx.fillStyle = "rgba(100,200,255,0.03)";
    ctx.fillRect(mx - monitorW / 2 + 1, floorY - 10 - monitorH - 1, monitorW - 2, monitorH - 2);
  });

  // Ceiling lights
  ctx.fillStyle = "rgba(255,255,200,0.03)";
  [w * 0.2, w * 0.5, w * 0.8].forEach((lx) => {
    ctx.beginPath();
    ctx.arc(lx, 0, 80, 0, Math.PI);
    ctx.fill();
  });

  return floorY;
}

export function AgentRoom({ avatarStates, agents }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(0);
  const frameCountRef = useRef(0);
  // Interpolated positions for smooth movement
  const positionsRef = useRef({});

  const getAgentList = useCallback(() => {
    if (!agents || agents.length === 0) return [];
    return agents.filter((a) => a !== "_system");
  }, [agents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let running = true;

    function render() {
      if (!running) return;
      frameCountRef.current++;
      const frame = Math.floor(frameCountRef.current / 15); // ~4fps animation

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      // Draw room
      const floorY = drawRoom(ctx, w, h);

      const agentList = getAgentList();
      const scale = Math.max(2, Math.min(4, Math.floor(h / 60)));
      const charH = 14 * scale;
      const charW = 12 * scale;

      agentList.forEach((agent, idx) => {
        const state = avatarStates?.[agent] || {};
        const action = state.action || "idle";
        const direction = state.direction || "right";
        const message = state.message;

        // Target position
        let targetXPct = state.targetX != null ? state.targetX : (AGENT_POSITIONS[agent] ?? (15 + idx * 18));
        targetXPct = Math.max(5, Math.min(95, targetXPct));
        const targetPx = (targetXPct / 100) * w;

        // Smooth interpolation
        if (!positionsRef.current[agent]) {
          positionsRef.current[agent] = targetPx;
        }
        const currentX = positionsRef.current[agent];
        const speed = action === "walk" ? 0.05 : 0.02;
        positionsRef.current[agent] = currentX + (targetPx - currentX) * speed;

        const charX = positionsRef.current[agent] - charW / 2;
        const charY = floorY + 4;

        // Draw shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(positionsRef.current[agent], charY + charH + 2, charW / 2.5, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw character
        drawPixelChar(ctx, charX, charY, scale, agent, frame, action, direction);

        // Name tag below character
        const nameColor = HAIR_COLORS[agent] || "#8899aa";
        drawNameTag(ctx, positionsRef.current[agent], charY + charH + 14, agent, nameColor, scale);

        // Speech bubble
        if (message) {
          const elapsed = Date.now() - (state.timestamp || 0);
          if (elapsed < 8000) { // Show bubble for 8 seconds
            const opacity = elapsed > 6000 ? (8000 - elapsed) / 2000 : 1;
            ctx.globalAlpha = opacity;
            drawSpeechBubble(ctx, positionsRef.current[agent], charY, message, scale);
            ctx.globalAlpha = 1;
          }
        }

        // Action indicator particles
        if (action === "celebrate") {
          // Sparkles
          const sparkleColors = ["#ffd700", "#ff6b6b", "#48dbfb", "#ff9ff3", "#54a0ff"];
          for (let i = 0; i < 5; i++) {
            const angle = (frame * 0.5 + i * 1.2) % (Math.PI * 2);
            const radius = 15 + Math.sin(frame * 0.3 + i) * 8;
            const sx = positionsRef.current[agent] + Math.cos(angle) * radius;
            const sy = charY + charH / 2 + Math.sin(angle) * radius;
            ctx.fillStyle = sparkleColors[i % sparkleColors.length];
            ctx.fillRect(sx - 1, sy - 1, 3, 3);
          }
        }

        if (action === "think" || action === "code") {
          // Thought dots
          const dotX = positionsRef.current[agent] + (direction === "right" ? charW / 2 + 8 : -charW / 2 - 8);
          const dotY = charY + 4;
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          for (let i = 0; i < 3; i++) {
            const dy = -i * 6 - Math.sin(frame * 0.5 + i) * 2;
            const r = 1.5 + i * 0.5;
            ctx.beginPath();
            ctx.arc(dotX, dotY + dy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (action === "confused") {
          // Question mark
          ctx.fillStyle = "#ffcc00";
          ctx.font = `bold ${scale * 5}px monospace`;
          ctx.textAlign = "center";
          const bobY = Math.sin(frame * 0.4) * 3;
          ctx.fillText("?", positionsRef.current[agent], charY - 4 + bobY);
          ctx.textAlign = "start";
        }
      });

      // "room" watermark
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.font = "10px monospace";
      ctx.fillText("agent room", 8, h - 8);

      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [avatarStates, getAgentList]);

  return (
    <div className="agent-room">
      <canvas
        ref={canvasRef}
        className="agent-room-canvas"
      />
      {getAgentList().length === 0 && (
        <div className="agent-room-empty">waiting for agents to enter the room...</div>
      )}
    </div>
  );
}
