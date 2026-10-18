type T = (text: string, vars?: Record<string, string | number>) => string;
const same: T = (text) => text;

/**
 * 📅 The two dates of every assign window (owner r68 §D): "Start date" (students see it from that day; empty = now) and
 * "End (due) date". Plain inputs named startAt / dueAt (the server parses them with src/lib/assign-dates.ts). No hooks:
 * usable in server forms and client dialogs (controlled when `onStart` / `onDue` are given).
 */
export function AssignDates({ t = same, start, due, onStart, onDue, className = "", field = "h-10 rounded-lg border border-slate-300 px-2 font-normal", disabled }: {
  t?: T; start?: string; due?: string; onStart?: (v: string) => void; onDue?: (v: string) => void; className?: string; field?: string; disabled?: boolean;
}) {
  const ctl = (v: string | undefined, on?: (v: string) => void) => (on ? { value: v ?? "", onChange: (e: { target: { value: string } }) => on(e.target.value) } : { defaultValue: v ?? "" });
  return (
    <div data-testid="assign-dates" className={`flex flex-wrap items-end gap-3 text-sm ${className}`}>
      <label className="flex flex-col font-semibold text-slate-700">{t("Start date")}
        <input type="date" name="startAt" {...ctl(start, onStart)} className={field} disabled={disabled} dir="ltr" /></label>
      <label className="flex flex-col font-semibold text-slate-700">{t("End (due) date")}
        <input type="date" name="dueAt" {...ctl(due, onDue)} min={start || undefined} className={field} disabled={disabled} dir="ltr" /></label>
      <span className="pb-2 text-xs text-slate-500">{t("Students see it from the start date.")}</span>
    </div>
  );
}
