import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { DESC_STYLE, STATUS_STYLE } from "@/components/map/map-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { accuracy, classResults, readiness, schoolResults, windows } from "@/server/map/sim";
import type { Subject } from "@/server/map/map-plan";
import { closeWindowAction, createWindowAction, draftsAction, recalibrateAction } from "./actions";

export const metadata = { title: "MAP practice test" };

/** 🧭 MAP practice test: open a window (admin), bank readiness, results by class, accuracy after the real MAP. */
export default async function MapTestPage({ searchParams }: { searchParams: Promise<{ w?: string; classId?: string; subject?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const isAdmin = actor.role !== "TEACHER";
  const [ws, classes] = await Promise.all([windows(repo, actor), readableClasses(repo, actor)]);
  const w = ws.find((x) => x.id === sp.w) ?? ws[0];
  const subject: Subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => String(c.gradeId)))] } }, { select: ["id", "level"] });
  const gradeOf = (c: Record<string, unknown>) => Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0);
  const myClasses = classes.filter((c) => !w || w.grade === null || gradeOf(c) === w.grade).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = myClasses.some((c) => c.id === sp.classId) ? String(sp.classId) : myClasses[0] ? String(myClasses[0].id) : "";
  const [cls, school, acc] = w ? await Promise.all([classId ? classResults(repo, actor, w.id, classId, subject) : null, isAdmin ? schoolResults(repo, actor, w.id, subject) : null, accuracy(repo, actor, w.id, subject)]) : [null, null, null];
  const ready = isAdmin ? await Promise.all([...new Set(grades.map((g) => Number(g.level)))].sort().map((g) => readiness(repo, actor, g))) : [];
  const link = (p: Record<string, string>) => `/teacher/map-test?${new URLSearchParams({ w: w?.id ?? "", classId, subject, ...p })}`;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const box = "mt-1 block rounded-lg border border-slate-300 px-2 py-1.5";
  const today = new Date().toISOString().slice(0, 10), in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-plans", label: "MAP plans" }} icon="🧭" title="MAP practice test" subtitle="A MAP-like adaptive test for every student before Winter and Spring: 50 Reading + 50 Language questions, shared between the goal areas. It shows who is on track for the Spring goal before the real test.">
        <PrintButton />
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}

      {isAdmin && (
        <details className="mb-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:hidden" open={!ws.length}>
          <summary className="cursor-pointer text-lg font-bold text-brand-navy">➕ Open a practice test</summary>
          <form action={createWindowAction} className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <label className="font-semibold">Title<input name="title" placeholder="MAP practice · before Winter" className={`${box} w-full`} /></label>
            <label className="font-semibold">Grade<select name="grade" className={`${box} w-full`}><option value="">All grades</option>{[...new Set(grades.map((g) => Number(g.level)))].sort().map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
            <label className="font-semibold">Before<select name="season" defaultValue="WINTER" className={`${box} w-full`}><option value="WINTER">Winter MAP</option><option value="SPRING">Spring MAP</option><option value="FALL">Fall MAP</option></select></label>
            <fieldset className="font-semibold">Subjects<div className="mt-2 flex gap-3 font-normal"><label><input type="checkbox" name="subjects" value="READING" defaultChecked /> Reading</label><label><input type="checkbox" name="subjects" value="LANGUAGE" defaultChecked /> Language Usage</label></div></fieldset>
            <label className="font-semibold">Questions per subject<input name="items" type="number" min={20} max={60} defaultValue={50} className={`${box} w-24`} /></label>
            <div className="flex gap-2"><label className="font-semibold">Opens<input name="opensAt" type="date" defaultValue={today} required className={box} /></label><label className="font-semibold">Closes<input name="closesAt" type="date" defaultValue={in14} required className={box} /></label></div>
            <button className="rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white sm:col-span-3 sm:justify-self-start">Open the practice test</button>
          </form>
          {ready.length > 0 && (
            <div className="mt-5">
              <h3 className="font-bold text-brand-navy">Is the question bank ready? <span className="text-sm font-normal text-slate-500">(each goal area needs enough questions, including easy and hard ones, for two tests a year without repeats)</span></h3>
              <div className="mt-2 grid gap-3 md:grid-cols-3">{ready.flat().map((r) => (
                <div key={`${r.grade}${r.subject}`} className={`rounded-2xl p-3 ring-1 ${r.ok ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"}`}>
                  <p className="font-bold">{r.ok ? "✅" : "⚠️"} Grade {r.grade} · {r.subject === "READING" ? "Reading" : "Language"}</p>
                  <ul className="mt-1 text-xs">{r.groups.map((g) => <li key={g.key} className={g.ok ? "" : "text-amber-900"}>{g.icon} {g.name}: {g.total} (easy {g.low} · mid {g.mid} · hard {g.high}){g.ok ? "" : ` — needs ${Math.max(0, g.need - g.total)} more${g.low < 10 ? ", more easy" : ""}${g.high < 10 ? ", more hard" : ""}`}</li>)}</ul>
                </div>
              ))}</div>
              <p className="mt-2 text-xs text-slate-500">Add questions with Admin → 🤖 AI tools (Gap report) and link skills to MAP areas (Admin → Skills → 🔗).</p>
            </div>
          )}
        </details>
      )}

      {!w ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No practice test yet.{isAdmin ? " Open one above." : " The head of department opens it."}</p> : (
        <>
          <nav className="flex flex-wrap gap-2 print:hidden">{ws.map((x) => <Link key={x.id} href={`/teacher/map-test?w=${x.id}&subject=${subject}`} className={chip(x.id === w.id)}>{x.title}{x.open ? " · open" : ""}</Link>)}</nav>
          <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
            {(["READING", "LANGUAGE"] as const).filter((x) => w.subjects.includes(x)).map((x) => <Link key={x} href={link({ subject: x })} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✏️ Language Usage"}</Link>)}
            <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
            {myClasses.map((c) => <Link key={String(c.id)} href={link({ classId: String(c.id) })} className={chip(c.id === classId)}>{String(c.name)}</Link>)}
            {isAdmin && w.open && <form action={closeWindowAction} className="ms-auto"><input type="hidden" name="windowId" value={w.id} /><button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300">Close the test</button></form>}
          </div>
          <p className="mt-2 text-sm text-slate-500">{w.grade ? `Grade ${w.grade}` : "All grades"} · {w.opensAt.slice(0, 10)} → {w.closesAt.slice(0, 10)} · {w.items} questions per subject</p>

          {school && (
            <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-brand-navy">🏫 All classes</h2>
              <table className="mt-2 min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-1">Class</th><th>Finished</th><th>Average</th><th>On track</th><th>Need support</th><th>Retest?</th></tr></thead>
                <tbody>{school.classes.map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold"><Link href={link({ classId: c.classId })} className="hover:underline">G{c.grade} · {c.className}</Link></td><td>{c.done}/{c.members}</td><td>{c.avg ?? "—"}</td><td className="text-emerald-700">{c.onTrack}</td><td className="text-red-700">{c.offTrack}</td><td>{c.retest || ""}</td></tr>)}</tbody></table>
            </section>
          )}

          {cls && (
            <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-brand-navy">{cls.className} · {subject === "READING" ? "Reading" : "Language Usage"} · {cls.done}/{cls.members} finished{cls.avg ? ` · average ${cls.avg}` : ""}</h2>
                {cls.canEdit && cls.done > 0 && <form action={draftsAction} className="print:hidden"><input type="hidden" name="windowId" value={w.id} /><input type="hidden" name="classId" value={classId} /><input type="hidden" name="subject" value={subject} /><button className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">📋 Make plan drafts from the results</button></form>}
              </div>
              <p className="mt-1 text-sm"><span className="font-semibold text-emerald-700">{cls.onTrack} on track</span> · <span className="font-semibold text-red-700">{cls.offTrack} need support before the real test</span> (expected now = Fall + {w.season === "WINTER" ? "55%" : "100%"} of the projected growth)</p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3">Student</th><th className="px-2">Status</th><th className="px-2">Practice RIT (range)</th><th className="px-2">Fall</th><th className="px-2">Expected now</th><th className="px-2">Spring goal</th><th className="px-2">On track?</th>{cls.rows[0]?.areas.map((a) => <th key={a.key} className="px-2">{a.icon} {a.name}</th>)}</tr></thead>
                  <tbody>{cls.rows.map((r) => (
                    <tr key={r.studentId} className="border-b align-top last:border-0">
                      <td className="py-2 pe-3"><Link href={`/teacher/progress/${r.studentId}`} className="font-semibold text-brand-navy hover:underline">{r.name}</Link>{r.retest && <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" title={`${r.rapidPct}% rapid answers`}>⚡ retest?</span>}</td>
                      <td className="px-2 text-xs">{r.status === "DONE" ? "✅ done" : r.status === "IN_PROGRESS" ? `⏳ ${r.answered}/${r.total}` : "— not started"}</td>
                      <td className="px-2">{r.rit !== null ? <><b className="tabular-nums">{r.rit}</b> <span className="text-xs text-slate-500">({r.low}–{r.high})</span>{r.descriptor && <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${DESC_STYLE[r.descriptor]}`}>{r.descriptor}</span>}</> : "—"}</td>
                      <td className="px-2 tabular-nums">{r.fall ?? "—"}</td><td className="px-2 tabular-nums">{r.expected ?? "—"}</td><td className="px-2 tabular-nums">{r.goal ?? "—"}</td>
                      <td className="px-2">{r.onTrack === null ? "—" : r.onTrack ? <span className="font-semibold text-emerald-700">✓ yes{r.growth !== null ? ` (+${r.growth})` : ""}</span> : <span className="font-semibold text-red-700">✗ needs support</span>}</td>
                      {r.areas.map((a) => <td key={a.key} className="px-2">{a.rit !== null ? <span className={`inline-block rounded-lg px-2 py-0.5 ring-1 ${STATUS_STYLE[a.status ?? "MAINTAIN"]}`}>{a.rit}</span> : "—"}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}

          {acc && (
            <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-brand-navy">🎯 How close was the practice test to the real MAP?</h2>
              {!acc.pairs ? <p className="mt-1 text-sm text-slate-600">After the real {w.season === "WINTER" ? "Winter" : "Spring"} MAP scores are imported, this compares each student's practice score with the real one.</p> : (
                <>
                  <p className="mt-1">On {acc.pairs} students: average difference <b>{acc.meanAbs} RIT</b> · {acc.within5}% within 5 RIT · the practice test was {acc.bias! > 0 ? `${acc.bias} RIT too high` : acc.bias! < 0 ? `${-acc.bias!} RIT too low` : "exact"} on average.</p>
                  {isAdmin && <form action={recalibrateAction} className="mt-2 print:hidden"><input type="hidden" name="windowId" value={w.id} /><input type="hidden" name="subject" value={subject} /><button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">📐 Correct the questions’ RIT from the real MAP</button></form>}
                </>
              )}
            </section>
          )}
        </>
      )}
      <p className="mt-6 text-xs text-slate-500">The practice score is an estimate from the school’s own questions (NWEA’s items are secret). Its accuracy grows each time real scores are compared and the questions are corrected.</p>
    </AppShell>
  );
}
