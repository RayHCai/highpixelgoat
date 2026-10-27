import { spawn } from "node:child_process";

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run a command to completion and collect its output. Rejects only when the
 * command cannot be started; a non-zero exit is the caller's to judge.
 */
export function runProcess(command: string, args: string[], o: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: o.cwd, env: o.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => reject(new Error(`${command} failed to start (is it on PATH?): ${err.message}`)));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Run a command that must succeed. Resolves with its stdout; rejects with the tail of its stderr. */
export async function runChecked(command: string, args: string[], o: ProcessOptions = {}): Promise<string> {
  const { code, stdout, stderr } = await runProcess(command, args, o);
  if (code !== 0) throw new Error(`${command} exited with code ${code}: ${stderr.trim().slice(-400)}`);
  return stdout;
}
