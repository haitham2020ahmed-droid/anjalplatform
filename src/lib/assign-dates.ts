/**
 * 📅 START + END dates of anything a teacher assigns (owner r68 §D): every assign window has a "Start date" (students see
 * the work from that day; empty = at once) and an "End (due) date". Pure and client-safe; the server actions parse with
 * it so every dialog behaves the same.
 *   - "yyyy-mm-dd" (a date input) → a Date at the START of that school day for the start (00:00 Riyadh, UTC+3) and at its
 *     END for the due date (23:59 Riyadh), so "due Thursday" means all of Thursday;
 *   - an end before the start is refused with one plain sentence.
 */
const RIYADH_MS = 3 * 3_600_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const DATE_ORDER_ERROR = "The end (due) date must be on or after the start date.";

/** "2026-10-14" → 2026-10-14 00:00 in Riyadh (as a UTC Date); null for empty or not a date. */
export function startOfDay(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (DAY.test(s)) { const t = Date.parse(`${s}T00:00:00Z`); return Number.isFinite(t) ? new Date(t - RIYADH_MS) : null; }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}
/** "2026-10-14" → 2026-10-14 23:59:59 in Riyadh; a full date-time is kept as it is. */
export function endOfDay(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (DAY.test(s)) { const t = Date.parse(`${s}T23:59:59Z`); return Number.isFinite(t) ? new Date(t - RIYADH_MS) : null; }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Both dates, checked: { startAt, dueAt } or { error }. */
export function assignDates(start: unknown, due: unknown): { startAt: Date | null; dueAt: Date | null; error: string | null } {
  const startAt = startOfDay(start), dueAt = endOfDay(due);
  if (startAt && dueAt && dueAt.getTime() < startAt.getTime()) return { startAt, dueAt, error: DATE_ORDER_ERROR };
  return { startAt, dueAt, error: null };
}

/** From a form (fields "startAt" and "dueAt", the shared names of every assign window). */
export function assignDatesOf(f: { get(name: string): unknown }): { startAt: Date | null; dueAt: Date | null; error: string | null } {
  return assignDates(f.get("startAt"), f.get("dueAt"));
}

/** Is the work open for students now (no start, or the start has come)? */
export const startedBy = (startAt: unknown, now: Date | number = Date.now()): boolean => {
  if (startAt === null || startAt === undefined || startAt === "") return true;
  const t = startAt instanceof Date ? startAt.getTime() : Date.parse(String(startAt));
  return !Number.isFinite(t) || t <= (typeof now === "number" ? now : now.getTime());
};
