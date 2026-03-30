import { useState, useCallback, useMemo, useRef } from "react";
import { MACHINE_NODES, MACHINE_EDGES } from "../machineGraph.js";
import { STATE_COLORS } from "../constants.js";
import "../styles/xstate-viewer.css";

// ── Layout constants ─────────────────────────────────────────────────────────
const SVG_W = 1900;
const SVG_H = 520;

// ── Build flat id→node map (including compound children) ────────────────────
function buildNodeMap() {
  const map = {};
  for (const node of MACHINE_NODES) {
    if (node.type === "compound") {
      map[node.id] = node; // compound entry carries x,y,w,h
      for (const child of node.children) {
        map[child.id] = child;
      }
    } else {
      map[node.id] = node;
    }
  }
  return map;
}

const NODE_MAP = buildNodeMap();

// ── Build outgoing-edge map per node for tooltips ────────────────────────────
function buildOutgoingMap() {
  const map = {};
  for (const edge of MACHINE_EDGES) {
    if (!map[edge.from]) map[edge.from] = [];
    map[edge.from].push(edge);
  }
  return map;
}

const OUTGOING_MAP = buildOutgoingMap();

// ── Path helpers ─────────────────────────────────────────────────────────────

/** Cubic bezier from (x1,y1) to (x2,y2) with horizontal tension */
function forwardPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const cp = Math.max(dx * 0.5, 25);
  return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
}

