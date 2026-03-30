import { existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";
import { homedir } from "os";
import { getProjects } from "./db.js";

const SERVER_PROJECTS_DIR = join(homedir(), "projects");

/**
 * Ensure the project path exists on this machine.
 * If it doesn't (e.g. a Mac path on a Linux server), clone the repo
 * to ~/projects/<repo-name> using the project's githubUrl setting.
 *
 * @param {string} projectPath - Original project path (may be from another machine)
 * @param {(msg: string) => void} [log] - Optional logger
 * @returns {Promise<string>} Resolved path that exists on this server
 */
export async function resolveServerPath(projectPath, log = console.log) {
  if (existsSync(projectPath)) return projectPath;

  log(`[resolve-path] Path ${projectPath} not found on server, resolving...`);

  try {
    const projects = await getProjects();
    const project = projects.find((p) => p.path === projectPath);
    const githubUrl = project?.settings?.githubUrl;

    if (!githubUrl) {
      log(`[resolve-path] No githubUrl configured — trying fallback by directory name`);
      const fallback = join(SERVER_PROJECTS_DIR, basename(projectPath));
      if (existsSync(fallback)) {
        log(`[resolve-path] Using fallback path: ${fallback}`);
        return fallback;
      }
      throw new Error(`No githubUrl and fallback ${fallback} does not exist`);
    }

    const match = githubUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!match) throw new Error(`Cannot parse githubUrl: ${githubUrl}`);
    const repoName = match[2];
    const clonePath = join(SERVER_PROJECTS_DIR, repoName);

    if (existsSync(clonePath)) {
      log(`[resolve-path] Using existing clone at ${clonePath}`);
      return clonePath;
    }

    log(`[resolve-path] Cloning ${githubUrl} to ${clonePath}...`);
    mkdirSync(SERVER_PROJECTS_DIR, { recursive: true });
    const cloneUrl = `https://github.com/${match[1]}/${match[2]}.git`;
    execSync(`git clone ${cloneUrl} "${clonePath}"`, { encoding: "utf-8", timeout: 120000 });
    log(`[resolve-path] Clone complete: ${clonePath}`);
    return clonePath;
  } catch (err) {
    log(`[resolve-path] Failed to resolve: ${err.message}`);
    return projectPath;
  }
}
