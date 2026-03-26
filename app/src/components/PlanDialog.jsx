import { useEffect, useRef } from "react";

export function PlanDialog({ plan, taskDescription, onApprove, onReject, onClose }) {
  const contentRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Scroll to top when plan changes
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [plan]);

  if (!plan) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 12,
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #2d2d2d",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  background: "#8b5cf6",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Plan Review
              </span>
              <span style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 500 }}>{taskDescription}</span>
            </div>
            {plan.projectPath && (
              <div style={{ color: "#6b7280", fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>
                {plan.projectPath}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#6b7280",
              fontSize: 20,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        {/* Plan content */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
              fontSize: 13,
              lineHeight: 1.6,
              color: "#d1d5db",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {plan.markdown}
          </pre>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px",
            borderTop: "1px solid #2d2d2d",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onReject}
            style={{
              fontSize: 13,
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #3d3d3d",
              background: "#2d2d2d",
              color: "#9ca3af",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            style={{
              fontSize: 13,
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #7c3aed",
              background: "#5b21b6",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Approve Plan
          </button>
        </div>
      </div>
    </div>
  );
}
