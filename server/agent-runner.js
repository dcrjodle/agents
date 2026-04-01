import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath, URL } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the absolute path to the SDK's bundled cli.js so it works
// regardless of which project cwd the agent runs in.
const require = createRequire(import.meta.url);
const sdkDir = dirname(require.resolve("@anthropic-ai/claude-agent-sdk"));
const CLI_JS_PATH = join(sdkDir, "cli.js");
const AGENTS_DIR = join(__dirname, "..", "agents");
const PORT = process.env.PORT || 3001;

// Session store for resume support: taskId -> sessionId
const sessionStore = new Map();

export function clearSession(taskId) {
  sessionStore.delete(taskId);
}

// --- CWD resolvers ---

const CWD_RESOLVERS = {
  projectPath: (h) => h.projectPath,
  worktreeOrProject: (h) => h.context.result?.worktreePath || h.projectPath,
};

// --- Prompt builder registry ---

// buildEvaluatorPrompt is defined in the Prompt Builders section below but referenced here.
// JS hoisting ensures function declarations are available.

const PROMPT_BUILDERS = {
  planner: buildPlannerPrompt,
  developer: buildDeveloperPrompt,
  reviewer: buildReviewerPrompt,
  githubber: buildGithubberPrompt,
  merger: buildMergerPrompt,
  evaluator: buildEvaluatorPrompt,
  "file-developer": buildFileDeveloperPrompt,
};

// --- Auto-discovery: load agent configs from agents/*/agent.json ---

const agentConfigs = new Map();

async function loadAgentConfigs() {
  const entries = readdirSync(AGENTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const agentDir = join(AGENTS_DIR, entry.name);
    const configPath = join(agentDir, "agent.json");

    if (!existsSync(configPath)) continue;

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const role = entry.name;

    // Bash-only agents (tester) — store config but skip SDK setup
    if (config.runtime === "bash") {
      agentConfigs.set(role, { runtime: "bash", entrypoint: config.entrypoint || "start.sh", agentDir });
      continue;
    }

    // Read system prompt
    const programMdPath = join(agentDir, "program.md");
    const systemPrompt = existsSync(programMdPath) ? readFileSync(programMdPath, "utf-8") : "";

    // Resolve CWD strategy
    const getCwd = CWD_RESOLVERS[config.cwd] || CWD_RESOLVERS.projectPath;

    // Map prompt builder by role name
    const buildPrompt = PROMPT_BUILDERS[role];
    if (!buildPrompt) {
      console.warn(`No prompt builder for role "${role}" — agent will use system prompt only`);
    }

    // Load MCP tools if specified — store the tools array, not a Protocol instance,
    // so each agent run gets a fresh MCP server (Protocol can only connect once).
    let mcpTools = null;
    if (config.mcpTools) {
      const toolsPath = join(agentDir, config.mcpTools);
      if (existsSync(toolsPath)) {
        try {
          const module = await import(toolsPath);
          if (module.tools && module.tools.length > 0) {
            mcpTools = { name: `${role}-tools`, tools: module.tools };
          }
        } catch (err) {
          console.error(`Failed to load MCP tools for ${role} from ${toolsPath}:`, err);
        }
      } else {
        console.warn(`MCP tools file not found for ${role}: ${toolsPath}`);
      }
    }

    agentConfigs.set(role, {
      runtime: "sdk",
      agentDir,
      systemPrompt,
      tools: config.tools || [],
      getCwd,
      buildPrompt,
      supportsResume: config.supportsResume || false,
      mcpTools,
      model: config.model || "claude-sonnet-4-6",
    });
  }

  console.log(`Loaded ${agentConfigs.size} agent configs: ${[...agentConfigs.keys()].join(", ")}`);
}

// Initialize on import
const _configsReady = loadAgentConfigs();

/**
 * Ensure agent configs are loaded before use.
 */
export async function ensureConfigsLoaded() {
  await _configsReady;
}

/**
 * Check if a role uses bash runtime (vs SDK).
 */
