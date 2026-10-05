import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";

/** Curriculum editor home: each grade's book and its units. */
export default async function CurriculumAdmin() {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const me = (await getActor())!.user;
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).sort((a, b) => Number(a.level) - Number(b.level));
  const rows = await Promise.all(
    grades.map(async (g) => {
      const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
      if (!cur) return { grade: Number(g.level), book: null, units: [] as { id: string; number: number; title: string }[] };
      const book = await repo.findUnique("Book", { id: cur.bookId });
      const units = (await repo.findMany("Unit", { curriculumId: cur.id, deletedAt: null })).sort((a, b) => Number(a.number) - Number(b.number));
      return { grade: Number(g.level), book: `${book!.title}${book!.edition ? ` (${book!.edition})` : ""}`, units: units.map((u) => ({ id: String(u.id), number: Number(u.number), title: String(u.title) })) };
    }),
  );
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-bold text-brand-navy">Curriculum</h1>
      <p className="mt-1 text-slate-600">Choose a unit to edit its lessons and skills.</p>
      {rows.map((r) => (
        <section key={r.grade} className="mt-8">
          <h2 className="text-xl font-bold text-brand-navy">Grade {r.grade}{r.book ? `: ${r.book}` : ""}</h2>
          {r.units.length === 0 ? (
            <p className="mt-2 text-slate-600">No curriculum yet. Import one with <code>npm run db:seed:curriculum</code>.</p>
          ) : (
            <ul className="mt-3 grid gap-2 md:grid-cols-3">
              {r.units.map((u) => (
                <li key={u.id}><a href={`/admin/curriculum/unit/${u.id}`} className="block rounded-xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-teal">
                  <span className="text-sm text-slate-500">Unit {u.number}</span><span className="block font-semibold text-brand-navy">{u.title}</span></a></li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </AppShell>
  );
}
