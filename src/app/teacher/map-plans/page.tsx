import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { DESC_STYLE, STATUS_STYLE, StatusChip, subjectName } from "@/components/map/map-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { readableClasses } from "@/server/teacher/coordinators";
import { bandSettings, classPlans, GROUPS, smallGroups, type Subject } from "@/server/map/map-plan";
import { classMatrix } from "@/server/map/map-more";
import { rebuildPlanAction, saveBandsAction, savePlanAction, sendCheckAction, sendGroupAction, sendPlanAction } from "./actions";

export const metadata = { title: "MAP plans" };

type Tab = "matrix" | "plans" | "groups";

/**
 * 🗺️ MAP plans for a class, as NWEA reports it: the class matrix (every student × the goal-area groups, band,
 * descriptor, status), a draft plan for every student (preview → edit → send, one or all), small groups.
 */
export default async function MapPlansPage({ searchParams }: { searchParams: Promise<{ classId?: string; subject?: string; tab?: string; msg?: string; open?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const subject: Subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const tab: Tab = sp.tab === "plans" || sp.tab === "groups" ? sp.tab : "matrix";
  const link = (p: Record<string, string>) => `/teacher/map-plans?${new URLSearchParams({ classId, subject, tab, ...p })}`;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const hidden = (t: Tab) => <><input type="hidden" name="classId" value={classId} /><input type="hidden" name="subject" value={subject} /><input type="hidden" name="tab" value={t} /></>;
  const groups = GROUPS.filter((g) => g.subject === subject);
  const isAdmin = actor.role !== "TEACHER";
  const bands = await bandSettings(repo, actor.schoolId);

  const matrix = classId && tab === "matrix" ? await classMatrix(repo, actor, classId, subject) : null;
  const plans = classId && tab === "plans" ? await classPlans(repo, actor, classId, subject) : null;
  const small = classId && tab === "groups" ? await smallGroups(repo, actor, classId, subject) : null;
  const canEdit = matrix?.canEdit ?? plans?.canEdit ?? (classId ? can(actor, "assignments:create") : false);

  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-rit", label: "MAP" }} icon="🗺️" title="MAP Plans"
        subtitle={<>From the NWEA results: each student’s goal areas in <b>RIT bands of {bands.size}</b>, a <b>draft plan</b> you check and edit before sending, and <b>small groups</b> of students who need the same thing.</>}>
        <PrintButton />
        <Link href={`/api/map-matrix-export?${new URLSearchParams({ classId, subject })}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden">⬇ Excel</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No class yet.</p> : (
        <>
          <nav aria-label="Classes" className="flex flex-wrap gap-2 print:hidden">{classes.map((c) => <Link key={String(c.id)} href={link({ classId: String(c.id) })} aria-current={c.id === classId ? "page" : undefined} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>
          <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
            {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={link({ subject: x })} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✏️ Language Usage"}</Link>)}
            <span className="mx-2 h-6 w-px bg-slate-300" aria-hidden="true" />
            {([["matrix", "📊 Class Matrix"], ["plans", "📋 Individual Plans"], ["groups", "👥 Small Groups"]] as const).map(([k, l]) => <Link key={k} href={link({ tab: k })} aria-current={tab === k ? "page" : undefined} className={chip(tab === k)}>{l}</Link>)}
            <Link href={`/teacher/personal-plan?${new URLSearchParams({ classId, subject: subject.toLowerCase() })}`} className={chip(false)}>🎚 3-Level Group Plan</Link>
          </div>

          {matrix && (
            <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-xl font-bold text-brand-navy">{matrix.className} · {subjectName(subject)} · {matrix.rows[0]?.profile.term ?? "no scores yet"}</h2>
                <p className="text-sm text-slate-500">{matrix.rows.length} with scores · lowest RIT first</p>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {matrix.groups.map((g) => <li key={g.key} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200"><b>{g.icon} {g.name}</b>: <span className="text-red-700">{g.focus} focus</span> · {g.maintain} keep · <span className="text-emerald-700">{g.extend} extend</span></li>)}
              </ul>
              {!matrix.rows.length ? <p className="mt-4 text-slate-600">No {subjectName(subject)} MAP scores for this class yet. <Link href="/teacher/map-rit" className="font-semibold text-brand-teal underline">Import the NWEA file or the ASG report</Link> or <Link href="/teacher/map-entry" className="font-semibold text-brand-teal underline">type them</Link>.</p> : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead><tr className="border-b text-xs text-slate-500">
                      <th className="py-2 pe-3">Student</th><th className="px-2">RIT · band</th><th className="px-2">Fall → goal</th><th className="px-2" title="Estimated from careful answers on the platform (last 45 days)">Now ≈</th>
                      {groups.map((g) => <th key={g.key} className="px-2">{g.icon} {g.name}</th>)}<th className="px-2">Plan</th>
                    </tr></thead>
                    <tbody>{matrix.rows.map((r) => (
                      <tr key={r.studentId} className="border-b align-top last:border-0">
                        <td className="py-2 pe-3"><Link href={`/teacher/progress/${r.studentId}`} className="font-semibold text-brand-navy hover:underline">{r.name}</Link>{r.retest && <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" title={`Rapid guessing ${r.profile.overall?.rapidGuessPct}%: NWEA suggests the score may not show what the student knows`}>⚠ retest?</span>}</td>
                        <td className="px-2"><b className="tabular-nums">{r.profile.overall?.rit}</b> <span className="text-xs text-slate-500">{r.profile.overall?.band}</span>{r.profile.overall?.descriptor && <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${DESC_STYLE[r.profile.overall.descriptor]}`}>{r.profile.overall.descriptor}</span>}</td>
                        <td className="px-2 tabular-nums">{r.profile.fall ? `${r.profile.fall.rit} → ${r.profile.fall.projection ?? "?"}` : "—"}</td>
                        <td className="px-2 tabular-nums">{r.estimate ?? "—"}</td>
                        {groups.map((g) => { const a = r.profile.areas.find((x) => x.group === g.key); return <td key={g.key} className={`px-2 ${a?.status ? "" : "text-slate-400"}`}>{a?.rit !== null && a?.rit !== undefined ? <span className={`inline-block rounded-lg px-2 py-1 ring-1 ${STATUS_STYLE[a.status ?? "MAINTAIN"]}`}><b className="tabular-nums">{a.rit}</b> <span className="text-xs">{a.band}</span><br /><span className="text-xs">{a.descriptor}</span></span> : "—"}</td>; })}
                        <td className="px-2 text-xs">{r.plan === "SENT" ? "✅ sent" : r.plan === "DRAFT" ? "📝 draft" : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {matrix.noScores.length > 0 && <p className="mt-3 text-sm text-slate-500">No scores yet: {matrix.noScores.map((x) => x.name).join(", ")}.</p>}
              <p className="mt-3 text-xs text-slate-500">🎯 Focus = Low/LoAvg or 3+ RIT under the student’s own RIT · ✔ Keep it up · 🚀 Extend = HiAvg/High and 3+ over. Descriptors compare with the same grade and season (NWEA 2025 norms).</p>
              {canEdit && matrix.rows.length > 0 && (
                <form action={sendCheckAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200 print:hidden">
                  {hidden("matrix")}
                  <div className="flex-1"><p className="font-bold text-brand-navy">📏 Mid-unit check</p><p className="text-sm text-slate-600">12 short questions at each student’s band (all goal areas). The “Now ≈” column then shows the RIT growth so far.</p></div>
                  <label className="text-sm font-semibold text-slate-700">Due <input type="date" name="dueAt" className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <button className="rounded-xl bg-sky-700 px-4 py-2.5 font-semibold text-white hover:bg-sky-800">Send the check</button>
                </form>
              )}
              {isAdmin && can(actor, "settings:school") && (
                <form action={saveBandsAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 print:hidden">
                  {hidden("matrix")}
                  <p className="flex-1 text-sm text-slate-700"><b>RIT bands</b> (admin): the NWEA reports use bands of 10 points.</p>
                  <label className="text-sm">Band size <input name="size" type="number" min={5} max={20} defaultValue={bands.size} className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5" /></label>
                  <label className="text-sm">From RIT <input name="min" type="number" min={100} max={300} defaultValue={bands.min} className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5" /></label>
                  <label className="text-sm">To RIT <input name="max" type="number" min={150} max={350} defaultValue={bands.max} className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5" /></label>
                  <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Save</button>
                </form>
              )}
            </section>
          )}

          {plans && (
            <section className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-slate-700"><b>{plans.plans.filter((p) => p.status === "DRAFT").length}</b> draft(s) · <b>{plans.plans.filter((p) => p.status === "SENT").length}</b> sent. Each area becomes one adaptive MAP set at the student’s band. {plans.noScores.length > 0 && <span className="text-slate-500">No scores: {plans.noScores.length} student(s).</span>}</p>
                <div className="flex flex-wrap gap-2 print:hidden">
                <Link href={`/teacher/map-plans/print?${new URLSearchParams({ classId, subject })}`} className="rounded-xl px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🖨 Print all plans</Link>
                {plans.canEdit && plans.plans.some((p) => p.status === "DRAFT") && (
                  <form action={sendPlanAction} className="print:hidden">{hidden("plans")}{plans.plans.filter((p) => p.status === "DRAFT").map((p) => <input key={p.id} type="hidden" name="planId" value={p.id} />)}<button className="rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700">📤 Send all drafts ({plans.plans.filter((p) => p.status === "DRAFT").length})</button></form>
                )}
                </div>
              </div>
              {!plans.plans.length && <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No plans: no student of this class has {subjectName(subject)} MAP scores yet.</p>}
              {plans.plans.map((p) => (
                <details key={p.id} open={sp.open === p.id} className="rounded-2xl bg-white ring-1 ring-slate-200">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4">
                    <span><b className="text-brand-navy">{p.name}</b> <span className="text-sm text-slate-600">· RIT {p.profile.overall?.rit ?? "—"}{p.profile.fall?.projection ? ` → goal ${p.profile.fall.projection}` : ""} · {p.items.map((i) => `${i.icon} ${i.name}`).join(", ")}</span></span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${p.status === "SENT" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{p.status === "SENT" ? `✅ Sent ${p.sentAt?.slice(0, 10)}` : "📝 Draft"}</span>
                  </summary>
                  <div className="border-t border-slate-100 p-4">
                    <div className="mb-3 flex flex-wrap gap-2 text-sm">
                      {p.profile.areas.map((a) => <span key={a.group} className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">{a.icon} {a.name}: {a.rit ?? "—"} {a.band ? `(${a.band})` : ""} <StatusChip status={a.status} /></span>)}
                      <Link href={`/map-plan/${p.id}`} className="ms-auto rounded-lg px-3 py-1 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">👁 Preview / PDF</Link>
                    </div>
                    {p.status === "DRAFT" && plans.canEdit ? (
                      <>
                        <form action={savePlanAction} className="space-y-3">
                          {hidden("plans")}<input type="hidden" name="planId" value={p.id} />
                          {p.items.map((it) => (
                            <fieldset key={it.group} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                              <input type="hidden" name="group" value={it.group} />
                              <legend className="px-1 font-bold text-brand-navy">{it.icon} {it.name} <span className="font-normal text-slate-600">· band {it.band} (+ the band above) · {it.questions} questions available</span></legend>
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                <label className="flex items-center gap-1"><input type="checkbox" name={`keep.${it.group}`} defaultChecked /> keep this area</label>
                                <label className="flex items-center gap-1">questions <input type="number" name={`count.${it.group}`} min={5} max={40} defaultValue={it.count} className="w-20 rounded-md border border-slate-300 px-2 py-1" /></label>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">{it.allSkills.map((k) => <label key={k.id} className="flex items-center gap-1"><input type="checkbox" name={`skill.${it.group}`} value={k.id} defaultChecked={it.skillIds.includes(k.id)} /> {k.name}</label>)}</div>
                              <p className="mt-1 text-xs text-slate-500">No skill ticked = all the skills of this area.</p>
                            </fieldset>
                          ))}
                          <div className="flex flex-wrap items-end gap-3 text-sm">
                            <label className="font-semibold text-slate-700">Add an area <select name="addGroup" defaultValue="" className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5"><option value="">—</option>{groups.filter((g) => !p.items.some((i) => i.group === g.key)).map((g) => <option key={g.key} value={g.key}>{g.icon} {g.name}</option>)}</select></label>
                            <label className="font-semibold text-slate-700">Due <input type="date" name="dueAt" defaultValue={p.dueAt?.slice(0, 10) ?? ""} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5" /></label>
                            <label className="flex-1 font-semibold text-slate-700">Note to the student <input name="note" maxLength={1000} defaultValue={p.note ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal" /></label>
                            <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">💾 Save changes</button>
                          </div>
                        </form>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <form action={sendPlanAction}>{hidden("plans")}<input type="hidden" name="planId" value={p.id} /><button className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">📤 Send to {p.name.split(" ")[0]}</button></form>
                          <form action={rebuildPlanAction}>{hidden("plans")}<input type="hidden" name="planId" value={p.id} /><button className="rounded-xl px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">↺ Start over (automatic plan)</button></form>
                        </div>
                      </>
                    ) : (
                      <ul className="space-y-1 text-sm text-slate-700">{p.items.map((it) => <li key={it.group}>{it.icon} <b>{it.name}</b> · band {it.band} · {it.count} questions{it.skills.length ? ` · ${it.skills.map((k) => k.name).join(", ")}` : ""}</li>)}</ul>
                    )}
                  </div>
                </details>
              ))}
            </section>
          )}

          {small && (
            <section className="mt-5 space-y-3">
              <p className="rounded-2xl bg-white p-4 text-slate-700 ring-1 ring-slate-200">Students who need the <b>same area</b> (🎯 Focus) and are in the <b>same RIT band</b>: teach them together, send them one set, or print a worksheet.</p>
              {!small.length && <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No groups of 2 or more yet for {subjectName(subject)}.</p>}
              {small.map((g) => (
                <div key={g.key} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-brand-navy">{g.icon} {g.name} · RIT {g.band} <span className="text-sm font-normal text-slate-500">({g.students.length} students)</span></h3>
                    <Link href={`/teacher/worksheet?${new URLSearchParams({ classId, group: g.group, low: String(g.low), high: String(g.high), title: `${g.name} · RIT ${g.band}` })}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden">🖨 Group worksheet</Link>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{g.students.map((x) => `${x.name} (${x.rit})`).join(" · ")}</p>
                  {canEdit && (
                    <form action={sendGroupAction} className="mt-3 flex flex-wrap items-end gap-3 text-sm print:hidden">
                      {hidden("groups")}<input type="hidden" name="group" value={g.group} /><input type="hidden" name="low" value={g.low} /><input type="hidden" name="high" value={g.high} />
                      {g.students.map((x) => <input key={x.id} type="hidden" name="studentId" value={x.id} />)}
                      <label>Questions <input type="number" name="count" min={5} max={40} defaultValue={15} className="mt-1 block w-20 rounded-md border border-slate-300 px-2 py-1" /></label>
                      <label>Due <input type="date" name="dueAt" className="mt-1 block rounded-md border border-slate-300 px-2 py-1" /></label>
                      <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">📤 Send to this group</button>
                    </form>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
