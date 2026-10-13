import { repo } from "@/server/auth/next";
import { practiceWeek } from "@/server/student/streak";
import { getT } from "@/i18n/server";

/**
 * "This week": one dot per school day (Sunday → Thursday). Teal = practised, saffron ring = today, grey = not yet.
 * Streamed in its own Suspense on the student home (two bounded reads of this week's dates), so the home never waits.
 */
export async function WeekStrip({ studentId }: { studentId: string }) {
  const [{ t, lang }, w] = await Promise.all([getT(), practiceWeek(repo, studentId).catch(() => null)]);
  if (!w) return null;
  const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { weekday: "long", timeZone: "UTC" });
  const n = w.days.filter((d) => d.practised).length;
  return (
    <div data-testid="week-strip" className="inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 ring-1 ring-line">
      <span className="text-sm font-semibold text-ink">{t("This week")}</span>
      <span className="sr-only">{t("{n} of {total} days practised", { n, total: w.days.length })}</span>
      <ul aria-hidden="true" className="flex items-center gap-1.5">
        {w.days.map((d) => {
          const name = fmt.format(new Date(`${d.date}T12:00:00Z`));
          return (
            <li key={d.day} title={name}
              className={`h-4 w-4 rounded-full ${d.practised ? "bg-brand-teal" : d.today ? "bg-brand-gold" : "bg-slate-200"} ${d.today ? "ring-[3px] ring-brand-gold/35" : ""}`} />
          );
        })}
      </ul>
    </div>
  );
}