export function isBashAgent(role) {
  const config = agentConfigs.get(role);
  return config?.runtime === "bash";
}

/**
 * Get the loaded config for an agent role (used by CLI spawner).
 */
export function getAgentConfig(role) {
  return agentConfigs.get(role);
}

// --- Helper to read files relative to an agent's directory ---

function readAgentFile(relativePath) {
  const fullPath = join(__dirname, "..", relativePath);
  return readFileSync(fullPath, "utf-8");
}

// --- Helper to read project-level rules from AGENTS.md ---

const MAX_PROJECT_RULES_LENGTH = 4000;

function readProjectRules(projectPath) {
  const rulesPath = join(projectPath, "AGENTS.md");
  if (!existsSync(rulesPath)) return "";
  const contents = readFileSync(rulesPath, "utf-8");
  if (contents.length > MAX_PROJECT_RULES_LENGTH) {
    console.warn(`AGENTS.md in ${projectPath} exceeds ${MAX_PROJECT_RULES_LENGTH} chars — truncating`);
    return contents.slice(0, MAX_PROJECT_RULES_LENGTH) + "\n\n[... truncated ...]";
  }
  return contents;
}

// --- Prompt Builders ---

function buildPlannerPrompt(handoff) {
  const planTemplate = readAgentFile("agents/planner/templates/plan.md");
  const projectRules = readProjectRules(handoff.projectPath);
  const rulesSection = projectRules
    ? `\n## Project Rules\nThe following rules are defined by the project owner and MUST be followed:\n\n${projectRules}\n`
    : "";

  const userComments = handoff.context.plan?.userComments || "";
  let userFeedbackSection = "";
  if (userComments) {
    userFeedbackSection = `
## User Feedback
The following feedback was provided by the user on the previous plan. Address these notes in your revised plan:

${userComments}
`;
  }

  // Include attached images section if any
  const images = handoff.context.images || [];
  let imagesSection = "";
  if (images.length > 0) {
    imagesSection = `
## Attached Images
The user has attached ${images.length} image(s) to this task. Use the Read tool to view each image to understand the visual requirements:
${images.map((path) => `- ${path}`).join("\n")}

IMPORTANT: Review these images before creating your plan. They may contain mockups, screenshots, or visual references that are essential for understanding the task.
`;
  }

  return `You are a planner agent. Your job is to create an implementation plan.

Task: ${handoff.instruction}
Project path: ${handoff.projectPath}
${userFeedbackSection}${imagesSection}
First, explore the project directory to understand its structure, framework, and conventions.
Detect the framework from actual project files (package.json, .csproj, go.mod, etc.) — do NOT assume any framework that isn't evidenced in the codebase.
Then write a plan following this template:

${planTemplate}
${rulesSection}
IMPORTANT: When you are done, you MUST call the report_result tool with:
{
  "status": "plan_ready",
  "plan": {
    "markdown": "<your plan in markdown>",
    "projectPath": "${handoff.projectPath}"
  }
}`;
}

