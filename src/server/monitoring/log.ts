/**
 * Structured logging (Phase 13): one JSON object per line on stdout/stderr, so Docker,
 * journald or any log collector can filter by level, event and fields. Never log
 * passwords, tokens, report contents or student answers: pass ids and counts only.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = /pass(word)?|token|secret|cookie|authorization|hash/i;

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : v instanceof Error ? { name: v.name, message: v.message } : v]));
}

export function logLine(level: Level, event: string, fields: Record<string, unknown> = {}, now = new Date()): string {
  return JSON.stringify({ time: now.toISOString(), level, event, ...redact(fields) });
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const min = (process.env.LOG_LEVEL as Level) || "info";
  if (ORDER[level] < (ORDER[min] ?? 20)) return;
  const line = logLine(level, event, fields);
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}
