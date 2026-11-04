"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 🚨 Needs attention — the compact one-line list (name · grade · reason · small button), shared between the
 * teacher Home page's embedded section and the dedicated /teacher/reports/needs-attention page (r94 follow-up:
 * both used to exist only on Home, so every cross-page link to it landed teachers on the home page instead of a
 * real report — see report-catalog.ts's "needs-attention" ReportDef). Extracted so the two never drift apart.
 */
import Link from "next/link";
import { useT } from "@/i18n/client";
import { StarGlyph } from "../skills/skill-star";
import type { AttentionStudent } from "@/server/teacher/needs-attention";

/** Rows shown before "Show all (N)". */
const FIRST_ROWS = 5;

export function NeedsAttentionList({ list, gradeOf }: { list: AttentionStudent[]; gradeOf: Map<string, number> }) {
  const t = useT();
  const small = "inline-flex h-7 shrink-0 items-center rounded-md bg-white px-2.5 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  if (list.length === 0) return <p className="px-3 py-2 text-sm text-slate-600">{t("Everyone is on track.")}</p>;
  return (
    <div className="group/na">
      {/* compact one-line rows (name · grade · reason · small button): the first 5; "Show all" opens the rest in a
         box the teacher scrolls (mouse, touch or keyboard: the box takes focus) */}
      <div role="region" aria-label={t("Needs attention")} tabIndex={0} className="max-h-[15rem] overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
        <ul className="divide-y divide-slate-100">
          {list.map((r, ix) => (
            <li key={r.studentId} className={`${ix >= FIRST_ROWS ? "hidden group-has-[:checked]/na:flex" : "flex"} items-center justify-between gap-2 px-3 py-1 text-[13px] leading-5`}>
              <p className="min-w-0 flex-1 truncate">
                <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link>
                <span className="ms-1.5 text-xs text-slate-500">{gradeOf.has(r.classId) ? t("Grade {n}", { n: gradeOf.get(r.classId)! }) : <bdi>{r.className}</bdi>}</span>
                <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                {r.stars && r.stars.length > 0 && <span data-testid="na-star" className="me-1.5 inline-flex items-center gap-1 text-slate-700"><StarGlyph status={r.stars[0].kind === "REVIEW" ? "NEEDS_REVIEW" : "IN_PROGRESS"} size={14} />{r.stars[0].kind === "REVIEW" ? t("Needs review: {skill}", { skill: r.stars[0].skill }) : r.stars[0].kind === "NO_MASTERY" ? t("50 questions without mastery: {skill}", { skill: r.stars[0].skill }) : t("No progress for {n} days: {skill}", { n: r.stars[0].days, skill: r.stars[0].skill })}{r.stars.length > 1 && <span className="ms-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t("+{n} more", { n: r.stars.length - 1 })}</span>}</span>}
                {r.stuck.length > 0 && <span className="text-slate-600" title={r.stuck.map((x) => `${x.skill} (${x.questions}, ${x.score}%)`).join(" · ")}>{t("Stuck on")}: {r.stuck[0].skill} <span className="text-slate-600">({r.stuck[0].score}%)</span>{r.stuck.length > 1 && <Link prefetch={false} href={`/teacher/students/${r.studentId}#skills`} className="ms-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600 hover:underline">{t("+{n} more", { n: r.stuck.length - 1 })}</Link>}</span>}
                {r.stuck.length === 0 && !r.stars?.length && <span className="text-slate-600">{r.neverPractised ? t("Has not practised yet") : t("No practice for {n} days", { n: r.idleDays ?? 0 })}</span>}
              </p>
              {r.stars?.[0]?.kind === "NO_MASTERY"
                ? <Link prefetch={false} href={`/teacher/rti-plan?classId=${r.classId}&who=student&sid=${r.studentId}`} className={small}>{t("Support plan")}</Link>
                : r.stars?.length && r.stars[0].skillId
                ? <Link prefetch={false} href={`/teacher/plans?${new URLSearchParams([["tab", "custom"], ["classId", r.classId], ["who", "student"], ["sid", r.studentId], ...r.stars.filter((x) => x.skillId).map((x) => ["add", x.skillId!] as [string, string])])}`} className={small}>{t("Create Plan")}</Link>
                : r.stuck.length > 0
                ? <Link prefetch={false} href={`/teacher/plans?${new URLSearchParams([["tab", "custom"], ["classId", r.classId], ["who", "student"], ["sid", r.studentId], ...r.stuck.map((x) => ["add", x.skillId] as [string, string])])}`} className={small}>{t("Create Plan")}</Link>
                : <Link prefetch={false} href={`/teacher/students/${r.studentId}${r.neverPractised ? "#start" : ""}`} className={small}>{t("Open")}</Link>}
            </li>
          ))}
        </ul>
      </div>
      {list.length > FIRST_ROWS && <p className="border-t border-slate-100 px-3 py-1.5"><label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-teal has-[:focus-visible]:underline"><input type="checkbox" className="peer sr-only" data-na-toggle /> <span className="group-has-[:checked]/na:hidden">{t("Show all ({n})", { n: list.length })}</span><span className="hidden group-has-[:checked]/na:inline">{t("Show fewer")}</span></label></p>}
    </div>
  );
}