function buildDeveloperPrompt(handoff) {
  const worktreePath = handoff.context.result?.worktreePath || "";
  const planMarkdown = handoff.context.plan?.markdown || "";
  const retries = handoff.context.retries || 0;
  const error = handoff.context.error || "";

  const reviewComments = handoff.context.plan?.reviewComments || "";
  let reviewerNotesSection = "";
  if (reviewComments) {
    reviewerNotesSection = `
## Reviewer Notes
The following notes were provided by the human reviewer when approving this plan. Take them into account when implementing:

${reviewComments}
`;
  }

  let retrySection = "";
  if (error && retries > 0) {
    retrySection = `
## REVIEWER FEEDBACK (RETRY ${retries})
The reviewer rejected your previous changes. You MUST address ALL of the issues listed below.

${error}

RETRY INSTRUCTIONS:
1. Read each file mentioned in the feedback to see its CURRENT state in the worktree
2. Identify the SPECIFIC lines/sections the reviewer flagged
3. Use the Edit tool to make ONLY the fixes requested — do not rewrite files
4. If the reviewer says something is missing (e.g. an import, prop, or function), add it back surgically
5. Do NOT claim 'no changes needed' unless you have verified every issue is resolved by reading the files
6. LEARN FROM THIS FEEDBACK: Before fixing the issues, call \`add_memory\` to save the lesson for future tasks. Extract a concise, actionable rule (e.g., 'Always use Edit instead of Write for existing files'). Use \`code_quality\` category for style/pattern issues or \`architecture\` for structural issues.
`;
  }

  const projectRules = readProjectRules(handoff.projectPath);
  const rulesSection = projectRules
    ? `\n## Project Rules\nThe following rules are defined by the project owner and MUST be followed:\n\n${projectRules}\n`
    : "";

  // Include attached images section if any
  const images = handoff.context.images || [];
  let imagesSection = "";
  if (images.length > 0) {
    imagesSection = `
## Attached Images
The user has attached ${images.length} image(s) to this task. Use the Read tool to view each image to understand the visual requirements:
${images.map((path) => `- ${path}`).join("\n")}

IMPORTANT: Review these images before implementing. They may contain mockups, screenshots, or visual references that are essential for understanding what needs to be built.
`;
  }

  return `You are a developer agent. Implement the following task in the worktree.

Task: ${handoff.instruction}
Project path: ${handoff.projectPath}
Worktree path: ${worktreePath}

Plan from planner:
${planMarkdown}
${reviewerNotesSection}${retrySection}${rulesSection}${imagesSection}
IMPORTANT RULES:
- Work ONLY within the worktree at: ${worktreePath}
- ALWAYS read a file before modifying it — use Read to see the current contents first
- Use the Edit tool (not Write) for existing files — Edit makes surgical replacements, Write replaces the entire file and risks losing existing code
- Only use Write for brand-new files that don't exist yet
- Preserve ALL existing imports, props, functions, event handlers, and patterns not mentioned in the plan
- Follow the project's existing conventions (if the file uses CSS classes, keep CSS classes; if it uses certain patterns, match them)
- Do NOT run any git commands (no git add, commit, push, etc.) — git is handled separately

When you are done, you MUST call the report_result tool with:
{"status": "complete", "summary": "<summary of changes>"} or {"status": "failed", "error": "<what went wrong>"}`;
}

