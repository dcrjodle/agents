import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { Button } from "./Button.jsx";

export function ExpandedInputDialog({ value, onChange, onClose, onSubmit }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    // Focus the textarea when dialog opens
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, []);

  const handleSubmit = () => {
    if (value.trim() && onSubmit) {
      onSubmit();
    }
  };

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
          maxWidth: 600,
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
          <span style={{
            fontSize: 12,
            color: "var(--text)",
            fontWeight: 500,
          }}>
            expanded input
          </span>
          <IconButton icon={X} onClick={onClose} title="close" style={{ color: "var(--text-dim)" }} />
        </div>

        {/* Textarea content */}
        <div style={{ padding: "16px 18px" }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="describe a task..."
            style={{
              display: "block",
              width: "100%",
              minHeight: 200,
              padding: "12px 14px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              resize: "vertical",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
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
          <Button variant="secondary" size="md" onClick={onClose}>
            done
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={!value.trim()}>
            add task
          </Button>
        </div>
      </div>
    </div>
  );
}
