import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ConfirmForm } from "@/components/teacher/confirm-form";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { searchStudents } from "@/server/insights/student-file";
import { workVisibility, type VisReason } from "@/server/admin/work-visibility";
import { linkMissingForClassAction, linkStudentNowAction } from "./actions";

export const metadata = { title: "Why can't a student see their work?" };

type SP = { q?: string; student?: string; linked?: string; err?: string; only?: string };

const TONE: Record<VisReason, string> = {
  SHOWN: "bg-emerald-50 ring-emerald-200", CHOSEN_ONLY: "bg-slate-50 ring-slate-200", CANCELLED_ALL: "bg-rose-50 ring-rose-200", REMOVED: "bg-rose-50 ring-rose-200",
  STARTS_LATER: "bg-violet-50 ring-violet-200", PLAN_PLACE: "bg-sky-50 ring-sky-200", DELETED: "bg-slate-100 ring-slate-300", DIAGNOSTIC: "bg-sky-50 ring-sky-200",
  NOT_LINKED: "bg-amber-50 ring-amber-300", LEARN_PAGE: "bg-sky-50 ring-sky-200", CLOSED: "bg-slate-50 ring-slate-200", OTHER: "bg-orange-50 ring-orange-300",
};
const day = (v: string | null) => (v ? v.slice(0, 10) : "—");

/**
 * 🔍 Why can't a student see their work? — ENGLISH ONLY (owner's explicit wish: plain English strings on this page,
 * no translation calls). Pick a student; every assigned thing of their classes (exactly the Assigned page's rows,
 * cancelled ones included) is listed with ONE reason: shown in My Work (and where), or why not — with "Link now" for
 * a missing student row. Rules and reads: src/server/admin/work-visibility.ts. School admin: any student of the
 * school; a teacher: students of their own classes.
 */