function buildReviewerPrompt(handoff) {
  const worktreePath = handoff.context.result?.worktreePath || "";
  const reviewPath = worktreePath || handoff.projectPath;
  const planMarkdown = handoff.context.plan?.markdown || "";
  const filesChanged = handoff.context.result?.files || [];

  // Detect framework and select checklist
  let checklistFile = "agents/reviewer/checklists/general.md";
  const projectPath = handoff.projectPath;

  try {
    const entries = existsSync(projectPath) ? execSync(`ls "${projectPath}"`, { encoding: "utf-8" }) : "";
    if (entries.match(/\.csproj/)) {
      checklistFile = "agents/reviewer/checklists/dotnet-ivy.md";
    } else if (existsSync(join(projectPath, "package.json"))) {
      const pkg = readFileSync(join(projectPath, "package.json"), "utf-8");
      if (pkg.includes('"react"')) {
        checklistFile = "agents/reviewer/checklists/react-typescript.md";
      }
    }
  } catch {}

  const checklist = readAgentFile(checklistFile);
  const checklistName = checklistFile.split("/").pop();

  // Generate git diff
  let diffSection = "";
  try {
    if (worktreePath && existsSync(worktreePath)) {
      const gitDiff = execSync(
        `cd "${worktreePath}" && git diff HEAD~1 --no-color 2>/dev/null || git diff main --no-color 2>/dev/null || echo "(diff unavailable)"`,
        { encoding: "utf-8", maxBuffer: 1024 * 1024 }
      );
      if (gitDiff && gitDiff !== "(diff unavailable)") {
        diffSection = `
## Git Diff (what was actually changed)
Review this diff carefully. Lines starting with \`-\` were REMOVED, lines starting with \`+\` were ADDED.
If you see important code being removed that isn't mentioned in the plan, that is a REGRESSION.

\`\`\`diff
${gitDiff}
\`\`\`
`;
      }
    }
  } catch {}

  return `You are a code reviewer. Review the code changes against the checklist below.

Task: ${handoff.instruction}
Project path: ${projectPath}
Review path: ${reviewPath}
Files changed: ${JSON.stringify(filesChanged)}

Plan:
${planMarkdown}
${diffSection}
## Review Checklist
${checklist}

## Regression Checklist
In addition to the checklist above, verify that:
- [ ] No existing imports were removed unless the plan required it
- [ ] No existing props were dropped from component signatures
- [ ] No existing event handlers (onClick, onContextMenu, onChange, etc.) were removed
- [ ] No existing CSS class usage was replaced with inline styles (or vice versa)
- [ ] No existing functions or callbacks were deleted
- [ ] The diff only adds/modifies what the plan describes — nothing else was lost

INSTRUCTIONS:
1. Read each changed file in the review path
2. Review the git diff above to check for unintended removals or regressions
3. Evaluate against EVERY item in both checklists above
4. Run the check_style and security_scan tools on the review path
5. When you are done, you MUST call the report_result tool with:
{"status": "complete", "verdict": "approved", "summary": "<review>", "checklist": "${checklistName}", "comments": []}
or
{"status": "complete", "verdict": "changes_requested", "summary": "<review>", "checklist": "${checklistName}", "comments": ["issue1", "issue2"]}

5. Be thorough but practical. Approve if the code is correct, follows conventions, and introduces no regressions.`;
}

function buildGithubberPrompt(handoff) {
  const worktreePath = handoff.context.result?.worktreePath || "";
  const branchName = handoff.context.result?.branchName || "";

  return `Create a pull request for the following task.

Task: ${handoff.instruction}
Branch: ${branchName}
Worktree: ${worktreePath}

Steps:
1. Use the get_diff_summary tool to see what changed
2. Generate a concise PR title (under 70 characters) and a markdown body with:
   - A brief summary of changes (2-3 bullet points)
   - A test plan section
3. Use the create_pr tool to create the PR

When you are done, you MUST call the report_result tool with:
{"status": "complete", "prUrl": "<the PR URL>", "branchName": "${branchName}", "prTitle": "<the PR title>"}
or if it fails:
{"status": "failed", "error": "<what went wrong>"}`;
}

function buildMergerPrompt(handoff) {
  const worktreePath = handoff.context.result?.worktreePath || "";
  const branchName = handoff.context.result?.branchName || "";
  const projectPath = handoff.projectPath;
  const planMarkdown = handoff.context.plan?.markdown || "";

  return `Merge the task branch into main.

Task: ${handoff.instruction}
Project path: ${projectPath}
Worktree path: ${worktreePath}
Branch: ${branchName}

Plan that was implemented:
${planMarkdown}

## Steps

1. Use the merge_main_into_branch tool to fetch latest main and merge it into the task branch
2. If conflicts are reported, read the conflicted files, resolve the conflict markers, then run: git add -A && git commit --no-edit
3. Use the fast_forward_main tool to merge the task branch into main and push
4. Use the cleanup_branch tool to remove the worktree and delete the branch

When resolving conflicts, read the plan to understand what the task changed — keep BOTH the task's changes AND main's updates.

When you are done, you MUST call the report_result tool with:
{"status": "complete"}
or if it fails:
{"status": "failed", "error": "<what went wrong>"}`;
}

