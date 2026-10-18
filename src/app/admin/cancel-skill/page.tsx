import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { ConfirmForm } from "@/components/teacher/confirm-form";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { adminFindStudents, adminStudentSkills } from "@/server/admin/cancel-skill";
import { ASSIGNED_KIND_LABEL } from "@/server/teacher/assigned";
import { adminCancelSkillAction } from "./actions";

export const metadata = { title: "Cancel a skill" };

type SP = { q?: string; student?: string; done?: string; err?: string };

/**
 * 🧰 Admin override: cancel a skill from any student's My Work, in any grade or class of the school — a safety valve
 * for the cases outside a teacher's own Assigned page (a very old assignment, a class the teacher no longer teaches).
 * It changes nothing new: the lookup reads the student's live assigned skills exactly like the Assigned page does,
 * and Cancel is the SAME per-student cancel a teacher's own Assigned page uses (src/server/teacher/assigned.ts).
 */
export default async function AdminCancelSkillPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().slice(0, 80);
  const studentId = String(sp.student ?? "").replace(/[^A-Za-z0-9_-]/g, "");

  const results = q ? await adminFindStudents(repo, actor, q) : [];
  const picked = studentId ? await adminStudentSkills(repo, actor, studentId).catch(() => null) : null;

  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Admin" }} icon="🧰" title="Cancel a skill"
        subtitle="Find any student in the school (any grade, any class) and cancel one assigned skill for them. This hides it from their My Work right away; their answers are kept, and a teacher can Undo it later from the Assigned page." />

      {sp.done && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200">Cancelled. The student no longer sees this skill; their answers are kept.</p>}
      {sp.err && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{sp.err}</p>}

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <label className="grid flex-1 gap-0.5 text-xs font-semibold text-slate-500" htmlFor="q">Student name, ID or username</label>
        <input id="q" name="q" defaultValue={q} placeholder="Type a name, student ID or username" className="h-10 min-w-56 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-teal focus:outline-none" />
        <button className="h-10 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white">Search</button>
      </form>

      {q && !picked && (
        results.length === 0 ? (
          <EmptyState icon="🔎" title="No student matches that search" compact />
        ) : (
          <section aria-label="Search results" className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <ul className="divide-y divide-slate-200">
              {results.map((x) => (
                <li key={x.id}>
                  <Link prefetch={false} href={`/admin/cancel-skill?${new URLSearchParams({ q, student: x.id }).toString()}`}
                    className="flex min-h-14 items-center justify-between gap-2 px-4 py-2 hover:bg-slate-50">
                    <span className="min-w-0">
                      <bdi className="block truncate font-semibold text-slate-900">{x.name || x.username}</bdi>
                      <span dir="ltr" className="block truncate text-xs text-slate-500">{x.number}{x.username ? ` · ${x.username}` : ""} · Grade {x.grade}{x.className ? ` · ${x.className}` : ""}</span>
                    </span>
                    <span aria-hidden="true" className="text-slate-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      {picked && (
        <section aria-label="Student's assigned skills" className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">
              <bdi>{picked.student.name}</bdi> <span className="font-normal text-slate-500">· Grade {picked.student.grade}{picked.student.className ? ` · ${picked.student.className}` : ""} · ID {picked.student.number}</span>
            </h2>
            <Link prefetch={false} href="/admin/cancel-skill" className="text-sm font-semibold text-brand-teal hover:underline">Search another student</Link>
          </div>
          {picked.skills.length === 0 ? (
            <EmptyState icon="📌" title="This student has no assigned skills right now" compact />
          ) : (
            <ul className="divide-y divide-slate-200">
              {picked.skills.map((x) => (
                <li key={`${x.kind}:${x.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-900">{x.title}</span>
                    <span className="ms-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">{ASSIGNED_KIND_LABEL[x.kind]}</span>
                    {x.classNames.length > 0 && <span className="ms-1.5 text-xs text-slate-500">· {x.classNames.join(", ")}</span>}
                    {x.done && <span className="ms-1.5 text-xs font-semibold text-emerald-700">· Done</span>}
                  </span>
                  <ConfirmForm action={adminCancelSkillAction} fields={{ kind: x.kind, id: x.id, studentId: picked.student.id }}
                    label="Cancel this skill" tone="danger"
                    ask={`Cancel "${x.title}" for ${picked.student.name}? They will no longer see it in My Work; their answers are kept, and a teacher can Undo it from the Assigned page.`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </AppShell>
  );
}
