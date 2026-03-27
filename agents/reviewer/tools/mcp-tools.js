import { z } from "zod/v4";
import { execSync } from "child_process";

export const tools = [
  {
    name: "check_style",
    description:
      "Scan files for code style issues: TODO/FIXME/HACK comments and hardcoded secret patterns (password=, secret=, api_key=). Returns structured findings.",
    inputSchema: {
      path: z.string().describe("Absolute path to the directory or file to scan"),
    },
    handler: async ({ path }) => {
      const findings = [];

      try {
        const todos = execSync(
          `grep -rn "TODO\\|FIXME\\|HACK" "${path}" 2>/dev/null || true`,
          { encoding: "utf-8", maxBuffer: 1024 * 1024 }
        ).trim();
        if (todos) {
          findings.push({ severity: "warning", category: "TODO/FIXME/HACK comments", matches: todos.split("\n") });
        }
      } catch {}

      try {
        const secrets = execSync(
          `grep -rn "password\\s*=\\|secret\\s*=\\|api_key\\s*=" "${path}" 2>/dev/null || true`,
          { encoding: "utf-8", maxBuffer: 1024 * 1024 }
        ).trim();
        if (secrets) {
          findings.push({ severity: "critical", category: "Possible hardcoded secrets", matches: secrets.split("\n") });
        }
      } catch {}

      const summary = findings.length === 0
        ? "No style issues found."
        : `Found ${findings.length} issue category(s).`;

      return {
        content: [{ type: "text", text: JSON.stringify({ summary, findings }, null, 2) }],
      };
    },
  },
  {
    name: "security_scan",
    description:
      "Scan files for security anti-patterns: eval usage in shell scripts, curl/wget piped to shell, overly permissive chmod (777, a+w). Returns structured findings.",
    inputSchema: {
      path: z.string().describe("Absolute path to the directory or file to scan"),
    },
    handler: async ({ path }) => {
      const findings = [];

      try {
        const evalUsage = execSync(
          `grep -rn "eval " "${path}" --include="*.sh" 2>/dev/null || true`,
          { encoding: "utf-8", maxBuffer: 1024 * 1024 }
        ).trim();
        if (evalUsage) {
          findings.push({ severity: "warning", category: "eval usage", matches: evalUsage.split("\n") });
        }
      } catch {}

      try {
        const curlPipe = execSync(
          `grep -rn "curl.*|.*sh\\|wget.*|.*sh" "${path}" 2>/dev/null || true`,
          { encoding: "utf-8", maxBuffer: 1024 * 1024 }
        ).trim();
        if (curlPipe) {
          findings.push({ severity: "critical", category: "curl/wget piped to shell", matches: curlPipe.split("\n") });
        }
      } catch {}

      try {
        const chmod = execSync(
          `grep -rn "chmod 777\\|chmod a+w" "${path}" 2>/dev/null || true`,
          { encoding: "utf-8", maxBuffer: 1024 * 1024 }
        ).trim();
        if (chmod) {
          findings.push({ severity: "warning", category: "Overly permissive file permissions", matches: chmod.split("\n") });
        }
      } catch {}

      const summary = findings.length === 0
        ? "No security issues found."
        : `Found ${findings.length} issue category(s).`;

      return {
        content: [{ type: "text", text: JSON.stringify({ summary, findings }, null, 2) }],
      };
    },
  },
];