function buildEvaluatorPrompt(handoff) {
  return `You are a code quality evaluator. Scan the project at the following path and produce a quality report.

Project path: ${handoff.projectPath}

Steps:
1. Use Glob or Bash to list the project file tree (exclude node_modules, dist, .git, lock files)
2. Identify key source files — entry points, main components/modules, config files
3. Read a representative sample of 5–15 files to understand architecture and patterns
4. Score the project 1–10 across 6 dimensions: quality, maintainability, readability, decomposition, structure, codeHealth
5. Compute the overall weighted score (quality 25%, maintainability 20%, readability 20%, decomposition 15%, structure 10%, codeHealth 10%)
6. Write 5–10 concrete, actionable improvement suggestions with priority (high/medium/low)

When you are done, you MUST call the report_result tool with:
{
  "score": <number 1-10>,
  "dimensions": { "quality": <n>, "maintainability": <n>, "readability": <n>, "decomposition": <n>, "structure": <n>, "codeHealth": <n> },
  "suggestions": [{ "title": "<string>", "description": "<string>", "priority": "high|medium|low" }],
  "summary": "<1-3 sentence overview>"
}`;
}

function buildFileDeveloperPrompt(handoff) {
  const filePath = handoff.context.filePath || "";
  const taskDescription = handoff.context.taskDescription || "";
  const worktreePath = handoff.context.worktreePath || "";
  const planContext = handoff.context.planContext || "";

  return `You are a file-developer sub-agent. Implement changes for a single file.

## Your Assignment

File: ${filePath}
Worktree: ${worktreePath}

## Task
${taskDescription}

## Plan Context
${planContext}

## Instructions

1. **Read the file first** — If the file exists at \`${filePath}\`, read it completely before making any changes.
2. **Use Edit for existing files** — Make surgical changes with the Edit tool. Only use Write for new files.
3. **Preserve existing code** — Keep all imports, functions, props, and handlers that aren't mentioned in the task.
4. **Follow existing style** — Match the file's conventions (indentation, quotes, naming).
5. **Single file only** — Do NOT modify any file other than \`${filePath}\`.

When you are done, you MUST call report_result with:
{"status": "complete", "file": "${filePath}", "changes": "<summary>"}
or
{"status": "failed", "file": "${filePath}", "error": "<what went wrong>"}`;
}

// --- Resume prompt (for developer retries with existing session) ---

function buildResumePrompt(handoff) {
  const error = handoff.context.error || "Unknown feedback";
  return `Your previous implementation was rejected. Here is the feedback:

${error}

Fix the issues above. Read affected files first, then make surgical edits.

When you are done, you MUST call the report_result tool with:
{"status": "complete", "summary": "<summary of fixes>"} or {"status": "failed", "error": "<what went wrong>"}`;
}

// --- Main runner ---

let pidCounter = 1;

/**
 * Run an agent via the Claude Agent SDK.
 * Returns { pid, kill(), gotResult() } — same interface as the old spawnAgent.
 */
