import { useState } from "react";
import { Button } from "./Button.jsx";

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
      <Button variant="primary" type="submit" size="md">
        add
      </Button>
    </form>
  );
}
