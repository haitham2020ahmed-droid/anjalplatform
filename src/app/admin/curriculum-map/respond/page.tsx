import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { RESPOND_HEADERS, RESPOND_LEVELS, respondOverview } from "@/server/curriculum-map/respond";
import { importRespondAction } from "./actions";

export const metadata = { title: "Respond to Reading" };

/** ✍️ Every Text Set's Respond to Reading, with its three level pages (Below → On → Above), and the import. */
export default async function RespondOverviewPage({ searchParams }: { searchParams: Promise<{ msg?: string; grade?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const all = await respondOverview(repo, actor);
  const grade = all.find((g) => g.grade === Number(sp.grade)) ?? all[0];
  const canEdit = can(actor, "questions:publish") && actor.role !== "TEACHER";
  const done = (all.flatMap((g) => g.units.flatMap((u) => u.sets.flatMap((x) => RESPOND_LEVELS.filter((l) => x.levels[l]))))).length;
  const total = all.flatMap((g) => g.units.flatMap((u) => u.sets)).length * 3;
  const chip = (on: boolean) => `rounded-full px-5 py-2 text-sm font-bold ${on ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/curriculum-map", label: "Curriculum Map" }} icon="✍️" title="Respond to Reading"
        subtitle={`Each Text Set has three level pages, Below → On → Above, each with its own activity: the prompt, steps, word bank, sentence starters, checklist and a hidden hint. Students open the version of their level. ${done}/${total} level pages written.`}>
        <nav aria-label="Grade" className="flex gap-2">{all.map((g) => <Link key={g.grade} href={`/admin/curriculum-map/respond?grade=${g.grade}`} aria-current={g.grade === grade?.grade ? "page" : undefined} className={chip(g.grade === grade?.grade)}>Grade {g.grade}</Link>)}</nav>
      </PageHeader>
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {canEdit && (
        <Section title="Import activities" icon="📥" tone="amber" className="mb-6" hint={`One row per level. Columns: ${RESPOND_HEADERS.join(", ")}. Curriculum Map ID is the level, e.g. G4.U1.TS1.RTR.BELOW. In the list columns write one item per line. Importing again replaces the activity of that level.`}>
          <p className="mb-3 flex flex-wrap gap-2 text-sm">
            <span className="font-semibold text-slate-700">Templates for Grade {grade?.grade ?? 4}:</span>
            <a href={`/api/respond-template?grade=${grade?.grade ?? 4}&format=docx`} className="rounded-lg bg-white px-3 py-1 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇️ Word</a>
            <a href={`/api/respond-template?grade=${grade?.grade ?? 4}&format=xlsx`} className="rounded-lg bg-white px-3 py-1 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇️ Excel</a>
            <span className="text-slate-500">Fill in only the activities you have; empty ones are skipped. A PDF: save it as Word first.</span>
          </p>
          <form action={importRespondAction} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="file" name="file" accept=".xlsx,.csv,.docx,.txt" required />
            <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Import</button>
          </form>
        </Section>
      )}
      {!grade ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No grade has Respond to Reading on its Curriculum Map.</p> : grade.units.map((u) => (
        <section key={u.unit} className="mb-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-brand-navy">{u.unit}</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {u.sets.map((x) => (
              <li key={x.setCode} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div><p className="font-semibold text-slate-900">{x.heading}</p>{x.sharedRead && <p className="text-xs text-slate-500">📖 {x.sharedRead}</p>}</div>
                <div className="flex flex-wrap gap-2">
                  {RESPOND_LEVELS.map((l) => (
                    <Link key={l} href={`/admin/curriculum-map/respond/${x.setCode}?level=${l}`} className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${x.levels[l] ? "bg-violet-50 text-violet-900 ring-violet-300" : "bg-slate-50 text-slate-400 ring-slate-200"}`}>
                      {x.levels[l] ? "✍️" : "➕"} {l === "BELOW" ? "Below" : l === "ON" ? "On" : "Above"}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}