export default async function WorkVisibilityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().slice(0, 80);
  const studentId = String(sp.student ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  const results = q ? await searchStudents(repo, actor, q) : [];
  let err = sp.err ? String(sp.err).slice(0, 300) : "";
  const view = studentId ? await workVisibility(repo, actor, studentId).catch((e: Error) => { err = err || e.message || "This student cannot be checked."; return null; }) : null;
  const notShown = view ? view.rows.filter((r) => r.reason !== "SHOWN") : [];
  const rows = view ? (sp.only === "hidden" ? notShown : view.rows) : [];
  const counts = new Map<string, number>();
  for (const r of view?.rows ?? []) counts.set(`${r.icon} ${r.reason}`, (counts.get(`${r.icon} ${r.reason}`) ?? 0) + 1);
  const studentHref = (extra: Record<string, string> = {}) => `/admin/work-visibility?${new URLSearchParams({ student: studentId, ...extra }).toString()}`;
  const isAdmin = actor.role !== "TEACHER";

  return (
    <AppShell name={String(me.displayName)}>
      <div lang="en" dir="ltr">
        <header className="mb-6">
          <Link prefetch={false} href={isAdmin ? "/admin" : "/teacher/assigned"} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-teal-ink">‹ {isAdmin ? "Admin" : "Assigned"}</Link>
          <h1 className="mt-1.5 flex items-center gap-3 text-[1.625rem] leading-tight text-ink sm:text-3xl"><span aria-hidden="true">🧐</span>Why can&apos;t a student see their work?</h1>
          <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-ink-2">
            Pick a student. Every piece of work assigned to their classes (the same list as the teacher&apos;s Assigned page, cancelled work included) is checked against the student&apos;s real My Work, with one clear reason for each.
          </p>
        </header>

        {sp.linked && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200">Linked: {sp.linked} student row{sp.linked === "1" ? "" : "s"} added (Not started). The work is now in My Work.</p>}
        {err && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}

        <section aria-label="Find a student" className="mb-6 rounded-xl bg-surface p-4 ring-1 ring-line">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-0.5 text-xs font-semibold text-muted">Student name or number
              <input name="q" defaultValue={q} placeholder="e.g. Ahmed or 1024" className="h-10 rounded-lg border border-line px-3 text-sm text-ink" />
            </label>
            <button className="h-10 shrink-0 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white">Search</button>
          </form>
          {q && (results.length === 0
            ? <p className="mt-3 text-sm text-muted">No student matches “{q}”{isAdmin ? "" : " in your classes"}.</p>
            : <ul className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((x) => (
                  <li key={x.id}>
                    <Link prefetch={false} href={`/admin/work-visibility?${new URLSearchParams({ q, student: x.id }).toString()}`} className={`block rounded-lg px-3 py-2 text-sm ring-1 hover:ring-brand-teal ${x.id === studentId ? "bg-teal-50 ring-teal-300" : "ring-line"}`}>
                      <span className="font-semibold text-ink">{x.name}</span> <span className="text-xs text-muted">· {x.number || "no number"} · Grade {x.grade} · {x.className || "no class"}</span>
                    </Link>
                  </li>
                ))}
              </ul>)}
        </section>

        {view && (
          <>
            <section aria-label="The student" className="mb-4 rounded-xl bg-surface p-4 ring-1 ring-line">
              <h2 className="text-lg font-semibold text-ink">{view.student.name} <span className="text-sm font-normal text-muted">· {view.student.number || "no number"} · {view.myWork} row{view.myWork === 1 ? "" : "s"} in My Work now</span></h2>
              {view.classes.length === 0 && <p className="mt-2 text-sm text-muted">This student is in no class {isAdmin ? "" : "that you teach "}— nothing can be assigned to them.</p>}
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {view.classes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-line">
                    <span className="min-w-0">
                      <span className="font-semibold text-ink">{c.name}</span>
                      <span className="text-xs text-muted"> · joined {day(c.joinedAt)}{c.teacherNames.length ? ` · ${c.teacherNames.join(", ")}` : ""}</span>
                    </span>
                    {c.missing > 0
                      ? <ConfirmForm action={linkMissingForClassAction} fields={{ classId: c.id, studentId: view.student.id }} label={`Link all missing for this class (${c.missing})`}
                          ask={`Add ${c.missing} missing student row(s) in ${c.name}? Only students who joined the class AFTER a skill or question set was sent are linked (Not started). Students the teacher left out or removed are not touched.`} />
                      : <span className="text-xs text-muted">No missing links</span>}
                  </li>
                ))}
              </ul>
              {counts.size > 0 && (
                <p className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  {[...counts].map(([k, n]) => <span key={k} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 ring-1 ring-line">{k.split(" ")[0]} {n}</span>)}
                  <Link prefetch={false} href={studentHref(sp.only === "hidden" ? {} : { only: "hidden" })} className="ms-2 font-semibold text-brand-teal hover:underline">{sp.only === "hidden" ? "Show everything" : `Show only what is not shown (${notShown.length})`}</Link>
                </p>
              )}
            </section>

            {rows.length === 0 ? <p className="rounded-xl bg-surface p-4 text-sm text-muted ring-1 ring-line">Nothing is assigned to this student&apos;s classes{sp.only === "hidden" ? " that is hidden from them" : ""}.</p> : (
              <ul aria-label="Assigned work and what My Work does with it" className="grid gap-2">
                {rows.map((r) => (
                  <li key={`${r.kind}:${r.id}`} className={`rounded-xl px-3 py-2 text-sm ring-1 ${TONE[r.reason]}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-semibold text-ink">{r.title}</span>
                        <span className="ms-1.5 rounded-full bg-white/70 px-1.5 py-0.5 text-xs text-ink-2 ring-1 ring-line">{r.kindLabel}</span>
                        <span className="ms-1.5 text-xs text-muted">{r.classNames.join(", ")}{r.teacher ? ` · by ${r.teacher}` : ""} · sent {day(r.createdAt)}{r.startAt ? ` · starts ${day(r.startAt)}` : ""}{r.dueAt ? ` · due ${day(r.dueAt)}` : ""}</span>
                      </span>
                      {r.linkable && r.classId && <ConfirmForm action={linkStudentNowAction} fields={{ assignmentId: r.id, studentId: view.student.id }} label="Link now" ask={`Add ${view.student.name} to “${r.title}” (Not started)?`} />}
                    </div>
                    <p className="mt-1 text-ink"><span aria-hidden="true">{r.icon}</span> {r.text}</p>
                    {r.reason !== "SHOWN" && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold text-muted">Raw facts (for a report)</summary>
                        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                          {r.facts.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all font-mono text-ink-2">{v}</dd></div>)}
                        </dl>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
