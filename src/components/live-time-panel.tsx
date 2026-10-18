import type { TFn } from "@/i18n";
import { Combo } from "@/components/ui/combo";

const BTN = "inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold ring-1";
const INPUT = "min-h-10 rounded-lg bg-surface px-2 ring-1 ring-line";

/** "in 12 min" / "ended" from now (the server's render time; the students' timers count down by themselves). */
export function untilText(iso: string | null, t: TFn, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return t("Ended");
  if (ms >= 24 * 3_600_000) return null; // (a test open for days: no countdown)
  const m = Math.ceil(ms / 60_000);
  return m >= 120 ? t("Ends in {n} hours", { n: Math.round(m / 60) }) : t("Ends in {n} minutes", { n: m });
}

/**
 * ⏱ r69 LIVE TIME (shared by NAFS tests and MAP tests): while a timed test runs, the teacher extends or shortens the time
 * for the whole class (+5 / +10 / −5 or a new limit), ends it in N minutes or now, or gives ONE student more (or less)
 * time. Plain forms (no client code); the students' timers follow on their next poll (a few seconds). Every form posts
 * `op` = limit | shift | endin | endnow | noend with `minutes`, `shift` + `sign`, `in`, `studentId` and the `hidden` fields.
 */
export function LiveTimePanel({ t, action, hidden, minutes, endsAt, extra, roster, untimedAllowed = false, inProgress, id = "time" }: {
  t: TFn; action: (f: FormData) => Promise<void>; hidden: Record<string, string>;
  minutes: number | null; endsAt: string | null; extra: { id: string; name: string; minutes: number }[];
  roster: { id: string; name: string }[]; untimedAllowed?: boolean; inProgress?: number; id?: string;
}) {
  const H = () => <>{Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;
  const shift = (n: number) => (
    <form action={action}><H /><input type="hidden" name="op" value="shift" /><input type="hidden" name="shift" value={Math.abs(n)} /><input type="hidden" name="sign" value={n < 0 ? "-" : "+"} />
      <button disabled={minutes === null} className={`${BTN} ${n > 0 ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink ring-line"} disabled:opacity-40`}>{n > 0 ? `+${n}` : `−${Math.abs(n)}`} {t("min")}</button>
    </form>
  );
  const until = untilText(endsAt, t);
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-3 rounded-xl bg-sky-50/60 p-3 ring-1 ring-sky-200 print:hidden">
      <h3 id={`${id}-h`} className="text-sm font-semibold text-ink">⏱ {t("Time (live)")}</h3>
      <p className="mt-0.5 text-xs text-ink-2">
        {minutes === null ? t("Untimed") : t("{n} minutes from each student's start", { n: minutes })}
        {until ? ` · ${until}` : ""}{typeof inProgress === "number" ? ` · ${t("{n} taking it now", { n: inProgress })}` : ""}
      </p>
      <p className="text-xs text-muted">{t("Changes reach the students' timers within a few seconds, also during the test.")}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <span className="text-xs font-semibold text-ink-2">{t("Whole class")}:</span>
        {shift(5)}{shift(10)}{shift(-5)}
        <form action={action} className="flex items-end gap-1.5"><H /><input type="hidden" name="op" value="limit" />
          <label className="grid gap-0.5 text-xs font-semibold text-ink-2">{t("Time limit (minutes)")}<input type="number" name="minutes" min={1} max={240} required={!untimedAllowed} defaultValue={minutes ?? ""} placeholder={untimedAllowed ? t("Untimed") : ""} className={`${INPUT} w-24`} /></label>
          <button className={`${BTN} bg-surface text-ink ring-line`}>{t("Set")}</button>
        </form>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <form action={action} className="flex items-end gap-1.5"><H /><input type="hidden" name="op" value="endin" />
          <label className="grid gap-0.5 text-xs font-semibold text-ink-2">{t("End in (minutes)")}<input type="number" name="in" min={1} max={600} required className={`${INPUT} w-24`} /></label>
          <button className={`${BTN} bg-surface text-ink ring-line`}>{t("Set the end")}</button>
        </form>
        <form action={action}><H /><input type="hidden" name="op" value="endnow" /><button className={`${BTN} bg-surface text-rose-700 ring-rose-200`}>{t("End now")}</button></form>
        {!untimedAllowed && endsAt && <form action={action}><H /><input type="hidden" name="op" value="noend" /><button className={`${BTN} bg-surface text-ink-2 ring-line`}>{t("Remove the end time")}</button></form>}
      </div>
      {roster.length > 0 && (
        <form action={action} className="mt-2 flex flex-wrap items-end gap-2"><H /><input type="hidden" name="op" value="shift" />
          <div className="grid min-w-48 gap-0.5 text-xs font-semibold text-ink-2"><span>{t("One student")}</span><Combo name="studentId" required label={t("One student")} options={roster.map((x) => ({ value: x.id, label: x.name }))} /></div>
          <label className="grid gap-0.5 text-xs font-semibold text-ink-2">{t("More or less")}
            <select name="sign" className={INPUT} defaultValue="+"><option value="+">+ {t("More time")}</option><option value="-">− {t("Less time")}</option></select>
          </label>
          <label className="grid gap-0.5 text-xs font-semibold text-ink-2">{t("Minutes")}<input type="number" name="shift" min={1} max={180} required defaultValue={5} className={`${INPUT} w-20`} /></label>
          <button className={`${BTN} bg-brand-navy text-white ring-brand-navy`}>{t("Apply")}</button>
        </form>
      )}
      {extra.length > 0 && <p className="mt-2 text-xs text-ink-2">{t("Own time")}: {extra.map((x) => `${x.name} ${x.minutes > 0 ? "+" : "−"}${Math.abs(x.minutes)} ${t("min")}`).join(" · ")}</p>}
    </section>
  );
}
