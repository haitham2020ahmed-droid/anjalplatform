"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { EmptyState } from "@/components/ui-kit";
import { AssignDialog } from "@/app/teacher/assign-dialog";
import type { HelpStudent } from "@/server/teacher/repeated-mistakes";

/** 🧡 the small orange badge next to a student: "Needs help: 2 skills" */
export function NeedsHelpBadge({ n, className = "" }: { n: number; className?: string }) {
  const t = useT();
  if (!n) return null;
  return <span data-testid="needs-help-badge" className={`inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900 ring-1 ring-orange-300 ${className}`}>{n === 1 ? t("Needs help: 1 skill") : t("Needs help: {n} skills", { n })}</span>;
}

/**
 * 🧡 Needs help: for each student, the skills with a question they answered wrong twice (any source), with a sample
 * question and an Assign button (the page's AssignSkillHost opens with that skill chosen). Teachers only can assign.
 */
export function RepeatedMistakes({ rows, canAssign }: { rows: HelpStudent[]; canAssign: boolean }) {
  const t = useT();
  if (!rows.length) return <EmptyState compact icon="🌈" title="No repeated mistakes — great!" text="Skills appear here when a student answers the same question wrong twice." />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <li key={r.studentId} className="rounded-2xl bg-white p-4 ring-1 ring-orange-200">
          <div className="flex flex-wrap items-center gap-2">
            <Link prefetch={false} href={`/admin/student-file/${r.studentId}`} className="inline-flex min-h-11 items-center font-semibold text-brand-navy underline-offset-2 hover:underline"><bdi>{r.name}</bdi></Link>
            <NeedsHelpBadge n={r.skills.length} />
          </div>
          <ul className="mt-2 space-y-2">
            {r.skills.map((k) => (
              <li key={k.skillId} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-orange-50/60 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <bdi lang="en" className="block font-semibold text-slate-900">{k.name}</bdi>
                  <span className="block text-sm text-slate-600">{k.count === 1 ? t("1 question wrong twice") : t("{n} questions wrong twice", { n: k.count })}</span>
                  {k.sample && <span data-content lang="en" className="mt-0.5 block truncate text-sm italic text-slate-500">“{k.sample}”</span>}
                </span>
                {canAssign && k.assignable && <span className="inline-flex min-h-11 items-center"><AssignDialog skill={{ id: k.skillId, name: k.name, standards: [] }} /></span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
