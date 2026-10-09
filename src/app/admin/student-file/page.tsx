import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { searchStudents } from "@/server/insights/student-file";

export const metadata = { title: "Find a student" };

/** 🔎 Find any student (head of department: the whole school; teachers: their classes) and open the full file. */
export default async function FindStudentPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const q = (await searchParams).q ?? "";
  const found = await searchStudents(repo, actor, q);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader icon="🔎" title="Find a Student" subtitle={actor.role === "TEACHER" ? "Students of your classes: name, student ID or username." : "Any student of the school: name, student ID or username."} />
      <form action="/admin/student-file" className="flex gap-2">
        <input name="q" defaultValue={q} autoFocus placeholder="e.g. Ahmed, 20231045, ahmed.k" className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg" />
        <button className="rounded-2xl bg-brand-navy px-6 py-3 font-semibold text-white">Search</button>
      </form>
      {q.trim().length >= 2 && (
        !found.length ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No student found for “{q}”.</p> : (
          <ul className="mt-5 grid gap-2 md:grid-cols-2">{found.map((x) => (
            <li key={x.id}><Link href={`/admin/student-file/${x.id}`} className="lift flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <span><span className="block font-bold text-brand-navy">{x.name}</span><span className="block text-sm text-slate-500">Grade {x.grade} · {x.className || "no class"} · ID {x.number} · {x.username}</span></span>
              <span className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">Open file ▶</span>
            </Link></li>
          ))}</ul>
        )
      )}
    </AppShell>
  );
}
