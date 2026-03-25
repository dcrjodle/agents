// Maps each machine state to the possible next events for simulation
const NEXT_EVENTS = {
  planning: [
    { type: "PLAN_COMPLETE", plan: { tasks: ["task 1", "task 2"] } },
    { type: "PLAN_FAILED", error: "Planning failed" },
  ],
  developing: [
    { type: "CODE_COMPLETE", files: ["src/index.js"] },
    { type: "CODE_FAILED", error: "Build error" },
  ],
  testing: [
    { type: "TESTS_PASSED" },
    { type: "TESTS_FAILED", error: "Test failure" },
  ],
  reviewing: [
    { type: "REVIEW_APPROVED" },
    { type: "CHANGES_REQUESTED", feedback: "Needs refactor" },
  ],
  merging: [
    { type: "MERGED" },
    { type: "PR_FAILED", error: "Merge conflict" },
  ],
  failed: [{ type: "RETRY" }],
};

const STATE_AGENTS = {
  planning: "planner",
  developing: "developer",
  testing: "tester",
  reviewing: "reviewer",
  merging: "githubber",
};

export function TaskCard({ task, onSendEvent, onDelete }) {
  const events = NEXT_EVENTS[task.state] || [];
  const agent = STATE_AGENTS[task.state];

  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12, fontSize: 13, background: "#fff" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{task.description}</div>

      {agent && (
        <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
          agent: <strong>{agent}</strong>
        </div>
      )}

      {task.context?.error && (
        <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 6 }}>
          {task.context.error}
        </div>
      )}

      {task.context?.retries > 0 && (
        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 6 }}>
          retries: {task.context.retries}
        </div>
      )}

      {/* Simulate buttons — advance the state machine */}
      {events.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {events.map((evt) => (
            <button
              key={evt.type}
              onClick={() => onSendEvent(task.id, evt)}
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #ddd",
                background: "#f5f5f5",
                cursor: "pointer",
              }}
            >
              {evt.type}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => onDelete(task.id)}
        style={{ fontSize: 10, color: "#999", background: "none", border: "none", cursor: "pointer", marginTop: 6, padding: 0 }}
      >
        delete
      </button>
    </div>
  );
}
