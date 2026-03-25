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
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Describe a task..."
        style={{ flex: 1, padding: "8px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6 }}
      />
      <button type="submit" style={{ padding: "8px 16px", fontSize: 14, borderRadius: 6, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}>
        Create
      </button>
    </form>
  );
}
