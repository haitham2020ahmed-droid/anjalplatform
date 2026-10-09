import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { CONTINUUM_HEADERS, continuumStats } from "@/server/map/continuum";
import { importContinuumAction } from "./actions";

export const metadata = { title: "Learning Continuum" };

/** 📘 The MAP Growth Learning Continuum of the school: import, and how many statements each RIT band has. */
export default async function ContinuumPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const stats = await continuumStats(repo);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-reports", label: "MAP Reports" }} icon="📘" title="Learning Continuum"
        subtitle="What a student in each RIT band is ready to learn, by goal area and sub-topic, with the CCSS codes. The study plans and group plans use it: Reinforce (band below) · Develop (their band) · Introduce (band above), each statement linked to the platform's skills." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section title="Import" icon="📥" tone="amber" className="mb-6" hint={`One row per statement. Columns: ${CONTINUUM_HEADERS.join(", ")}. Subject: Reading or Language Usage. Standards: CCSS codes separated by spaces (RL.4.2 RL.5.2). Importing again replaces the statements of the subjects in the file.`}>
        <form action={importContinuumAction} className="flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".xlsx,.csv" required />
          <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Import</button>
        </form>
      </Section>
      <div className="grid gap-4 md:grid-cols-2">
        {stats.map((x) => (
          <section key={x.subject} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-brand-navy">{x.subject === "READING" ? "📖 Reading" : "✍️ Language Usage"} <span className="text-sm font-normal text-slate-500">· {x.total} statements</span></h2>
            {!x.total ? <p className="mt-2 text-slate-600">Not imported yet.</p> : (
              <table className="mt-3 w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="py-1">RIT band</th><th>Statements</th></tr></thead>
                <tbody>{x.bands.map((b) => <tr key={b.low} className="border-b last:border-0"><td className="py-1">{b.low}–{b.high}</td><td><span className="inline-block h-2 rounded bg-brand-teal align-middle" style={{ width: `${Math.max(4, b.n / 2)}px` }} /> {b.n}</td></tr>)}</tbody></table>
            )}
          </section>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-500">Then open <Link href="/teacher/map-reports" className="font-semibold text-brand-teal underline">MAP Reports</Link> for the study plans, family reports and group plans.</p>
    </AppShell>
  );
}