/** Edge path for a single edge definition */
function edgePath(edge) {
  const src = NODE_MAP[edge.from];
  const tgt = NODE_MAP[edge.to];
  if (!src || !tgt) return "";

  // Helper to get connection points
  const srcW = src.w ?? 0;
  const srcH = src.h ?? 0;
  const tgtW = tgt.w ?? 0;
  const tgtH = tgt.h ?? 0;
  const srcCX = src.cx ?? (src.x + src.w / 2);
  const srcCY = src.cy ?? (src.y + src.h / 2);
  const tgtCX = tgt.cx ?? (tgt.x + tgt.w / 2);
  const tgtCY = tgt.cy ?? (tgt.y + tgt.h / 2);

  if (edge.type === "failure") {
    // Exit from bottom of source, arrive at top of failed
    const x1 = srcCX;
    const y1 = srcCY + srcH / 2;
    const x2 = tgtCX;
    const y2 = tgtCY - tgtH / 2;

    if (srcCX <= tgtCX + 60) {
      // Source is near or left of failed — gentle downward curve
      const mid = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${mid + 20}, ${x2} ${y2 - 20}, ${x2} ${y2}`;
    } else {
      // Source is to the right — route through a belt below the pipeline
      const belt = 430;
      return `M ${x1} ${y1} C ${x1} ${belt}, ${x2} ${belt}, ${x2} ${y2}`;
    }
  }

  if (edge.type === "retry") {
    if (edge.from === "failed") {
      // failed → planning.running: big U below
      const x1 = srcCX - srcW / 2;
      const y1 = srcCY;
      const x2 = tgtCX - tgtW / 2;
      const y2 = tgtCY;
      return `M ${x1} ${y1} C ${x1 - 60} ${y1 + 40}, ${x2 - 60} ${y2 + 40}, ${x2} ${y2}`;
    }
    // Other retries go through a belt at y=415 back to developing's right edge
    const belt = 415;
    const x1 = srcCX;
    const y1 = srcCY + srcH / 2;
    const x2 = tgtCX + tgtW / 2;
    const y2 = tgtCY;
    return `M ${x1} ${y1} C ${x1} ${belt}, ${x2} ${belt}, ${x2} ${y2}`;
  }

  // Default: forward edge — right of source to left of target
  const x1 = srcCX + srcW / 2;
  const y1 = srcCY;
  const x2 = tgtCX - tgtW / 2;
  const y2 = tgtCY;
  return forwardPath(x1, y1, x2, y2);
}

// ── Component ────────────────────────────────────────────────────────────────

export function XStateMachineView({ activeStateKey, context: _context }) {
  const [tooltip, setTooltip] = useState(null); // { nodeId, x, y }
  const svgRef = useRef(null);

  // Determine active node id and its parent compound id (if any)
  const activeId = activeStateKey || "";
  const activeParentId = activeId.includes(".")
    ? activeId.split(".")[0]
    : null;

  // Show tooltip on node hover
  const handleNodeEnter = useCallback((nodeId, e) => {
    setTooltip({ nodeId, x: e.clientX + 12, y: e.clientY + 12 });
  }, []);

  const handleNodeMove = useCallback((e) => {
    setTooltip((prev) => prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : null);
  }, []);

  const handleNodeLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Compute active-state fill colour from STATE_COLORS
  function getActiveColor(nodeId) {
    return STATE_COLORS[nodeId] || "var(--dot-planning)";
  }

  // Render a single atomic node rect + label
  function renderAtomicNode(node) {
    const isActive = node.id === activeId;
    const fill = isActive ? getActiveColor(node.id) : undefined;
    const cx = node.cx;
    const cy = node.cy;
    const hw = node.w / 2;
    const hh = node.h / 2;

    return (
      <g
        key={node.id}
        onMouseEnter={(e) => handleNodeEnter(node.id, e)}
        onMouseMove={handleNodeMove}
        onMouseLeave={handleNodeLeave}
        style={{ cursor: "default" }}
      >
        <rect
          x={cx - hw}
          y={cy - hh}
          width={node.w}
          height={node.h}
          rx={6}
          className={[
            "xsv-node-rect",
            isActive ? "xsv-node-rect--active" : "",
          ].join(" ")}
          style={
            isActive
              ? { fill, stroke: fill, strokeWidth: 2.5 }
              : undefined
          }
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className={[
            "xsv-node-label",
            isActive ? "xsv-node-label--active" : "",
          ].join(" ")}
        >
          {node.label}
        </text>
      </g>
    );
  }

  // Render a compound state container + its children
  function renderCompoundNode(node) {
    const isAncestorActive = node.id === activeParentId;
    const activeColor = isAncestorActive
      ? getActiveColor(activeId)
      : undefined;

    return (
      <g key={node.id}>
        {/* Container rect */}
        <rect
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={8}
          className={[
            "xsv-compound-rect",
            isAncestorActive ? "xsv-compound-rect--active" : "",
          ].join(" ")}
          style={
            isAncestorActive && activeColor
              ? {
                  fill: `color-mix(in srgb, ${activeColor} 8%, var(--bg-muted))`,
                  stroke: `color-mix(in srgb, ${activeColor} 40%, var(--border))`,
                }
              : undefined
          }
        />
        {/* Compound label (top-left corner) */}
        <text
          x={node.x + 10}
          y={node.y + 12}
          className="xsv-compound-label"
        >
          {node.label}
        </text>
        {/* Children */}
        {node.children.map((child) => renderAtomicNode(child))}
      </g>
    );
  }

  // Render all edges, behind nodes
  function renderEdges() {
    return MACHINE_EDGES.map((edge, i) => {
      const path = edgePath(edge);
      if (!path) return null;
      const markerId = `arrow-${edge.type}`;
      return (
        <path
          key={i}
          d={path}
          className={`xsv-edge xsv-edge--${edge.type}`}
          markerEnd={`url(#${markerId})`}
        />
      );
    });
  }

  // Tooltip content
  const tooltipContent = useMemo(() => {
    if (!tooltip) return null;
    const outgoing = OUTGOING_MAP[tooltip.nodeId] || [];
    const node = NODE_MAP[tooltip.nodeId];
    if (!node) return null;
    return { label: node.label, events: outgoing.map((e) => e.label) };
  }, [tooltip]);

  return (
    <div className="xstate-viewer">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width={SVG_W}
        height={SVG_H}
        className="xstate-viewer-svg"
      >
        {/* ── Arrowhead marker definitions ── */}
        <defs>
          {["main", "guard", "failure", "retry"].map((t) => (
            <marker
              key={t}
              id={`arrow-${t}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L0,6 L8,3 z" className={`xsv-arrow-${t}`} />
            </marker>
          ))}
        </defs>

        {/* ── Edges (behind nodes) ── */}
        {renderEdges()}

        {/* ── Compound state containers ── */}
        {MACHINE_NODES.filter((n) => n.type === "compound").map(renderCompoundNode)}

        {/* ── Atomic (top-level) nodes ── */}
        {MACHINE_NODES.filter((n) => n.type === "atomic").map(renderAtomicNode)}
      </svg>

      {/* ── Hover tooltip ── */}
      {tooltip && tooltipContent && (
        <div
          className="xsv-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="xsv-tooltip-title">{tooltipContent.label}</div>
          {tooltipContent.events.length === 0 ? (
            <div className="xsv-tooltip-event" style={{ color: "var(--text-dim)" }}>
              no outgoing transitions
            </div>
          ) : (
            tooltipContent.events.map((ev, i) => (
              <div key={i} className="xsv-tooltip-event">
                → {ev}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
