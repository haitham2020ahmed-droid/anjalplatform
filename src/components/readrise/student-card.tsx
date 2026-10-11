import Link from "next/link";
import type { ReadRiseSummary } from "@/server/readrise/engine";
import { ReadRiseIcon } from "./readrise-icon";

/**
 * 🚀 A compact ReadRise card (student home, teacher/parent student pages): ReadRise Level, growth, goal, first-try
 * average. Pass `summary` from studentReadRiseSummary(repo, studentId); null = the student has not opened ReadRise yet.
 * Before any placement or reading there is no level to show yet: the card points to the short placement check.
 * The level is always called "ReadRise Level" (never a Lexile).
 */
export function ReadRiseStudentCard({ summary, href = "/student/readrise", name }: { summary: ReadRiseSummary | null; href?: string | null; name?: string }) {
  const own = Boolean(href) && !name;   // the student's own card (not a teacher's or parent's view)
  const started = Boolean(summary && (summary.placed || summary.runs > 0 || summary.articlesDone > 0));
  const read = Boolean(summary && (summary.runs > 0 || summary.articlesDone > 0));
  const start = own && !started;
  const target = start ? "/student/readrise/placement" : href;
  const body = (
    <div className="flex flex-wrap items-center gap-4">
      <ReadRiseIcon size={44} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-navy">ReadRise{name ? ` · ${name}` : ""}</p>
        {!started ? (
          <p className="text-sm text-slate-600">{own ? <><b className="text-brand-navy">Start here:</b> a short placement check finds your ReadRise Level.</> : "Not started yet: no placement check or reading so far."}</p>
        ) : !read ? (
          <p className="text-sm text-slate-600">ReadRise Level <b className="text-brand-navy">{summary!.level}</b> · {own ? `read your first article — goal ${summary!.weeklyGoal} this week` : "no articles read yet"}</p>
        ) : (
          <p className="text-sm text-slate-600">
            ReadRise Level <b className="text-brand-navy">{summary!.level}</b> · {summary!.articlesDone} article{summary!.articlesDone === 1 ? "" : "s"}
            {summary!.firstTryAvg !== null ? ` · first try ${summary!.firstTryAvg}%` : ""} · this week {summary!.thisWeek}/{summary!.weeklyGoal}
            {summary!.streak > 0 ? ` · 🔥 ${summary!.streak}-week streak` : ""}
          </p>
        )}
      </div>
      {start && <span className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white" aria-hidden="true">Start placement ▶</span>}
      {read && summary!.growth !== 0 && (
        <p className={`text-right text-xs font-semibold ${summary!.growth > 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {summary!.growth > 0 ? "▲ +" : "▼ "}{summary!.growth}<span className="block font-normal text-slate-500">since your start</span>
        </p>
      )}
    </div>
  );
  const cls = "block rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  return target ? <Link href={target} className={`${cls} lift hover:ring-brand-teal`}>{body}</Link> : <div className={cls}>{body}</div>;
}
