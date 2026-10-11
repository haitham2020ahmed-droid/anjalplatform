import Link from "next/link";
import type { ReadRiseSummary } from "@/server/readrise/engine";
import { ReadRiseIcon } from "./readrise-icon";
import { LevelBadge } from "./widgets";

/**
 * 🚀 A compact ReadRise card (student home, teacher/parent student pages): level, growth, goal, first-try average.
 * Pass `summary` from studentReadRiseSummary(repo, studentId); null = the student has not opened ReadRise yet.
 */
export function ReadRiseStudentCard({ summary, href = "/student/readrise", name }: { summary: ReadRiseSummary | null; href?: string | null; name?: string }) {
  const body = (
    <div className="flex flex-wrap items-center gap-4">
      <ReadRiseIcon size={44} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-navy">ReadRise{name ? ` · ${name}` : ""}</p>
        {summary ? (
          <p className="text-sm text-slate-600">
            {summary.articlesDone} article{summary.articlesDone === 1 ? "" : "s"} · first try {summary.firstTryAvg === null ? "—" : `${summary.firstTryAvg}%`} · this week {summary.thisWeek}/{summary.weeklyGoal}
            {summary.streak > 0 ? ` · 🔥 ${summary.streak}-week streak` : ""}
          </p>
        ) : <p className="text-sm text-slate-600">{href && !name ? "Read real-world articles at your level and watch your level rise." : "Not started yet."}</p>}
      </div>
      {!summary && href && !name && <span className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white" aria-hidden="true">Start ▶</span>}
      {summary && (
        <div className="text-right">
          <LevelBadge level={summary.level} size="sm" />
          <p className={`mt-1 text-xs font-semibold ${summary.growth > 0 ? "text-emerald-700" : summary.growth < 0 ? "text-rose-700" : "text-slate-500"}`}>
            {summary.growth > 0 ? "▲ +" : summary.growth < 0 ? "▼ " : ""}{summary.growth} since start
          </p>
        </div>
      )}
    </div>
  );
  const cls = "block rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  return href ? <Link href={href} className={`${cls} lift hover:ring-brand-teal`}>{body}</Link> : <div className={cls}>{body}</div>;
}
