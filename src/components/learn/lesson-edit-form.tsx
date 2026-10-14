import { leaves, type LLevel } from "@/lib/learn/format";
import { saveLessonEditAction } from "@/app/teacher/learn/actions";
import type { TFn } from "@/i18n";

const SECTION: Record<string, string> = { slides: "Slides", proof: "Prove it from the text", example: "Worked example", together: "Try together", evidence: "Point to the proof", checks: "Checks", again: "Another way (again)" };
const field = "mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

/** "checks.1.options.2" → "Check 2 · option 3" (teacher side only). */
function label(path: string): string {
  const p = path.split(".");
  const out: string[] = [];
  for (let i = 0; i < p.length; i++) {
    const k = p[i], n = Number(k);
    if (Number.isInteger(n) && String(n) === k) { const prev = p[i - 1]; out.push(`${prev === "slides" ? "Slide" : prev === "checks" ? "Check" : prev === "sentences" ? "Sentence" : prev === "options" ? "Option" : prev === "proof" ? "Proof sentence #" : "#"} ${prev === "proof" ? n : n + 1}`); continue; }
    if (["slides", "checks", "sentences", "options"].includes(k) && i < p.length - 1) continue;
    out.push(k === "t" ? "text" : k);
  }
  return out.join(" · ");
}

/**
 * ✏️ Edit any text of one level (slides, example, passages, stems, options, answer, hints, checks, again). The file is
 * never changed: the teacher's version reaches their classes at once and goes to the admin as a proposal.
 * A plain form (server action) — no client JavaScript needed.
 */
export function LessonEditForm({ code, level, content, t }: { code: string; level: string; content: LLevel; t: TFn }) {
  const all = leaves(content).filter(([p]) => !p.endsWith(".picture"));
  const groups = Object.keys(SECTION).map((s) => ({ s, rows: all.filter(([p]) => p === s || p.startsWith(`${s}.`)) })).filter((g) => g.rows.length);
  return (
    <form action={saveLessonEditAction} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="level" value={level} />
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">{t("Change any text and press Save. Your classes see your version at once; the admin decides if it becomes the school's version. The original file is never changed.")}</p>
      {groups.map((g) => (
        <fieldset key={g.s} className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
          <legend className="px-1 font-display text-lg text-ink">{t(SECTION[g.s])}</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {g.rows.map(([path, value]) => {
              const name = `f:${path}`;
              const long = typeof value === "string" && (value.length > 90 || value.includes("\n"));
              return (
                <label key={path} className={`text-xs font-semibold text-muted ${long ? "md:col-span-2" : ""}`} dir="ltr">
                  {label(path)}
                  {typeof value === "number" ? <input type="number" name={name} defaultValue={value} min={0} max={20} className={`${field} max-w-[8rem]`} />
                    : path.endsWith(".role") ? <select name={name} defaultValue={value} className={`${field} max-w-[10rem]`}>{["main", "detail", "key", "other"].map((r) => <option key={r}>{r}</option>)}</select>
                    : long ? <textarea name={name} defaultValue={value} rows={Math.min(10, Math.max(3, Math.ceil(value.length / 90) + value.split("\n").length))} className={`${field} font-normal text-ink`} lang="en" />
                    : <input name={name} defaultValue={value} className={`${field} font-normal text-ink`} lang="en" />}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-3 flex flex-wrap gap-2 rounded-2xl bg-surface p-3 shadow-pop ring-1 ring-line">
        <button className="min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white">✓ {t("Save changes")}</button>
        <a href={`/teacher/learn/${code}?level=${level}`} className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-ink ring-1 ring-line">{t("Cancel")}</a>
      </div>
    </form>
  );
}
