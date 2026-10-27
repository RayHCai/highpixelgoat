import { spawnSync } from "node:child_process";
import path from "node:path";
import { readJson } from "../shared/json";
import { PROJECT_ROOT } from "../shared/paths";

/**
 * How the project reaches Claude: through Claude Code on this machine, driven
 * as a library by the Agent SDK (src/agent/run.ts) for every take and every
 * chat edit.
 *
 *   HPG_CLAUDE_AUTH     "login" (default): Claude Code uses the account the
 *                       local `claude` is logged in to; ANTHROPIC_API_KEY and
 *                       ANTHROPIC_AUTH_TOKEN are kept from it, because Claude
 *                       Code would otherwise bill the key first.
 *                       "api-key": Claude Code gets the environment as it is,
 *                       so an ANTHROPIC_API_KEY there is used and billed.
 *   HPG_CLAUDE_PATH     the claude executable; default the one on PATH, else
 *                       the copy bundled with the Agent SDK
 *   HPG_MODEL           model id, default claude-opus-5-5
 *   HPG_OFFLINE=1       no Claude at all: the bundled example scripts stand in,
 *                       so the dashboard can be tried first
 */

export const DEFAULT_MODEL = process.env.HPG_MODEL ?? "claude-opus-5-5";

const VERSION = readJson<{ version: string }>(path.join(PROJECT_ROOT, "package.json"))?.version ?? "0.0.0";

export function offlineMode(): boolean {
  return process.env.HPG_OFFLINE === "1";
}

export type ClaudeAuth = "login" | "api-key";

export function claudeAuth(): ClaudeAuth {
  return process.env.HPG_CLAUDE_AUTH === "api-key" ? "api-key" : "login";
}

let executable: string | null | undefined;

/** The local Claude Code executable to run, or null to use the Agent SDK's bundled copy. */
export function claudeCodeExecutable(): string | null {
  if (executable !== undefined) return executable;
  if (process.env.HPG_CLAUDE_PATH) return (executable = process.env.HPG_CLAUDE_PATH);
  const found = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" });
  const first = found.status === 0 ? found.stdout.split(/\r?\n/).find((l) => l.trim()) : undefined;
  return (executable = first?.trim() ?? null);
}

/** The environment Claude Code runs with: everything we have, minus API credentials when it should use its login. */
export function claudeCodeEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: `highpixelgoat/${VERSION}`,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  };
  if (claudeAuth() === "login") {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  return env;
}

/** One line for the server log and the health check. */
export function describeClaude(): string {
  const exe = claudeCodeExecutable();
  return `${DEFAULT_MODEL} via Claude Code (${exe ? exe : "the Agent SDK's bundled copy"}), ${claudeAuth() === "login" ? "using its login" : "using ANTHROPIC_API_KEY"}`;
}
