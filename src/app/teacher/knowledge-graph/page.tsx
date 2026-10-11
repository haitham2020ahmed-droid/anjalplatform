import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classGaps } from "@/server/graph/knowledge-graph";

export const metadata = { title: "Knowledge Graph" };
const fill = (m: number | null) => (m === null ? "#f1f5f9" : m < 40 ? "#fee2e2" : m < 60 ? "#ffedd5" : m < 75 ? "#fef9c3" : "#dcfce7");
const stroke = (m: number | null) => (m === null ? "#cbd5e1" : m < 40 ? "#ef4444" : m < 60 ? "#f97316" : m < 75 ? "#eab308" : "#22c55e");

/**
 * 🕸️ The class on the knowledge graph: every skill of the grade from foundations (left) to the skills built on them
 * (right), coloured by the class's mastery; the weak foundations to reteach first, to whom, and what they unblock.
 */
export default async function KnowledgeGraphPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  if (!klass) return <AppShell name={String(me.displayName)}><p>No class.</p></AppShell>;
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  const ids = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => String(m.studentId));
  const st = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : [];
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = (sid: string) => String(users.find((u) => u.id === st.find((x) => x.id === sid)?.userId)?.displayName ?? "Student");
  const { graph, gaps } = cur ? await classGaps(repo, ids, String(cur.id)) : { graph: null, gaps: [] };
  const mastery = graph && ids.length ? await repo.findMany("StudentSkillMastery", { studentId: { in: ids }, skillId: { in: [...graph.nodes.keys()] } }, { select: ["skillId", "score"] }) : [];
  const avg = new Map<string, number>();
  for (const id of graph?.nodes.keys() ?? []) { const r = mastery.filter((m) => m.skillId === id); if (r.length) avg.set(id, Math.round(r.reduce((a, m) => a + Number(m.score), 0) / r.length)); }
  const gapSet = new Set(gaps.map((g) => g.skillId));
  // layout: columns by depth, rows by curriculum order
  const nodes = graph ? [...graph.nodes.values()] : [];
  const cols = new Map<number, typeof nodes>();
  for (const n of nodes) cols.set(n.depth, [...(cols.get(n.depth) ?? []), n]);
  for (const c of cols.values()) c.sort((a, b) => a.sequence - b.sequence);
  const W = 190, H = 34, CX = 240, RY = 44;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, list] of cols) list.forEach((n, i) => pos.set(n.id, { x: 12 + d * CX, y: 12 + i * RY }));
  const width = 24 + Math.max(1, cols.size) * CX, height = 24 + Math.max(1, ...[...cols.values()].map((c) => c.length)) * RY;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/learning-loop", label: "Learning Loop" }} icon="🕸️" title="Knowledge Graph"
        subtitle="Every skill of the grade, from the foundations (left) to the skills built on them (right), coloured by your class's mastery. When students struggle with a skill on the right, the cause is often a weak foundation on the left." />
      <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/knowledge-graph?class=${c.id}`} className={chip(c.id === klass.id)}>{String(c.name)}</Link>)}</nav>
      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">🧱 Foundations to reteach first</h2>
        <p className="text-xs text-slate-500">Weak skills whose own prerequisites are fine — fixing them unblocks the skills above. Students listed have it among their top three gaps.</p>
        {gaps.length ? <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{gaps.slice(0, 6).map((g) => (
          <article key={g.skillId} className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="font-bold text-amber-900">{g.name}</p>
            <p className="text-xs text-amber-800">{g.students.length} student(s) · average mastery {g.avgMastery}</p>
            {g.unblocks.length > 0 && <p className="mt-1 text-xs text-slate-700">Unblocks: {g.unblocks.join(", ")}</p>}
            <p className="mt-1 text-xs text-slate-600"><bdi>{g.students.slice(0, 8).map(nameOf).join(", ")}</bdi>{g.students.length > 8 ? ` +${g.students.length - 8}` : ""}</p>
            <Link href={`/teacher/intervention/groups?class=${klass.id}&students=${g.students.join(",")}`} className="mt-1 inline-block text-xs font-semibold text-brand-teal underline">Start a small group →</Link>
          </article>
        ))}</div> : <p className="mt-3 text-sm text-slate-500">No weak foundation in this class yet (or not enough practice to tell).</p>}
      </section>
      <section className="mt-5 overflow-x-auto rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600">{[["No data", null], ["Under 40", 30], ["40–59", 50], ["60–74", 70], ["75+", 80]].map(([l, m]) => <span key={String(l)} className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded" style={{ background: fill(m as number | null), border: `1px solid ${stroke(m as number | null)}` }} />{l as string}</span>)}<span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded border-2 border-red-600" />foundation gap</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Knowledge graph of the grade's skills">
          {nodes.flatMap((n) => (graph!.prereqs.get(n.id) ?? []).map((e) => { const a = pos.get(e.prerequisiteSkillId)!, b = pos.get(n.id)!; return <path key={`${e.prerequisiteSkillId}-${n.id}`} d={`M${a.x + W} ${a.y + H / 2} C${a.x + W + 25} ${a.y + H / 2}, ${b.x - 25} ${b.y + H / 2}, ${b.x} ${b.y + H / 2}`} fill="none" stroke="#94a3b8" strokeWidth="1" />; }))}
          {nodes.map((n) => { const p = pos.get(n.id)!, m = avg.get(n.id) ?? null; return (
            <g key={n.id}><title>{`${n.name}: ${m === null ? "no data" : `class mastery ${m}`}`}</title>
              <rect x={p.x} y={p.y} width={W} height={H} rx="8" fill={fill(m)} stroke={gapSet.has(n.id) ? "#dc2626" : stroke(m)} strokeWidth={gapSet.has(n.id) ? 2.5 : 1} />
              <text x={p.x + 8} y={p.y + 15} fontSize="11" fontWeight="600" fill="#1e293b">{n.name.length > 30 ? `${n.name.slice(0, 29)}…` : n.name}</text>
              <text x={p.x + 8} y={p.y + 28} fontSize="10" fill="#475569">{m === null ? "—" : `mastery ${m}`}{(graph!.dependents.get(n.id) ?? []).length ? ` · unlocks ${(graph!.dependents.get(n.id) ?? []).length}` : ""}</text>
            </g>); })}
        </svg>
      </section>
    </AppShell>
  );
}
