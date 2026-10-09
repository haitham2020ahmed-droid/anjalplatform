import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { supportGroups } from "@/server/teacher/support";

export const metadata = { title: "Support Groups" };
const KIND = { STANDARD: { icon: "🎯", tone: "ring-rose-200 bg-rose-50" }, STUCK: { icon: "🆘", tone: "ring-amber-200 bg-amber-50" }, FLUENCY: { icon: "🔊", tone: "ring-sky-200 bg-sky-50" } } as const;

/** 🛟 Small groups built from the data, each with a ready mini-lesson to print. */
export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await supportGroups(repo, actor, classId) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🛟" title="Support Groups" subtitle="Who needs help with what, from the Diagnostic Test, the curriculum plan (students stuck in a part) and fluency checks. Each group has a 20–30 minute mini-lesson ready to print." />
      <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/groups?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}</nav>
      {v && (!v.groups.length ? <p className="rounded-2xl bg-emerald-50 p-6 text-emerald-900 ring-1 ring-emerald-200">🎉 No group needed right now in {v.className}. Groups appear after the Diagnostic Test, when students get stuck in a part of their plan, or after fluency checks.</p> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {v.groups.map((g) => (
            <li key={g.key} className={`rounded-3xl p-5 ring-1 ${KIND[g.kind].tone}`}>
              <p className="text-lg font-bold text-brand-navy">{KIND[g.kind].icon} {g.title} <span className="font-mono text-xs text-brand-teal">{g.kind !== "STUCK" ? g.code : ""}</span></p>
              <p className="text-sm text-slate-600">{g.why} · {g.students.length} student(s)</p>
              <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">{g.students.map((x) => <li key={x.id}><Link href={`/teacher/students/${x.id}`} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-slate-200 hover:ring-brand-teal">{x.name} <span className="text-xs text-slate-500">{x.detail}</span></Link></li>)}</ul>
              <Link href={g.lessonHref} className="mt-3 inline-block rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:bg-brand-purple">📄 Mini-lesson</Link>
            </li>
          ))}
        </ul>
      ))}
    </AppShell>
  );
}
