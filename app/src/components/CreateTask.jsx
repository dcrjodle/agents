import { useState } from "react";

export function CreateTask({ onCreate }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onCreate(value.trim());
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} style={{
      display: "flex",
      gap: 8,
      marginBottom: 20,
    }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="describe a task..."
        style={{
          flex: 1,
          padding: "7px 12px",
          fontSize: 12,
          border: "1px solid var(--border)",
          borderRadius: 4,
          background: "var(--bg-surface)",
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          outline: "none",
        }}
      />
      <button
        type="submit"
        style={{
          padding: "7px 14px",
          fontSize: 12,
          borderRadius: 4,
          border: "1px solid var(--border)",
          background: "var(--text)",
          color: "var(--bg)",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
        }}
      >
        add
      </button>
    </form>
  );
}
