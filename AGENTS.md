# Project Rules for the Agents Repo

These rules are automatically read by the **planner** and **developer** agents before they start work.
Add project-specific conventions, off-limits files, or domain knowledge here.

## Coding Conventions
- This project uses Node.js ESM (`import`/`export`) — never use CommonJS `require()`.
- Prefer the `Edit` tool over `Write` when modifying existing files to minimise diffs.
- All agent configs live under `agents/<role>/agent.json`; do not move them.

## Off-Limits
- Do not modify `server/mcp-server.js` without explicit instruction — it is a shared protocol boundary.
- Do not change the `xstate` machine definition in `server/machine.js` without understanding the full state graph.

## Architecture Notes
- Prompt builders (`buildPlannerPrompt`, `buildDeveloperPrompt`, etc.) live in `server/agent-runner.js`.
- Agent system prompts are stored in `agents/<role>/program.md` and loaded at startup.
- `config.json` in the repo root lists the target projects agents operate on.
