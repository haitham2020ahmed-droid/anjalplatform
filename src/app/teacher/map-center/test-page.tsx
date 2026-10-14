import Link from "next/link";
import type { TFn } from "@/i18n";
import { ReportHeader, ReportSection } from "@/components/report-kit";
import { EmptyState } from "@/components/ui-kit";
import { BTN_MAIN, BTN_SOFT } from "@/components/plans/plan-builder";
import { PassageText } from "@/components/passage-text";
import { DESC_STYLE } from "@/components/map/map-ui";
import { repo } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import { studentNames } from "@/server/insights/student-data";
import { worksheetView, MAX_WORKSHEET, type SheetView } from "@/server/teacher/worksheet";
import { ESTIMATE_NOTE, MANUAL_RANGE, AUTO_RANGE, SUBJECT_NAME, groupsOf, studentItems, testDetail, testPool, testReport, type TestDetail } from "@/server/map/map-test";
import type { GroupKey, Subject } from "@/server/map/map-plan";
import { excludeAction, itemOpAction, mapTimeAction, updateMapTestAction } from "./test-actions";
import { LiveTimePanel } from "@/components/live-time-panel";
import { draftsAction, recalibrateAction } from "../map-test/actions";
import { mapTestHref } from "./href";
import { STATUS_CHIP, STATUS_LABEL } from "./test-tab";
import { RichInline } from "@/components/rich-inline";
import { stripMarks } from "@/lib/inline-marks";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const box = "mt-1 block min-h-11 rounded-lg border border-slate-300 px-2";
const small = "inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-40";

/**
 * One MAP test: details AND reports on the same page — who and when, the items (manual) or the pool (automatic) with
 * Edit (everything before anyone starts, then only the dates and the students), progress, each student's estimated
 * RIT with its range, percentile, goal areas, latest real MAP and the Spring goal, the class summary with ready-made
 * groups ("Make a plan"), the item analysis and, after the real MAP, predicted vs real. Excel + PDF downloads.
 */