export function runAgent(role, taskId, handoff, callbacks) {
  const config = agentConfigs.get(role);
  if (!config || config.runtime === "bash") {
    console.error(`Cannot run SDK agent for role: ${role}`);
    return { pid: null, kill: () => {}, gotResult: () => false };
  }

  const cwd = config.getCwd(handoff);

  // Determine if we should resume an existing session
  const retries = handoff.context.retries || 0;
  const canResume = config.supportsResume && retries > 0 && sessionStore.has(taskId);
  const prompt = canResume ? buildResumePrompt(handoff) : (config.buildPrompt ? config.buildPrompt(handoff) : handoff.instruction);
  const resumeSessionId = canResume ? sessionStore.get(taskId) : undefined;

  const abortController = new AbortController();
  let resultReceived = false;
  const fakePid = pidCounter++;

  // Build MCP servers config
  const mcpServers = {
    // Workflow tools (report_status, report_result, etc.) — stdio subprocess with per-task env
    workflow: {
      command: "node",
      args: [join(__dirname, "mcp-server.js")],
      env: {
        TASK_ID: taskId,
        ORCHESTRATOR_URL: `http://localhost:${PORT}`,
      },
    },
  };

  // Add role-specific in-process MCP server if agent has custom tools
  // Create a fresh Protocol instance per run to avoid "already connected" errors
  if (config.mcpTools) {
    mcpServers[config.mcpTools.name] = createSdkMcpServer({
      name: config.mcpTools.name,
      version: "1.0.0",
      tools: config.mcpTools.tools,
    });
  }

  // Start the query in the background
  const run = async () => {
    try {
      const options = {
        abortController,
        cwd,
        pathToClaudeCodeExecutable: CLI_JS_PATH,
        systemPrompt: config.systemPrompt,
        tools: config.tools,
        allowedTools: config.tools,
        mcpServers,
        model: config.model,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
        persistSession: true,
      };

      if (resumeSessionId) {
        options.resume = resumeSessionId;
      }

      const q = query({ prompt, options });

      for await (const msg of q) {
        if (msg.type === "system" && msg.subtype === "init") {
          if (msg.session_id) {
            sessionStore.set(taskId, msg.session_id);
          }
        } else if (msg.type === "assistant") {
          if (msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text) {
                if (callbacks.onStdout) callbacks.onStdout(block.text + "\n");
              }
            }
          }
          if (msg.session_id && !sessionStore.has(taskId)) {
            sessionStore.set(taskId, msg.session_id);
          }
        } else if (msg.type === "result") {
          if (msg.subtype === "error" && !resultReceived) {
            if (callbacks.onStderr) {
              callbacks.onStderr(`Agent error: ${msg.error}\n`);
            }
          }
        }
      }

      if (!resultReceived) {
        if (callbacks.onExit) callbacks.onExit(0);
      }
    } catch (err) {
      const isAbort = err.name === "AbortError" || (err.message && err.message.includes("aborted"));
      if (isAbort) {
        if (!resultReceived) {
          console.log(`Agent ${role} for task ${taskId} was aborted before producing a result`);
        }
      } else {
        console.error(`Agent ${role} for task ${taskId} failed:`, err);
        if (!resultReceived && callbacks.onStderr) {
          callbacks.onStderr(`Agent error: ${err.message}\n`);
        }
      }
      if (!resultReceived) {
        if (callbacks.onExit) callbacks.onExit(1);
      }
    }
  };

  run();

  return {
    pid: fakePid,
    kill: () => abortController.abort(),
    gotResult: () => resultReceived,
    markResultReceived: () => { resultReceived = true; },
  };
}

/**
 * Spawn a sub-agent and wait for its result.
 * Used by parent agents (like developer) to delegate work to child agents (like file-developer).
 *
 * @param {string} role - The agent role to spawn (e.g., "file-developer")
 * @param {string} parentTaskId - The parent task ID (used to generate unique sub-task ID)
 * @param {object} handoff - The handoff object for the sub-agent
 * @returns {Promise<object>} - Resolves with the sub-agent's result
 */
export function spawnSubAgent(role, parentTaskId, handoff) {
  return new Promise((resolve, reject) => {
    // Generate unique sub-task ID based on parent task and file path
    const subTaskId = `${parentTaskId}-sub-${Date.now()}`;

    let result = null;
    let stderr = "";

    const agent = runAgent(role, subTaskId, handoff, {
      onStdout: (data) => {
        // Try to parse result from stdout
        try {
          const parsed = JSON.parse(data.trim());
          if (parsed.status === "complete" || parsed.status === "failed") {
            result = parsed;
          }
        } catch {
          // Not JSON, ignore
        }
      },
      onStderr: (data) => {
        stderr += data;
      },
      onExit: (code) => {
        if (result) {
          resolve(result);
        } else if (code === 0) {
          resolve({ status: "complete", message: "Sub-agent completed" });
        } else {
          reject(new Error(`Sub-agent exited with code ${code}: ${stderr}`));
        }
      },
    });

    // Store a reference so we can potentially kill it later
    if (!agent.pid) {
      reject(new Error(`Failed to spawn sub-agent for role: ${role}`));
    }
  });
}
