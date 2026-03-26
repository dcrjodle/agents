import { useState, useEffect, useCallback } from "react";

/**
 * ConnectionLines - SVG overlay that draws bezier paths from task rows to stream panel columns.
 *
 * @param {Object} props
 * @param {React.RefObject} props.containerRef - Ref to the main content area container
 * @param {string|null} props.selectedTaskId - Currently selected task ID
 * @param {Object} props.taskRowRefs - Map of task ID to DOM element refs
 * @param {React.RefObject} props.streamPanelRef - Ref to the stream panel element
 * @param {Object} props.columnRefs - Map of agent name to column DOM element refs
 * @param {boolean} props.columnsMode - Whether columns mode is active
 */
export function ConnectionLines({
  containerRef,
  selectedTaskId,
  taskRowRefs,
  streamPanelRef,
  columnRefs,
  columnsMode,
}) {
  const [paths, setPaths] = useState([]);

  const recalculate = useCallback(() => {
    if (!containerRef?.current || !selectedTaskId) {
      setPaths([]);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft || 0;
    const taskEl = taskRowRefs[selectedTaskId];
    if (!taskEl) {
      setPaths([]);
      return;
    }

    const taskRect = taskEl.getBoundingClientRect();
    const startX = taskRect.right - containerRect.left + scrollLeft;
    const startY = taskRect.top + taskRect.height / 2 - containerRect.top;

    const newPaths = [];

    if (columnsMode && columnRefs) {
      for (const [agent, el] of Object.entries(columnRefs)) {
        if (!el) continue;
        const colRect = el.getBoundingClientRect();
        const endX = colRect.left - containerRect.left + scrollLeft;
        const endY = colRect.top + 16 - containerRect.top;
        const cpX = (startX + endX) / 2;
        newPaths.push({
          key: agent,
          d: `M ${startX} ${startY} C ${cpX} ${startY}, ${cpX} ${endY}, ${endX} ${endY}`,
        });
      }
    } else if (streamPanelRef?.current) {
      const panelRect = streamPanelRef.current.getBoundingClientRect();
      const endX = panelRect.left - containerRect.left + scrollLeft;
      const endY = panelRect.top + 20 - containerRect.top;
      const cpX = (startX + endX) / 2;
      newPaths.push({
        key: "panel",
        d: `M ${startX} ${startY} C ${cpX} ${startY}, ${cpX} ${endY}, ${endX} ${endY}`,
      });
    }

    setPaths(newPaths);
  }, [containerRef, selectedTaskId, taskRowRefs, streamPanelRef, columnRefs, columnsMode]);

  useEffect(() => {
    recalculate();
    const interval = setInterval(recalculate, 300);

    const container = containerRef?.current;
    if (container) {
      container.addEventListener("scroll", recalculate);
    }

    window.addEventListener("resize", recalculate);
    return () => {
      clearInterval(interval);
      if (container) {
        container.removeEventListener("scroll", recalculate);
      }
      window.removeEventListener("resize", recalculate);
    };
  }, [recalculate]);

  if (paths.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
        overflow: "visible",
      }}
    >
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke="var(--line-color)"
          strokeWidth="1.5"
          strokeDasharray="1000"
          strokeDashoffset="0"
          style={{
            animation: "draw-path 0.5s ease-out",
          }}
        />
      ))}
    </svg>
  );
}