export async function MapTestPage({ actor, t, id, sp }: { actor: Actor; t: TFn; id: string; sp: SP }) {
  const d = await testDetail(repo, actor, id);
  const subject: Subject = d.v.subjects.includes(one(sp.subject) as Subject) ? (one(sp.subject) as Subject) : d.subject;
  if (one(sp.view) === "print" && d.v.kind === "MANUAL") return <PrintView actor={actor} t={t} d={d} />;
  const area = (groupsOf(d.subject).find((g) => g.key === one(sp.area))?.key ?? null) as GroupKey | null;
  const [r, pool, picked] = await Promise.all([
    testReport(repo, actor, id, subject),
    testPool(repo, actor, id, { area }),
    one(sp.student) ? studentItems(repo, actor, id, one(sp.student), subject).catch(() => null) : Promise.resolve(null),
  ]);
  const editable = d.canEdit && !d.started;
  const href = (p: Record<string, string>) => mapTestHref(id, { subject, ...p });
  const msg = one(sp.msg);
  const dl = (format: string) => `/api/map-test/export?${new URLSearchParams({ id, subject, format })}`;
  return (
    <>
      <ReportHeader back={{ href: `/teacher/map-center?${new URLSearchParams({ tab: "test", subject })}`, label: "MAP Test" }} icon="🧭" title={d.v.title}
        subtitle={`${t(d.v.kind === "AUTO" ? "Automatic MAP test (simulates MAP Growth)" : "Manual test")} · ${t(SUBJECT_NAME[subject])}`}
        downloads={[{ href: dl("xlsx"), label: "Excel", icon: "📊" }, { href: dl("pdf"), label: "PDF", icon: "📄" }]}
        filters={d.v.subjects.length > 1 ? <div className="flex gap-2">{d.v.subjects.map((x) => <Link key={x} href={href({ subject: x })} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${x === subject ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{t(SUBJECT_NAME[x])}</Link>)}</div> : undefined}>
        {d.v.kind === "MANUAL" && <Link href={`${mapTestHref(id)}/preview`} className={BTN_SOFT}>👁 {t("Preview as students see it")}</Link>}
        {d.v.kind === "MANUAL" && <Link href={href({ view: "print" })} className={BTN_SOFT}>🖨 {t("Print with answer key")}</Link>}
      </ReportHeader>
      {msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{msg}</p>}

      <Details t={t} d={d} />
      {d.v.kind === "MANUAL" ? <ManualItems t={t} d={d} editable={editable} pool={pool} area={area} /> : <AutoPool t={t} d={d} editable={editable} pool={pool} area={area} />}

      <ReportSection title="Progress" icon="⏳">
        <ul className="grid gap-3 sm:grid-cols-4">
          {[["Finished", r.progress.finished, "text-emerald-700"], ["Started", r.progress.started - r.progress.finished, "text-sky-700"], ["Not started", r.progress.notStarted, "text-slate-700"], ["Rapid-guess flags", r.progress.rapidFlags, "text-amber-800"]].map(([k, n, c]) => (
            <li key={String(k)} className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-600">{t(String(k))}</p><p className={`text-3xl font-bold tabular-nums ${c}`}>{n}</p></li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="Results" icon="📊" hint={t(ESTIMATE_NOTE)}>
        {!r.students.length ? <EmptyState compact icon="👥" title="No students yet" text="Choose the classes or students above." /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-start text-sm">
              <thead><tr className="border-b text-xs text-slate-500">
                <th className="py-2 pe-3 text-start">{t("Student")}</th><th className="px-2 text-start">{t("Status")}</th><th className="px-2 text-start">{t("Estimated RIT (range)")}</th><th className="px-2 text-start">{t("Percentile")}</th>
                {groupsOf(subject).map((g) => <th key={g.key} className="px-2 text-start">{g.icon} {t(g.name)}</th>)}
                <th className="px-2 text-start">{t("Latest real MAP")}</th><th className="px-2 text-start">{t("Spring goal")}</th><th className="px-2 text-start">{t("On track?")}</th><th className="px-2 text-start print:hidden">{t("Items")}</th>
              </tr></thead>
              <tbody>{r.students.map((x) => (
                <tr key={x.studentId} className="border-b align-top last:border-0">
                  <td className="py-2 pe-3"><Link href={`/teacher/students/${x.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link><span className="block text-xs text-slate-500">{x.className}</span>{x.retest && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" title={`${x.rapidPct}%`}>⚡ {t("retest?")}</span>}</td>
                  <td className="px-2 text-xs">{x.status === "DONE" ? `✅ ${t("Finished")}` : x.status === "IN_PROGRESS" ? `⏳ ${x.answered}/${x.total}` : `— ${t("Not started")}`}</td>
                  <td className="px-2">{x.rit !== null ? <><b className="tabular-nums">{x.rit}</b> <span className="text-xs text-slate-500" dir="ltr">({x.low}–{x.high}{x.se !== null ? ` · ±${x.se}` : ""})</span>{x.descriptor && <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${DESC_STYLE[x.descriptor]}`}>{x.descriptor}</span>}</> : "—"}</td>
                  <td className="px-2 tabular-nums">{x.percentile ?? "—"}</td>
                  {x.areas.map((a) => <td key={a.key} className="px-2 tabular-nums">{a.rit ?? "—"}{a.n ? <span className="block text-xs text-slate-500">{a.ok}/{a.n}</span> : null}</td>)}
                  <td className="px-2 tabular-nums">{x.real ? <>{x.real.rit}<span className="block text-xs text-slate-500">{x.real.term}</span></> : "—"}</td>
                  <td className="px-2 tabular-nums">{x.goal ?? "—"}</td>
                  <td className="px-2">{x.onTrack === null ? "—" : x.onTrack ? <span className="font-semibold text-emerald-700">✓ {t("yes")}{x.growth !== null ? ` (${x.growth >= 0 ? "+" : ""}${x.growth})` : ""}</span> : <span className="font-semibold text-red-700">✗ {t("needs support")}</span>}</td>
                  <td className="px-2 print:hidden">{x.status !== "NOT_STARTED" && <Link href={href({ student: x.studentId }) + "#student-items"} className="text-xs font-semibold text-brand-teal underline">{t("Items")}</Link>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">{t("The percentile compares the estimate with NWEA's national norms. On track = at least the expected RIT now (Fall + the share of the projected growth).")}</p>
      </ReportSection>

      {picked && (
        <ReportSection id="student-items" title="Items this student got" icon="🔎" hint={picked.name}>
          <ol className="grid gap-1 text-sm">{picked.items.map((it) => (
            <li key={it.n} className="flex flex-wrap gap-2 border-b py-1 last:border-0"><span className="w-8 tabular-nums text-slate-500">{it.n}.</span><span className={it.correct ? "text-emerald-700" : "text-red-700"}>{it.correct ? "✓" : "✗"}</span><span className="text-xs text-slate-600">{t(it.areaName)} · RIT {it.rit} · {it.seconds}s{it.rapid ? ` · ⚡ ${t("rapid")}` : ""}</span><span className="min-w-0 flex-1"><RichInline text={it.stem} /></span></li>
          ))}</ol>
        </ReportSection>
      )}

      <ReportSection title="Class summary" icon="🏫">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-600">{t("Average RIT")}</p><p className="text-3xl font-bold tabular-nums text-brand-navy">{r.summary.avg ?? "—"}</p><p className="text-xs text-slate-500">{t("Median")}: {r.summary.median ?? "—"} · {t("On track")}: {r.summary.onTrack} · {t("Need support")}: {r.summary.offTrack}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-600">{t("RIT distribution")}</p>
            <ul className="mt-1 space-y-1">{r.summary.distribution.map((b) => <li key={b.band} className="flex items-center gap-2 text-xs"><span className="w-16 tabular-nums" dir="ltr">{b.band}</span><span className="h-2 rounded bg-brand-teal" style={{ width: `${Math.max(6, 12 * b.n)}px` }} /><span className="tabular-nums">{b.n}</span></li>)}</ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-600">{t("Goal areas (average RIT)")}</p>
            <ul className="mt-1 text-sm">{r.summary.areas.map((a) => <li key={a.key}>{a.icon} {t(a.name)}: <b className="tabular-nums">{a.avg ?? "—"}</b></li>)}</ul>
            {r.summary.weakest && <p className="mt-1 text-xs">{t("Strongest")}: <b>{t(r.summary.strongest ?? "")}</b> · {t("Weakest")}: <b>{t(r.summary.weakest)}</b></p>}
          </div>
        </div>
        {r.groups.length > 0 && (
          <>
            <h3 className="mt-5 font-semibold text-brand-navy">{t("Ready-made groups (each student's lowest goal area)")}</h3>
            <ul className="mt-2 grid gap-3 md:grid-cols-2">{r.groups.map((g) => (
              <li key={g.key} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="font-semibold text-brand-navy">{g.icon} {t(g.name)} · <bdi>{g.className}</bdi> <span className="text-sm font-normal text-slate-500">({g.students.length})</span></p>
                <p className="mt-1 text-sm text-slate-700">{g.students.map((st) => `${st.name} (${st.rit})`).join(", ")}</p>
                <Link href={g.href} className={`${BTN_MAIN} mt-2 print:hidden`}>🎯 {t("Make a plan")}</Link>
              </li>
            ))}</ul>
            {d.canEdit && <div className="mt-3 flex flex-wrap gap-2 print:hidden">{d.classes.map((c) => <form key={c.id} action={draftsAction}><input type="hidden" name="windowId" value={id} /><input type="hidden" name="classId" value={c.id} /><input type="hidden" name="subject" value={subject} /><button className={BTN_SOFT}>📋 {t("Make individual plan drafts")} · <bdi>{c.name}</bdi></button></form>)}</div>}
          </>
        )}
      </ReportSection>

      <ReportSection title="Item analysis" icon="🧪" hint={t("% correct of careful answers (rapid guesses are not counted) and the most chosen wrong answer.")}>
        {!r.items.length ? <p className="text-sm text-slate-600">{t("No answers yet.")}</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-start text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-2 text-start">#</th><th className="px-2 text-start">{t("Goal area")}</th><th className="px-2 text-start">RIT</th><th className="px-2 text-start">{t("Answers")}</th><th className="px-2 text-start">{t("Correct")}</th><th className="px-2 text-start">{t("Most chosen wrong answer")}</th><th className="px-2 text-start">{t("Question")}</th></tr></thead>
            <tbody>{r.items.slice(0, 120).map((x) => <tr key={x.questionId} className="border-b align-top last:border-0"><td className="py-1.5 pe-2 tabular-nums">{x.n}</td><td className="px-2">{t(x.areaName)}</td><td className="px-2 tabular-nums">{x.rit}</td><td className="px-2 tabular-nums">{x.answered}</td><td className={`px-2 tabular-nums ${x.pct !== null && x.pct < 40 ? "font-semibold text-red-700" : ""}`}>{x.pct === null ? "—" : `${x.pct}%`}</td><td className="px-2">{x.topWrong ? `${x.topWrong} (${x.topWrongCount})` : "—"}</td><td className="px-2 text-slate-700"><RichInline text={x.stem} /></td></tr>)}</tbody>
          </table></div>
        )}
      </ReportSection>

      <ReportSection title="How close was it to the real MAP?" icon="🎯">
        {!r.accuracy.pairs ? <p className="text-sm text-slate-600">{t("After the real MAP scores are imported, this compares each student's estimate with the real score.")}</p> : (
          <>
            <p>{t("On {n} students: average difference {d} RIT · {w}% within 5 RIT.", { n: r.accuracy.pairs, d: r.accuracy.meanAbs ?? 0, w: r.accuracy.within5 ?? 0 })}</p>
            {actor.role !== "TEACHER" && <form action={recalibrateAction} className="mt-2 print:hidden"><input type="hidden" name="windowId" value={id} /><input type="hidden" name="subject" value={subject} /><button className={BTN_SOFT}>📐 {t("Correct the questions’ RIT from the real MAP")}</button></form>}
            <table className="mt-2 text-sm"><thead><tr className="text-xs text-slate-500"><th className="pe-4 text-start">{t("Student")}</th><th className="pe-4 text-start">{t("Predicted")}</th><th className="text-start">{t("Real")}</th></tr></thead>
              <tbody>{r.accuracy.rows.slice(0, 60).map((x, i) => <tr key={i}><td className="pe-4"><bdi>{x.name}</bdi></td><td className="pe-4 tabular-nums">{x.predicted}</td><td className="tabular-nums">{x.actual}</td></tr>)}</tbody></table>
          </>
        )}
      </ReportSection>
      <p className="mt-2 text-xs text-slate-500">{t(ESTIMATE_NOTE)}</p>
    </>
  );
}

/** Who, when, how many items, the goal areas; Edit forms (content before anyone starts; dates and students always). */
async function Details({ t, d }: { t: TFn; d: TestDetail }) {
  const editable = d.canEdit && !d.started;
  let roster: { id: string; name: string; students: { id: string; name: string }[] }[] = [];
  if (d.canEdit && d.v.classIds) {
    const members = d.classes.length ? await repo.findMany("ClassMembership", { classId: { in: d.classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"], take: 2000 }) : [];
    const names = await studentNames(repo, [...new Set(members.map((m) => String(m.studentId)))]);
    roster = d.classes.map((c) => ({ ...c, students: members.filter((m) => m.classId === c.id).map((m) => ({ id: String(m.studentId), name: names.get(String(m.studentId))?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)) }));
  }
  const chosen = new Set((d.students ?? []).map((x) => x.id));
  return (
    <ReportSection title="Details" icon="📋" actions={<span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_CHIP[d.status]}`}>{t(STATUS_LABEL[d.status])}</span>}>
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-slate-500">{t("Classes")}</dt><dd className="font-semibold"><bdi>{d.classes.map((c) => c.name).join(", ") || (d.v.grade ? `Grade ${d.v.grade}` : "—")}</bdi></dd></div>
        <div><dt className="text-slate-500">{t("Students")}</dt><dd className="font-semibold">{d.students ? d.students.map((x) => x.name).join(", ") : t("The whole class")}</dd></div>
        <div><dt className="text-slate-500">{t("Dates")}</dt><dd className="font-semibold tabular-nums" dir="ltr">{d.v.opensAt.slice(0, 10)} → {d.v.closesAt.slice(0, 10)}</dd></div>
        <div><dt className="text-slate-500">{t("Questions")}</dt><dd className="font-semibold tabular-nums">{d.v.items}</dd></div>
      </dl>
      <p className="mt-3 text-sm">{d.plan.map((p) => <span key={p.key} className="me-3 inline-block">{p.icon} {t(p.name)}: <b className="tabular-nums">{d.v.kind === "AUTO" ? `${p.n} (${d.shares[p.key]}%)` : d.items.filter((x) => x.area === p.key).length}</b></span>)}</p>
      {d.started && <p className="mt-2 text-sm text-amber-900">{t("Students have started: only the dates and the students can change now.")}</p>}
      {d.canEdit && (
        <details className="mt-3 rounded-2xl bg-slate-50 p-3 print:hidden">
          <summary className="flex min-h-10 cursor-pointer items-center font-semibold text-brand-navy">✏️ {t("Edit")}</summary>
          <div className="mt-3 grid gap-4">
            <form action={updateMapTestAction} className="flex flex-wrap items-end gap-3 text-sm">
              <input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="part" value="dates" />
              <label className="font-semibold">{t("Opens")}<input name="opensAt" type="date" defaultValue={d.v.opensAt.slice(0, 10)} className={box} /></label>
              <label className="font-semibold">{t("Closes")}<input name="closesAt" type="date" defaultValue={d.v.closesAt.slice(0, 10)} className={box} /></label>
              <button className={BTN_SOFT}>{t("Save dates")}</button>
            </form>
            {roster.length > 0 && (
              <form action={updateMapTestAction} className="text-sm">
                <input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="part" value="who" />
                {roster.map((c) => (
                  <fieldset key={c.id} className="mb-2"><legend className="font-semibold"><label className="inline-flex items-center gap-2"><input type="checkbox" name="classIds" value={c.id} defaultChecked /> <bdi>{c.name}</bdi></label></legend>
                    <div className="mt-1 grid gap-1 sm:grid-cols-3">{c.students.map((st) => <label key={st.id} className="inline-flex items-center gap-2"><input type="checkbox" name="studentIds" value={st.id} defaultChecked={chosen.has(st.id)} /> <bdi>{st.name}</bdi></label>)}</div>
                  </fieldset>
                ))}
                <p className="text-xs text-slate-500">{t("Only some students (leave empty for the whole class)")}</p>
                <button className={`${BTN_SOFT} mt-2`}>{t("Save students")}</button>
              </form>
            )}
            {editable && (
              <form action={updateMapTestAction} className="flex flex-wrap items-end gap-3 text-sm">
                <input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="part" value="settings" />
                <label className="font-semibold">{t("Title")}<input name="title" defaultValue={d.v.title} className={`${box} w-72`} /></label>
                {d.v.kind === "AUTO" && <label className="font-semibold">{t("Questions")}<input name="items" type="number" min={AUTO_RANGE.min} max={AUTO_RANGE.max} defaultValue={d.v.items} className={`${box} w-24`} /></label>}
                {d.v.kind === "AUTO" && d.plan.map((p) => <label key={p.key} className="font-semibold">{p.icon} {t(p.name)} %<input name={`share_${p.key}`} type="number" min={0} max={100} defaultValue={d.shares[p.key]} className={`${box} w-20`} /></label>)}
                <button className={BTN_SOFT}>{t("Save")}</button>
              </form>
            )}
            {d.status === "open" && <form action={updateMapTestAction}><input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="part" value="close" /><button className={BTN_SOFT}>{t("Close the test now")}</button></form>}
          </div>
        </details>
      )}
      {d.canEdit && !d.v.draft && d.status !== "closed" && <LiveTimePanel t={t} action={mapTimeAction} hidden={{ id: d.v.id }} minutes={d.v.minutes} endsAt={d.v.closesAt} extra={d.extra} roster={roster.flatMap((c) => c.students)} untimedAllowed />}
      {d.v.draft && d.canEdit && (
        <form action={updateMapTestAction} className="mt-3 print:hidden"><input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="part" value="publish" />
          <button className={BTN_MAIN}>✅ {t("Assign online (graded automatically)")}</button>
          <span className="ms-2 text-xs text-slate-500">{t("Students see it in My Work and in My MAP from the open date.")}</span>
        </form>
      )}
    </ReportSection>
  );
}

type Pool = Awaited<ReturnType<typeof testPool>>;

/** Manual test: the items in order with remove / move / replace; add by goal area or pick one by one; suggest again. */
function ManualItems({ t, d, editable, pool, area }: { t: TFn; d: TestDetail; editable: boolean; pool: Pool; area: GroupKey | null }) {
  const op = (name: string, label: string, qid: string, disabled = false) => (
    <form action={itemOpAction}><input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="op" value={name} /><input type="hidden" name="questionId" value={qid} /><button disabled={disabled} className={small} title={t(label)}>{label === "Up" ? "↑" : label === "Down" ? "↓" : t(label)}</button></form>
  );
  const shown = pool.find((p) => p.key === area);
  const m = d.settings;
  return (
    <ReportSection id="items" title="Questions" icon="📝" hint={t("{n} question(s) · RIT {lo}–{hi}", { n: d.items.length, lo: m?.ritLow ?? "—", hi: m?.ritHigh ?? "—" })}>
      <ol className="grid gap-2">{d.items.map((x, i) => (
        <li key={x.id} className="flex flex-wrap items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="w-7 tabular-nums font-semibold text-slate-500">{x.n}.</span>
          <span className="min-w-0 flex-1"><span className="text-xs text-slate-500">{t(x.name)} · RIT {x.rit}</span><span className="block">{stripMarks(x.stem).slice(0, 220)}</span></span>
          {editable && <span className="flex gap-1 print:hidden">{op("up", "Up", x.id, i === 0)}{op("down", "Down", x.id, i === d.items.length - 1)}{op("replace", "Replace", x.id)}{op("remove", "Remove", x.id)}</span>}
        </li>
      ))}</ol>
      {editable && (
        <div className="mt-4 grid gap-4 print:hidden">
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{t("Add a question:")}</span>
            {pool.map((p) => <form key={p.key} action={itemOpAction}><input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="op" value="add" /><input type="hidden" name="area" value={p.key} /><button className={small} disabled={d.items.length >= MANUAL_RANGE.max}>＋ {p.icon} {t(p.name)}</button></form>)}
          </div>
          <div className="text-sm"><span className="font-semibold">{t("Pick questions one by one:")}</span> {pool.map((p) => <Link key={p.key} href={mapTestHref(d.v.id, { area: p.key }) + "#items"} className={`ms-2 inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold ${area === p.key ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300"}`}>{p.icon} {t(p.name)} ({p.total})</Link>)}</div>
          {shown && (
            <ul className="max-h-[28rem] overflow-y-auto rounded-xl ring-1 ring-slate-200">{shown.items.map((q) => (
              <li key={q.id} className="flex items-start gap-2 border-b px-3 py-2 text-sm last:border-0">
                <span className="w-16 shrink-0 text-xs tabular-nums text-slate-500">RIT {q.rit}</span><span className="min-w-0 flex-1"><RichInline text={q.stem} /></span>
                {q.inTest ? <span className="text-xs text-emerald-700">✓ {t("in the test")}</span> : <form action={itemOpAction}><input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="op" value="add" /><input type="hidden" name="area" value={shown.key} /><input type="hidden" name="questionId" value={q.id} /><button className={small}>＋ {t("Add")}</button></form>}
              </li>
            ))}</ul>
          )}
          <details className="rounded-2xl bg-slate-50 p-3"><summary className="cursor-pointer font-semibold text-brand-navy">✨ {t("Suggest for me again")}</summary>
            <form action={itemOpAction} className="mt-2 flex flex-wrap items-end gap-3 text-sm">
              <input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="op" value="resuggest" />
              {groupsOf(d.subject).map((g) => <label key={g.key} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" name="areas" value={g.key} defaultChecked={!m || m.areas.includes(g.key)} /> {g.icon} {t(g.name)}</label>)}
              <label className="font-semibold">{t("Questions")}<input name="count" type="number" min={MANUAL_RANGE.min} max={MANUAL_RANGE.max} defaultValue={m?.count ?? d.items.length} className={`${box} w-24`} /></label>
              <label className="font-semibold">{t("RIT from")}<input name="ritLow" type="number" defaultValue={m?.ritLow ?? 190} className={`${box} w-24`} /></label>
              <label className="font-semibold">{t("RIT to")}<input name="ritHigh" type="number" defaultValue={m?.ritHigh ?? 225} className={`${box} w-24`} /></label>
              <button className={BTN_SOFT}>{t("Suggest for me")}</button>
            </form>
          </details>
        </div>
      )}
    </ReportSection>
  );
}

/** Automatic test: the pool of each goal area (counts, RIT range); one area's questions with "take out" boxes. */
function AutoPool({ t, d, editable, pool, area }: { t: TFn; d: TestDetail; editable: boolean; pool: Pool; area: GroupKey | null }) {
  const shown = pool.find((p) => p.key === area);
  return (
    <ReportSection id="items" title="Item pool" icon="🗃️" hint={t("Each student gets different questions from this pool (closest to their estimate). Take out any question you do not want.")}>
      <ul className="grid gap-3 sm:grid-cols-3">{pool.map((p) => (
        <li key={p.key}><Link href={mapTestHref(d.v.id, { area: p.key }) + "#items"} className={`block rounded-2xl p-4 ring-1 ${area === p.key ? "bg-sky-50 ring-brand-teal" : "bg-slate-50 ring-slate-200 hover:ring-brand-teal"}`}>
          <p className="font-semibold text-brand-navy">{p.icon} {t(p.name)}</p>
          <p className="text-sm tabular-nums">{t("{n} questions", { n: p.total })} · RIT {p.low}–{p.high}{p.excluded ? ` · ${t("{n} taken out", { n: p.excluded })}` : ""}</p>
        </Link></li>
      ))}</ul>
      {shown && (
        <form action={excludeAction} className="mt-4">
          <input type="hidden" name="id" value={d.v.id} /><input type="hidden" name="area" value={shown.key} />
          <ul className="max-h-[28rem] overflow-y-auto rounded-xl ring-1 ring-slate-200">{shown.items.map((q) => (
            <li key={q.id} className="flex items-start gap-2 border-b px-3 py-2 text-sm last:border-0">
              <label className="inline-flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" name="exclude" value={q.id} defaultChecked={q.excluded} disabled={!editable} /> {t("Take out")}</label>
              <span className="w-16 shrink-0 text-xs tabular-nums text-slate-500">RIT {q.rit}</span><span className={`min-w-0 flex-1 ${q.excluded ? "text-slate-400 line-through" : ""}`}><RichInline text={q.stem} /></span>
            </li>
          ))}</ul>
          {shown.total > shown.items.length && <p className="mt-1 text-xs text-slate-500">{t("Showing the first {n} (easiest first).", { n: shown.items.length })}</p>}
          {editable && <button className={`${BTN_SOFT} mt-2`}>{t("Save the pool")}</button>}
        </form>
      )}
    </ReportSection>
  );
}

/** Print: the manual test as a paper booklet (passages once), then the answer key on its own page. */
async function PrintView({ actor, t, d }: { actor: Actor; t: TFn; d: TestDetail }) {
  const ids = d.items.map((x) => x.id);
  const parts: SheetView[] = [];
  for (let i = 0; i < ids.length; i += MAX_WORKSHEET) parts.push(await worksheetView(repo, actor, { ids: ids.slice(i, i + MAX_WORKSHEET), title: d.v.title }));
  let offset = 0;
  const numbered = parts.map((p) => { const o = offset; offset += p.count; return { p, o }; });
  // the key's number → the item (passages keep their questions together, so the paper order can differ from the list)
  const byId = new Map(d.items.map((x) => [x.id, x]));
  const itemAt = new Map(numbered.flatMap(({ p, o }) => p.blocks.flatMap((b) => b.questions.map((q) => [q.n + o, byId.get(q.id)] as const))));
  return (
    <>
      <div className="print:hidden"><ReportHeader back={{ href: mapTestHref(d.v.id), label: "MAP Test" }} icon="🖨" title={d.v.title} subtitle="Print or “Save as PDF”. The answer key prints on its own page." /></div>
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-8 text-slate-900 shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <div className="grid grid-cols-3 gap-4 border-b-2 border-slate-800 pb-3 text-sm"><p>Name: ____________________</p><p>Class: ____________</p><p>Date: ____________</p></div>
        <h1 className="mt-4 text-2xl font-bold">{d.v.title}</h1>
        {numbered.map(({ p, o }) => p.blocks.map((b, bi) => (
          <section key={`${o}-${bi}`} className="mt-5 break-inside-avoid-page">
            {b.passage && <div className="mb-3 rounded-xl border border-slate-300 p-4"><h2 className="text-lg font-bold">{b.passage.title || "Read the text."}</h2><PassageText text={b.passage.text} paraClassName="mt-2 whitespace-pre-line leading-relaxed" headingClassName="mt-3 font-bold" /></div>}
            <ol className="space-y-4">{b.questions.map((q) => (
              <li key={q.id} className="break-inside-avoid">
                <p className="font-semibold">{q.n + o}. <RichInline text={q.stem.replace(/_{3,}/g, "__________")} /></p>
                {q.options.length > 0 && <ul className="mt-1 grid gap-1 ps-5 sm:grid-cols-2">{q.options.map((op) => <li key={op.label}>{op.label}. <RichInline text={op.text} /></li>)}</ul>}
                {q.type === "TRUE_FALSE" && <p className="mt-1 ps-5">True ☐ False ☐</p>}
                {q.elements.length > 0 && <ul className="mt-1 ps-5">{q.elements.map((e, k) => <li key={k}>___ {e}</li>)}</ul>}
                {q.segments.length > 0 && <p className="mt-1 ps-5">{q.segments.map((sg, k) => <span key={k} className="me-1 border-b border-dotted border-slate-500">{sg}</span>)}</p>}
                {Array.from({ length: q.lines }).map((_, k) => <p key={k} className="mt-3 border-b border-slate-400">&nbsp;</p>)}
              </li>
            ))}</ol>
          </section>
        )))}
        <section className="mt-10 break-before-page border-t-2 border-dashed border-slate-400 pt-4 print:border-0">
          <h2 className="text-xl font-bold">{t("Answer key")} · {d.v.title}</h2>
          <ol className="mt-2 columns-2 gap-8 text-sm">{numbered.flatMap(({ p, o }) => p.key.map((k) => <li key={k.n + o} className="break-inside-avoid">{k.n + o}. {k.answer} <span className="text-xs text-slate-500">({t(itemAt.get(k.n + o)?.name ?? "")} · RIT {itemAt.get(k.n + o)?.rit ?? "—"})</span></li>))}</ol>
        </section>
      </article>
    </>
  );
}
