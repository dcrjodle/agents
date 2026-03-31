import { useState, useRef } from "react";
import { Button } from "./Button.jsx";
import "../styles/create-task.css";

export function CreateTask({ onCreate, onCreateAndStart, commands = [], value, onValueChange }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const isSlash = value.startsWith("/");
  const query = isSlash ? value.slice(1).toLowerCase() : "";
  const filtered = isSlash
    ? commands.filter((c) => c.label.toLowerCase().includes(query))
    : [];
  const showDropdown = isSlash && filtered.length > 0;

  const executeCommand = (cmd) => {
    cmd.action();
    onValueChange("");
    setActiveIndex(0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (showDropdown) {
      if (filtered[activeIndex]) {
        executeCommand(filtered[activeIndex]);
      }
      return;
    }
    if (!value.trim()) return;
    onCreate(value.trim());
    onValueChange("");
  };

  const handleChange = (e) => {
    onValueChange(e.target.value);
    setActiveIndex(0);
  };

  const handleKeyDown = (e) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Escape") {
        onValueChange("");
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && value.trim() && onCreateAndStart) {
      e.preventDefault();
      onCreateAndStart(value.trim());
      onValueChange("");
    }
  };

  const handleBlur = () => {
    // Small delay so click on item registers before dropdown closes
    setTimeout(() => {
      if (value.startsWith("/")) {
        onValueChange("");
        setActiveIndex(0);
      }
    }, 150);
  };

  return (
    <div className="create-task-wrapper">
      <form onSubmit={handleSubmit} className="create-task-form">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="describe a task... (/ for commands)"
          autoComplete="off"
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

      {showDropdown && (
        <div className="slash-dropdown">
          {filtered.map((cmd, i) => (
            <div
              key={cmd.label}
              className={`slash-item${i === activeIndex ? " active" : ""}`}
              onMouseDown={() => executeCommand(cmd)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="slash-item-label">
                <span>/</span>{cmd.label}
              </span>
              {cmd.description && (
                <span className="slash-item-description">{cmd.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
