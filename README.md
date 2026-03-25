# Multi-Agent Workflow

A multi-agent system orchestrated by XState, with a React UI for managing tasks and monitoring agent progress in real time.

## Architecture

```
┌─────────────┐   WebSocket   ┌──────────────┐     ┌─────────────────┐
│  React App  │ ◄────────────►│  Server      │────►│  Agent (claude)  │
│  (Vite)     │               │  Express+WS  │     │  in isolated dir │
│  :5173      │               │  :3001       │     └─────────────────┘
└─────────────┘               └──────────────┘
                                 │ one XState
                                 │ actor per task
                                 │ (parallel workflows)
```

## Agents

Each agent runs as a **claude code terminal** in an isolated workspace under `memory/runs/<task_id>/`.

| Agent | Role | Tools |
|-------|------|-------|
| **manager** | Orchestrates workflow, delegates to other agents | delegate, status |
| **planner** | Decomposes goals into actionable task plans | decompose, estimate |
| **developer** | Writes code from task specs | read_file, write_file, search |
| **githubber** | Manages branches, PRs, and issues | branch, pr, issue |
| **tester** | Writes and runs tests, validates criteria | run_tests, validate |
| **reviewer** | Reviews code for quality and security | review, security |

### Agent Structure

```
agents/<name>/
├── tools/        # Bash tool scripts sourced at runtime
├── memory/       # Persistent memory + isolated run workspaces
│   └── runs/     # One folder per task run
├── program.md    # System prompt (passed to claude --system-prompt)
└── start.sh      # Launches claude code with program.md and tools
```

## Task States

Tasks flow through the XState machine:

```
idle → planning → developing → testing → reviewing → merging → done
          │            ↑            │           │
          │            └────────────┘           │
          │            (TESTS_FAILED)           │
          │            ↑                        │
          │            └────────────────────────┘
          │            (CHANGES_REQUESTED)
          ↓
        failed → (RETRY) → planning
```

Mapped to UI columns: **Todo → Planned → In Progress → Testing → Reviewing → Published**

## Quick Start

```bash
# Install dependencies
npm install
cd app && npm install && cd ..

# Run both server and app
npm run dev

# Or separately:
npm run server   # Express + WebSocket on :3001
npm run app      # Vite dev server on :5173
```

Open http://localhost:5173 — create tasks, and use the simulate buttons to advance them through the workflow.

## WebSocket Protocol

```jsonc
// Server → Client: initial state on connect
{ "type": "INIT", "tasks": [...] }

// Server → Client: state change
{ "type": "STATE_UPDATE", "taskId": "...", "state": "testing", "label": "testing", "context": {...} }

// Server → Client: new task
{ "type": "TASK_CREATED", "task": {...} }

// Server → Client: task removed
{ "type": "TASK_DELETED", "taskId": "..." }

// Client → Server: advance a task
{ "type": "SEND_EVENT", "taskId": "...", "event": { "type": "TESTS_PASSED" } }
```

## Future Ideas

### 1. Task detail view with agent message streams

Replace the kanban board with a centered task list showing status icons. Clicking a task expands it to reveal columns to the left — one per agent that has been activated for that task. Each column displays the agent's live message stream (stdout from the claude terminal), so you can watch agents think and work in real time. Agents that haven't started yet don't get a column.

```
┌─────────┬──────────┬───────────┬────────────────────────┐
│ planner │developer │  tester   │  ● Build REST API      │
│         │          │           │  ○ Add auth middleware  │
│ Done.   │ Writing  │ (waiting) │  ○ Fix login bug       │
│ 3 tasks │ routes.js│           │  ○ Deploy to staging   │
│ created │ ...      │           │                        │
└─────────┴──────────┴───────────┴────────────────────────┘
```

### 2. Neo4j-backed agent memory

Replace the flat-file `memory/` directories with a Neo4j graph database per agent. Relationships between tasks, code artifacts, decisions, and errors become first-class edges in the graph. This lets agents query their own history relationally — e.g. "what did I learn last time I worked on auth?" or "which files tend to break together?" — instead of grepping through markdown files.

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tasks` | List all tasks with current state |
| `POST` | `/tasks` | Create a task `{ description }` |
| `POST` | `/tasks/:id/event` | Send event to task `{ event: { type } }` |
| `DELETE` | `/tasks/:id` | Remove a task |
