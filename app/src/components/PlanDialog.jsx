import { useEffect, useRef, useState } from "react";
import { X, MessageSquarePlus } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent.jsx";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

export function PlanDialog({ plan, taskDescription, onApprove, onReject, onClose, onApproveAll, pendingPlanCount }) {
  const contentRef = useRef(null);
  const [showNotes, setShowNotes] = useState(false);
  const [reviewComments, setReviewComments] = useState("");

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    setShowNotes(false);
    setReviewComments("");
  }, [plan]);

  if (!plan) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: "100%",
          maxWidth: 680,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border-light)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 10,
              color: "var(--dot-planning)",
              fontWeight: 600,
              textTransform: "lowercase",
              letterSpacing: "0.05em",
            }}>
              plan review
            </span>
            <span style={{
              fontSize: 12,
              color: "var(--text)",
              fontWeight: 500,
            }}>
              {taskDescription}
            </span>
          </div>
          <IconButton icon={X} onClick={onClose} title="close" style={{ color: "var(--text-dim)" }} />
        </div>

        {/* Plan content */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 18px",
          }}
        >
          <MarkdownContent markdown={plan.markdown} />
          {plan.projectPath && (
            <div style={{
              color: "var(--text-dim)",
              fontSize: 10,
              marginTop: 12,
              paddingTop: 8,
              borderTop: "1px solid var(--border-light)",
            }}>
              {plan.projectPath}
            </div>
          )}

          {/* Reviewer notes toggle */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setShowNotes((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: showNotes ? "var(--text)" : "var(--text-dim)",
                fontSize: 11,
                padding: 0,
              }}
            >
              <MessageSquarePlus size={13} />
              {showNotes ? "hide reviewer notes" : "add reviewer notes"}
            </button>
            {showNotes && (
              <textarea
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder="Add notes for the developer agent (markdown supported)..."
                rows={5}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 8,
                  padding: "8px 10px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text)",
                  fontSize: 12,
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "10px 18px",
          borderTop: "1px solid var(--border-light)",
          flexShrink: 0,
        }}>
          <Button variant="secondary" size="md" onClick={onReject}>
            reject
          </Button>
          {pendingPlanCount > 1 && (
            <Button variant="secondary" size="md" onClick={() => onApproveAll(reviewComments || undefined)}>
              approve all ({pendingPlanCount})
            </Button>
          )}
          <Button variant="primary" size="md" onClick={() => onApprove(reviewComments || undefined)}>
            approve
          </Button>
        </div>
      </div>
    </div>
  );
}
