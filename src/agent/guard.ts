import path from "node:path";

/**
 * What the scene agent may touch. Claude Code brings its own file tools
 * (Read, Write, Edit, Glob, Grep); guardToolCall keeps them inside the take
 * and keeps writes to src/, spec.json and take.json. The take server
 * (take-server.ts) adds this project's own tools.
 */

/** Name of the in-process MCP server; its tools reach the model as mcp__take__<name>. */
export const TAKE_SERVER = "take";
/** Claude Code's own tools the agent may use. No shell: building and checking go through the take server. */
export const FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"] as const;
export const TAKE_TOOL_NAMES = ["voice", "build", "snapshot"] as const;
export const TAKE_TOOLS = TAKE_TOOL_NAMES.map(takeTool);

function takeTool(name: (typeof TAKE_TOOL_NAMES)[number]): string {
  return `mcp__${TAKE_SERVER}__${name}`;
}

/** The path relative to the take, with forward slashes, or null when it is outside the take. */
function within(dir: string, p: string): string | null {
  const r = path.relative(dir, path.resolve(dir, p));
  if (r === ".." || r.startsWith(`..${path.sep}`) || path.isAbsolute(r)) return null;
  return r.replace(/\\/g, "/");
}

/**
 * True when a Glob pattern or a Grep file glob could match outside the take:
 * absolute, drive-lettered, home-relative, or with a ".." segment (also inside braces).
 */
function patternEscapes(pattern: unknown): boolean {
  if (typeof pattern !== "string") return false;
  if (path.isAbsolute(pattern) || /^[a-zA-Z]:/.test(pattern) || pattern.startsWith("~")) return true;
  return pattern.split(/[\\/{},]/).includes("..");
}

function isWritable(relative: string): boolean {
  return relative === "spec.json" || relative === "take.json" || relative.startsWith("src/");
}

/**
 * Why a tool call is refused, or null to let it run. Reads and searches stay
 * inside the take, paths and file patterns alike; writes go only to src/,
 * spec.json and take.json; anything else Claude Code offers is off.
 */
export function guardToolCall(dir: string, name: string, input: Record<string, unknown>): string | null {
  if (TAKE_TOOLS.includes(name)) return null;
  const target =
    typeof input.file_path === "string" ? input.file_path : typeof input.path === "string" ? input.path : ".";
  const r = within(dir, target);
  switch (name) {
    case "Read":
      return r === null ? `${target} is outside the take folder` : null;
    case "Glob":
    case "Grep": {
      if (r === null) return `${target} is outside the take folder`;
      // Grep's own pattern is a regex; its file filter is `glob`.
      const filter = name === "Glob" ? input.pattern : input.glob;
      return patternEscapes(filter) ? `${String(filter)} reaches outside the take folder` : null;
    }
    case "Write":
    case "Edit":
      if (r === null) return `${target} is outside the take folder`;
      return isWritable(r) ? null : `${r} is read-only: write src/, spec.json or take.json`;
    default:
      return `${name} is not available here: use ${FILE_TOOLS.join(", ")} and the take tools (${TAKE_TOOL_NAMES.join(", ")})`;
  }
}

/** True for the tool calls that change the take folder. */
export function isWriteCall(name: string): boolean {
  return name === "Write" || name === "Edit";
}

/** A short dashboard line for a tool call. */
export function describeCall(name: string, input: Record<string, unknown>): string {
  const p = input.file_path ?? input.path;
  const where = typeof p === "string" ? path.basename(path.dirname(p)) + "/" + path.basename(p) : "";
  switch (name) {
    case "Read":
    case "Glob":
    case "Grep":
      return where && typeof input.file_path === "string" ? `Reading ${where}` : "Reading the code";
    case "Write":
      return `Writing ${where}`;
    case "Edit":
      return `Editing ${where}`;
    case takeTool("voice"):
      return "Recording the narration";
    case takeTool("build"):
      return "Building the scene";
    case takeTool("snapshot"):
      return "Looking at frames";
    default:
      return "Working";
  }
}
