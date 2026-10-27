/** A one-line, user-facing description of anything that was thrown. */
export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
