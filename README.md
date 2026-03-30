# Multi-Agent Workflow

A multi-agent system orchestrated by XState where specialized Claude agents collaborate to plan, develop, test, review, and ship code. React UI for managing tasks and monitoring agent progress in real time.

## Architecture

```
React App (Vite :5173) ◄──WebSocket──► Server (Express :3001) ──► Claude Agents (SDK)
                                          │
                                     One XState actor per task
```

## Agents

| Agent | Role |
|-------|------|
| **planner** | Explores codebase, creates implementation plan |
| **developer** | Writes code from the plan |
| **tester** | Runs tests, validates changes |
| **reviewer** | Reviews code quality and correctness |
| **githubber** | Creates PRs on GitHub |
| **merger** | Merges approved PRs |

Agents are defined in `agents/<name>/` with an `agent.json` config and `program.md` system prompt. They run via the Claude Agent SDK with workflow MCP tools (`report_result`, `report_status`).

## Task Lifecycle

```
idle → planning → developing → testing → reviewing → merging → done
                      ↑             |           |
                      └─────────────┘           |
                      (tests failed)            |
                      ↑                         |
                      └─────────────────────────┘
                      (changes requested)
```

## Quick Start

```bash
npm install
cd app && npm install && cd ..

npm run dev        # Server (:3001) + App (:5173)
```

## Production

The server auto-resolves project paths — if a project was created on a different machine, it clones the repo to `~/projects/<repo-name>` using the project's configured GitHub URL.

```bash
pm2 start server/index.js --name agents
```

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tasks` | List all tasks |
| `POST` | `/tasks` | Create task `{ description, projectPath }` |
| `POST` | `/tasks/:id/event` | Send event `{ event: { type } }` |
| `DELETE` | `/tasks/:id` | Remove task |
| `GET` | `/config` | Get projects and settings |
| `POST` | `/config/projects` | Add project `{ name, path }` |
| `POST` | `/deploy` | Pull latest and restart server |
