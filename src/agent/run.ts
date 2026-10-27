import { query, type HookCallback, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { claudeCodeEnv, claudeCodeExecutable, DEFAULT_MODEL } from "./config";
import { describeCall, FILE_TOOLS, guardToolCall, isWriteCall, TAKE_SERVER, TAKE_TOOLS } from "./guard";
import type { TakeSession } from "./session";
import { takeServer } from "./take-server";
import { verifyTake } from "./verify";

/**
 * The scene agent is a local Claude Code session working in the take folder:
 * its own file tools (kept inside the take by guardToolCall) plus the take
 * server's voice, build and snapshot. When Claude finishes, the take must pass
 * verifyTake; a take that fails goes back to the same session with the
 * problems, a couple of times at most. The session id is returned so chat
 * edits can resume the conversation the take was made in.
 */

/** Turns per query before Claude Code stops the session. */
const MAX_TURNS = 120;
/** Rounds of fixing after a failed final check. */
const REPAIR_ROUNDS = 2;

export interface AgentRun {
  reply: string;
  sessionId: string;
}

/** Run one prompt to completion in a (new or resumed) session. */
async function runQuery(
  session: TakeSession,
  system: string,
  prompt: string,
  resume: string | null,
): Promise<AgentRun> {
  const guard: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const args = (input.tool_input ?? {}) as Record<string, unknown>;
    const refusal = guardToolCall(session.dir, input.tool_name, args);
    if (refusal) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: refusal,
        },
      };
    }
    if (isWriteCall(input.tool_name)) session.changed = true;
    session.activity(describeCall(input.tool_name, args));
    return {};
  };

  const executable = claudeCodeExecutable();
  const options: Options = {
    cwd: session.dir,
    model: DEFAULT_MODEL,
    effort: "high",
    maxTurns: MAX_TURNS,
    systemPrompt: { type: "preset", preset: "claude_code", append: system },
    // Claude Code's own file tools plus the take server; no shell, no web, no subagents.
    tools: [...FILE_TOOLS],
    allowedTools: [...FILE_TOOLS, ...TAKE_TOOLS],
    mcpServers: { [TAKE_SERVER]: takeServer(session) },
    // Every call goes through the guard; nothing ever waits for a person to approve it.
    permissionMode: "dontAsk",
    hooks: { PreToolUse: [{ hooks: [guard] }] },
    // The take's own CLAUDE.md is read on purpose; the user's settings, hooks, memory and plugins stay out.
    settingSources: [],
    env: claudeCodeEnv(),
    ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
    ...(resume ? { resume } : {}),
  };

  let sessionId = resume ?? "";
  let final: Extract<SDKMessage, { type: "result" }> | null = null;
  try {
    for await (const message of query({ prompt, options })) {
      if ("session_id" in message && message.session_id) sessionId = message.session_id;
      if (message.type === "system" && message.subtype === "init") {
        console.log(
          `[agent ${session.ctx.projectId}] Claude Code ${message.claude_code_version}, ${message.model}, credentials: ${message.apiKeySource}`,
        );
      }
      if (message.type === "assistant" && message.error) {
        throw new Error(
          `Claude Code could not reach the model (${message.error}). Check that \`claude\` is logged in, or set HPG_CLAUDE_AUTH=api-key.`,
        );
      }
      if (message.type === "result") final = message;
    }
  } catch (err) {
    // query() throws after yielding an error result; that result says more than the throw.
    if (!final) throw err;
  }
  if (!final) throw new Error("Claude Code ended without a result");
  console.log(
    `[agent ${session.ctx.projectId}] ${final.subtype}, ${final.num_turns} turns, ~$${final.total_cost_usd.toFixed(2)}`,
  );
  if (final.subtype !== "success") {
    const why = final.subtype === "error_max_turns" ? "ran out of turns" : final.errors.join("; ") || final.subtype;
    throw new Error(`Claude Code stopped before finishing: ${why}`);
  }
  if (final.is_error) throw new Error(final.result || "Claude Code reported an error");
  return { reply: final.result.trim(), sessionId };
}

/**
 * Run Claude Code over the take until it is done and the take passes its
 * checks. Pass a session id to continue an earlier conversation about this
 * take. With verify "when-changed" (chat), a turn that only answered a
 * question leaves the take as it was and skips the checks.
 */
export async function runSceneAgent(
  session: TakeSession,
  system: string,
  prompt: string,
  o: { verify: "always" | "when-changed"; resume?: string | null },
): Promise<AgentRun> {
  try {
    session.activity("Planning");
    let run = await runQuery(session, system, prompt, o.resume ?? null);
    for (let round = 0; ; round++) {
      if (o.verify === "when-changed" && !session.changed) return run;
      session.activity("Checking the take");
      const problems = await verifyTake(session);
      if (problems.length === 0) return run;
      if (round >= REPAIR_ROUNDS) throw new Error(`the take did not pass its final check:\n${problems.join("\n")}`);
      session.activity("Fixing what the check found");
      const fix = `The final check of the take failed. Fix these problems, check with build and snapshot, then reply again.\n${problems.join("\n")}`;
      run = await runQuery(session, system, fix, run.sessionId);
    }
  } finally {
    await session.close();
  }
}
