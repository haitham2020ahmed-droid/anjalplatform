import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { interventionBoard, type Flag } from "@/server/teacher/intervention";
import { InsightActions } from "@/components/teacher/insight-actions";
import { assignReviewAction } from "../intervention/actions";

export const FLAG_META: Record<Flag, { icon: string; label: string; tone: string; what: string }> = {
  URGENT: { icon: "🔴", label: "Urgent support", tone: "bg-red-100 text-red-900 ring-red-200", what: "MAP 10th percentile or below" },
  RETEST: { icon: "⚠️", label: "Retest", tone: "bg-orange-100 text-orange-900 ring-orange-200", what: "MAP rapid guessing 30%+: the score may be too low" },
  BEGINNER: { icon: "📖", label: "Beginning reader", tone: "bg-amber-100 text-amber-900 ring-amber-200", what: "MAP reading scale BR: a beginning reader" },
  GUESSING: { icon: "🎲", label: "Guessing here", tone: "bg-violet-100 text-violet-900 ring-violet-200", what: "30%+ rapid answers on the platform (30 days)" },
  NOT_TESTED: { icon: "📝", label: "Not tested", tone: "bg-sky-100 text-sky-900 ring-sky-200", what: "No MAP score in the latest term" },
  INACTIVE: { icon: "💤", label: "Inactive", tone: "bg-slate-100 text-slate-700 ring-slate-200", what: "No practice for 10 days" },
  REVIEW: { icon: "🔁", label: "Review due", tone: "bg-teal-50 text-teal-900 ring-teal-200", what: "Mastered 3+ weeks ago and not practised since" },
};

/**
 * 🚨 MAP and practice flags (the former "Who Needs Help" page, merged into Alerts): every student who needs attention
 * now — from MAP and from the platform itself — most urgent first, with the action buttons and "Assign review".
 */
export async function FlagsView({ actor, t, flag, classId }: { actor: Actor; t: TFn; flag: string | undefined; classId: string | undefined }) {
  const b = await interventionBoard(repo, actor);
  const on = (Object.keys(FLAG_META) as Flag[]).includes(flag as Flag) ? (flag as Flag) : null;
  const rows = b.rows.filter((r) => (!on || r.flags.some((f) => f.flag === on)) && (!classId || r.classId === classId));
  const href = (f: Flag | null) => `/teacher/alerts?${new URLSearchParams({ view: "flags", ...(f ? { flag: f } : {}), ...(classId ? { classId } : {}) })}`;
  return (
    <div className="mt-5">
      <p className="mb-3 text-sm text-slate-600">{t("Students who need attention now, from MAP and from practice, most urgent first.")}{b.term ? ` (MAP ${b.term})` : ""}</p>
      <nav aria-label={t("Filter")} className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {(Object.keys(FLAG_META) as Flag[]).map((f) => (
          <Link key={f} href={on === f ? href(null) : href(f)} aria-current={on === f ? "true" : undefined} title={t(FLAG_META[f].what)}
            className={`lift rounded-2xl p-3 ring-1 ${on === f ? "ring-2 ring-brand-navy" : ""} ${FLAG_META[f].tone}`}>
            <span className="block text-2xl font-extrabold">{FLAG_META[f].icon} {b.counts[f]}</span><span className="text-xs font-bold">{t(FLAG_META[f].label)}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="rounded-2xl bg-emerald-50 p-5 text-emerald-900 ring-1 ring-emerald-200">✅ {t("Nobody here right now.")}</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.studentId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="font-bold text-brand-navy"><Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="hover:underline"><bdi>{r.name}</bdi></Link> <span className="font-normal text-slate-500">· {r.className}</span></p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {r.flags.map((f, i) => <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${FLAG_META[f.flag].tone}`}>{FLAG_META[f.flag].icon} <span data-content lang="en">{f.detail}</span></span>)}
              {r.reviewSkills.length > 0 && (
                <form action={assignReviewAction}><input type="hidden" name="classId" value={r.classId} /><input type="hidden" name="studentId" value={r.studentId} />{r.reviewSkills.map((k) => <input key={k.id} type="hidden" name="skillId" value={k.id} />)}
                  <button className="rounded-full bg-brand-navy px-2.5 py-0.5 text-xs font-bold text-white hover:bg-brand-purple">⭐ {t("Assign review")}</button></form>
              )}
            </div>
            <InsightActions t={t} target={{ classId: r.classId, studentId: r.studentId, skillId: r.reviewSkills[0]?.id ?? null }} className="mt-3" />
          </li>
        ))}</ul>
      )}
    </div>
  );
}
