import { useEffect, useRef, useState } from "react";
import { X, MessageSquarePlus } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent.jsx";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

export function PRApprovalDialog({ pr, taskDescription, onApprove, onRequestChanges, onClose }) {
  const contentRef = useRef(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    setShowFeedback(false);
    setFeedback("");
  }, [pr]);

  if (!pr) return null;

  // Build markdown content to display
  const markdownLines = [];
  if (pr.branchName) {
    markdownLines.push(`**Branch:** \`${pr.branchName}\``);
    markdownLines.push("");
  }
  if (pr.diffSummary) {
    markdownLines.push("## Diff Summary");
    markdownLines.push("");
    markdownLines.push(pr.diffSummary);
  }
  if (markdownLines.length === 0) {
    markdownLines.push("*No details available.*");
  }
  const markdown = markdownLines.join("\n");

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
              color: "var(--dot-done, #22c55e)",
              fontWeight: 600,
              textTransform: "lowercase",
              letterSpacing: "0.05em",
            }}>
              pr approval
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

        {/* PR content */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 18px",
          }}
        >
          <MarkdownContent markdown={markdown} />
          {/* Feedback for developer toggle */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setShowFeedback((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: showFeedback ? "var(--text)" : "var(--text-dim)",
                fontSize: 11,
                padding: 0,
              }}
            >
              <MessageSquarePlus size={13} />
              {showFeedback ? "hide feedback" : "add feedback for developer"}
            </button>
            {showFeedback && (
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what's not working..."
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
          <Button
            variant="secondary"
            size="md"
            onClick={() => onRequestChanges(feedback)}
            disabled={!feedback.trim()}
          >
            send back to developer
          </Button>
          <Button variant="secondary" size="md" onClick={onClose}>
            cancel
          </Button>
          <Button variant="primary" size="md" onClick={onApprove}>
            Approve PR
          </Button>
        </div>
      </div>
    </div>
  );
}
