"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { matchesStudent } from "./name-match";
import { NeedsHelpBadge } from "./repeated-mistakes";

export interface ListStudent { id: string; name: string; number: string; username: string; grade: number; className: string }
export interface ListClass { classId: string; className: string; grade: number; students: ListStudent[]; alerts?: number }

/**
 * 👥 My Students: the whole list is on the page at once (grouped by class); the box filters it instantly on the
 * device (Arabic and English names, student ID, username). A name opens the student's file.
 */
export function StudentList({ classes, initialQuery = "", manage = false, help = {} }: { classes: ListClass[]; initialQuery?: string; manage?: boolean; help?: Record<string, number> }) {
  const t = useT();
  const [q, setQ] = useState(initialQuery);
  const dq = q;
  const shown = useMemo(() => classes.map((c) => ({ ...c, students: c.students.filter((x) => matchesStudent(x, dq)) })).filter((c) => c.students.length || (!dq.trim() && c.classId)), [classes, dq]);
  const total = classes.reduce((n, c) => n + c.students.length, 0);
  const found = shown.reduce((n, c) => n + c.students.length, 0);
  const link = "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal";
  return (
    <div>
      <div className="sticky top-16 z-10 -mx-1 rounded-2xl bg-slate-50/95 px-1 py-2 backdrop-blur">
        <label className="sr-only" htmlFor="student-filter">{t("Find a student")}</label>
        <input id="student-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
          placeholder={t("Type a name, student ID or username")} className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg shadow-sm focus:border-brand-teal focus:outline-none" />
        <p role="status" className="mt-1 px-1 text-sm text-slate-500">{dq.trim() ? t("{n} of {m} students", { n: found, m: total }) : t("{n} students", { n: total })}</p>
      </div>
      {total === 0 ? (
        <div className="mt-4 rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
          <p className="text-4xl" aria-hidden="true">🏫</p>
          <p className="mt-2 text-lg font-semibold text-brand-navy">{t("No students yet")}</p>
          <p className="text-slate-600">{t("Ask the school admin to add your class.")}</p>
        </div>
      ) : found === 0 && dq.trim() ? (
        <p className="mt-4 rounded-2xl bg-white p-6 text-center text-slate-600 ring-1 ring-slate-200">{t("No student matches “{q}”.", { q: dq.trim() })}</p>
      ) : (
        <div className="mt-2 space-y-5">
          {shown.map((c) => (
            <section key={c.classId || "none"} aria-label={c.className || t("No class")} className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-brand-navy">
                  {c.classId ? <bdi>{c.className}</bdi> : t("No class")}
                  {c.grade ? <span className="ms-2 text-sm font-normal text-slate-500">{t("Grade {n}", { n: c.grade })} · {t("{n} students", { n: c.students.length })}</span> : null}
                  {c.alerts ? <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("{n} alerts", { n: c.alerts })}</span> : null}
                </h2>
                {manage && c.classId && (
                  <div className="flex flex-wrap gap-2">
                    <Link prefetch={false} href={`/teacher/accounts?classId=${c.classId}`} className={link}>🖨 {t("Print accounts")}</Link>
                    <Link prefetch={false} href={`/teacher/classes/${c.classId}`} className={link}>{t("Class page")}</Link>
                    <Link prefetch={false} href={`/teacher/progress?classId=${c.classId}`} className={link}>{t("Dashboard")}</Link>
                    <Link prefetch={false} href={`/teacher/levels?classId=${c.classId}`} className={link}>{t("Levels")}</Link>
                  </div>
                )}
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {c.students.map((x) => (
                  <li key={x.id}>
                    <Link prefetch={false} href={`/teacher/students/${x.id}`} className="flex min-h-14 items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200 hover:bg-white hover:ring-brand-teal">
                      <span className="min-w-0">
                        <bdi className="block truncate font-semibold text-slate-900">{x.name || x.username}</bdi>
                        <span dir="ltr" className="block truncate text-xs text-slate-500">{x.number}{x.username ? ` · ${x.username}` : ""}</span>
                        <NeedsHelpBadge n={help[x.id] ?? 0} className="mt-1" />
                      </span>
                      <span aria-hidden="true" className="text-slate-400 rtl:rotate-180">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
