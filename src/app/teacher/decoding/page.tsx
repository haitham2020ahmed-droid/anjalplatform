import { NameList } from "@/components/name-list";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classDecodingProfile, studentScreenDetail, type ProfileRow, type StrandStatus } from "@/server/word-study/screener";
import { inviteScreensAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decoding Screener" };

const TONE: Record<StrandStatus, string> = { MASTERED: "bg-emerald-100 text-emerald-900", REVIEW: "bg-amber-100 text-amber-900", RETEACH: "bg-rose-100 text-rose-900" };
const STATE: Record<ProfileRow["state"], string> = { NONE: "Not taken", INVITED: "Asked — not started", IN_PROGRESS: "In progress", DONE: "Done" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const pctOf = (t: { pct: number; total: number } | null) => (t && t.total ? `${t.pct}%` : "—");

/** 🔤 Decoding screener: the class profile (strands × students), patterns to reteach, word-study groups, invitations. */
export default async function DecodingProfilePage({ searchParams }: { searchParams: Promise<{ classId?: string; student?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await classDecodingProfile(repo, actor, classId) : null;
  const detail = v && sp.student && v.rows.some((r) => r.id === sp.student) ? await studentScreenDetail(repo, actor, classId, String(sp.student)) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🔤" title="Decoding Screener" subtitle="Students hear a word and choose its spelling: 8 phonics strands, each with 5 real and 5 made-up words (made-up words show decoding without memory). ≥ 80% mastered · 60–79% review · under 60% reteach. A pattern missed twice is listed to reteach." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/decoding?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}</nav>
      {!v && <p className="text-slate-600">No class yet.</p>}
      {v && (
        <div className="space-y-5">
          {v.groups.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-bold text-brand-navy">Suggested word-study groups</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {v.groups.map((g) => (
                  <div key={g.key} className="rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200">
                    <p className="font-bold text-slate-900">{g.title} <span className="text-sm font-normal text-slate-500">· {g.students.length} student{g.students.length > 1 ? "s" : ""}</span></p>
                    <p className="mt-1 text-sm text-slate-700">{g.why}</p>
                    <p className="mt-2 text-sm">{g.students.map((x) => <span key={x.id} className="me-1.5 inline-block rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">{x.name}</span>)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {v.patterns.length > 0 && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <h2 className="mb-2 font-bold text-brand-navy">Who needs which pattern <span className="text-sm font-normal text-slate-500">(missed both words of the pattern)</span></h2>
              <ul className="space-y-1 text-sm">{v.patterns.map((p) => <li key={p.label}><b>{p.label}</b> — <NameList items={p.students} sep=", " /></li>)}</ul>
            </section>
          )}

          <form action={inviteScreensAction} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <input type="hidden" name="classId" value={classId} />
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600"><span className="rounded bg-emerald-100 px-1">Mastered</span> <span className="rounded bg-amber-100 px-1">Review</span> <span className="rounded bg-rose-100 px-1">Reteach</span> · “✓” = below the start strand, assumed secure · — = not tested.</p>
              <button type="submit" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">📨 Ask these students to take the screener</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <caption className="sr-only">Decoding strands by student</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2"><span className="sr-only">Select</span></th><th>Student</th><th>Status</th>
                    {v.strands.map((st) => <th key={st.n} className="px-1 text-center" title={st.name}>{st.n}. {st.short}</th>)}
                    <th className="text-center">Real</th><th className="text-center">Made-up</th><th>Teach from</th>
                  </tr>
                </thead>
                <tbody>
                  {v.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2"><input type="checkbox" name="studentId" value={r.id} aria-label={`Ask ${r.name}`} disabled={r.state === "INVITED" || r.state === "IN_PROGRESS"} /></td>
                      <td className="font-medium"><Link href={`/teacher/decoding?classId=${classId}&student=${r.id}`} className="text-brand-navy underline-offset-2 hover:underline">{r.name}</Link></td>
                      <td className="text-xs text-slate-600">{STATE[r.state]}{r.completedAt ? ` · ${day(r.completedAt)}` : ""}{r.reason === "TIER" && r.state !== "DONE" ? " · auto (Tier)" : ""}</td>
                      {v.strands.map((st) => {
                        const c = r.strands[st.n];
                        return <td key={st.n} className="px-1 text-center">{c ? <span className={`inline-block min-w-12 rounded px-1.5 py-0.5 font-bold tabular-nums ${TONE[c.status]}`} title={`${st.name}: ${c.pct}% (real ${pctOf(c.real)}, made-up ${pctOf(c.madeUp)})${c.reteach.length ? ` — reteach ${c.reteach.join(", ")}` : ""}`}>{c.pct}</span> : r.assumed.includes(st.n) ? <span className="text-emerald-700" title="Below the start strand: assumed secure">✓</span> : <span className="text-slate-300">—</span>}</td>;
                      })}
                      <td className="text-center tabular-nums">{pctOf(r.real)}</td>
                      <td className="text-center tabular-nums">{pctOf(r.madeUp)}{r.decodingGap && <span className="ms-1 rounded-full bg-sky-100 px-1.5 text-[11px] font-bold text-sky-900" title="Real words 20+ points better than made-up words">gap</span>}</td>
                      <td className="text-xs">{r.teachFrom ? v.strands.find((x) => x.n === r.teachFrom)?.name : r.state === "DONE" ? "All tested strands mastered" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </form>

          {detail && (
            <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200" aria-labelledby="detail-h">
              <h2 id="detail-h" className="text-lg font-bold text-brand-navy">Results: {detail.name}</h2>
              {!detail.screens.length && <p className="text-slate-600">No word check yet.</p>}
              {detail.screens.map((sc) => (
                <div key={sc.id} className="mt-3">
                  <p className="text-sm text-slate-600">{sc.completedAt ? `Finished ${day(sc.completedAt)}` : sc.strands.length ? "In progress" : "Asked, not started"} · reason {sc.reason.toLowerCase()}</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {sc.strands.map((st) => (
                      <div key={st.strand} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <p className="font-semibold">{st.strand}. {st.name}{sc.result?.strands[String(st.strand)] ? ` — ${sc.result.strands[String(st.strand)].pct}% (${sc.result.strands[String(st.strand)].status.toLowerCase()})` : ""}</p>
                        <ul className="mt-1 flex flex-wrap gap-1 text-xs">
                          {st.items.map((it, k) => <li key={k} className={`rounded px-1.5 py-0.5 ${it.correct === null ? "bg-white text-slate-400 ring-1 ring-slate-200" : it.correct ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`} title={it.real ? "real word" : "made-up word"}>{it.real ? "" : "🦄 "}{it.word}{it.correct === false ? ` → ${it.picked}` : ""}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
