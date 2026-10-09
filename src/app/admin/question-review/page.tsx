import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { reviewBatch, reviewBatches, type QuestionTags } from "@/server/questions/tag-review";
import { reviewAction } from "./actions";

export const metadata = { title: "Tags & review" };

const LV: Record<string, string> = { BELOW: "🟠 Below", ON: "🔵 On", ABOVE: "🟢 Above" };

/** 🏷️ Every question's tags (derived) and the admin's check: a ~10% random sample per skill, or the whole batch. */
export default async function QuestionReviewPage({ searchParams }: { searchParams: Promise<{ grade?: string; skillId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).map((g) => Number(g.level)).filter((g) => g >= 4 && g <= 6).sort();
  const grade = grades.includes(Number(sp.grade)) ? Number(sp.grade) : grades[0] ?? 4;
  const batches = await reviewBatches(repo, actor, grade);
  const skillId = batches.some((b) => b.skillId === sp.skillId) ? String(sp.skillId) : "";
  const v = skillId ? await reviewBatch(repo, actor, skillId) : null;
  const total = batches.reduce((t, b) => t + b.questions, 0), verified = batches.reduce((t, b) => t + b.verified, 0);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const tag = (label: string, value: string | number | null, warn = false) => <span className={`inline-block rounded-md px-2 py-0.5 text-xs ${value === null || value === "" ? "bg-red-50 text-red-700" : warn ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}><b>{label}:</b> {value === null || value === "" ? "missing" : value}</span>;
  const tags = (t: QuestionTags) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {tag("Grade", t.grade)}{tag("Unit", t.unit)}{tag("Text Set", t.textSet)}{tag("Section", t.section)}{tag("Level", `${LV[t.level]}${t.levelFrom === "DIFFICULTY" ? " (from difficulty)" : ""}`, t.levelFrom === "DIFFICULTY")}
      {tag("Skill", t.skill)}{tag("Standard", t.standard)}{tag("MAP subject", t.mapSubject)}{tag("Goal area", t.goalArea)}{tag("Type", t.type)}{tag("Cognitive", t.cognitive)}{tag("Lexile", t.lexile)}
      {tag("RIT", t.rit.value === null ? null : `${t.rit.band}${t.rit.calibrated ? ` (from ${t.rit.answers} answers)` : " (estimate)"}`, !t.rit.calibrated)}
    </div>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Administration" }} icon="🏷️" title="Question Tags & Review"
        subtitle={<>Every question is in one bank. Its tags come from its place on the Curriculum Map, its skill and standard, and its difficulty — marked <b>Suggested</b> until you check them. Open a skill (one batch), look at the random ~10% sample, fix anything with <b>Edit</b>, then verify the ticked questions or the whole batch.</>}>
        <form action={reviewAction}><input type="hidden" name="grade" value={grade} /><input type="hidden" name="op" value="recalibrate" /><button className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal" title="Uses real answers of students with a MAP score">📐 Recalibrate RIT (Grade {grade})</button></form>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Grade" className="flex flex-wrap gap-2">{grades.map((g) => <Link key={g} href={`/admin/question-review?grade=${g}`} className={chip(g === grade)}>Grade {g}</Link>)}</nav>
      <p className="mt-3 text-sm text-slate-600">Grade {grade}: <b>{verified}</b> of <b>{total}</b> questions verified ({total ? Math.round((verified / total) * 100) : 0}%).</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="max-h-[75vh] overflow-y-auto rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <h2 className="px-2 text-sm font-bold uppercase tracking-wide text-slate-500">Batches (Skills)</h2>
          <ul className="mt-1">{batches.map((b) => (
            <li key={b.skillId}><Link href={`/admin/question-review?grade=${grade}&skillId=${b.skillId}`} aria-current={b.skillId === skillId ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-sm ${b.skillId === skillId ? "bg-brand-navy text-white" : "hover:bg-slate-50"}`}>
              <span className="min-w-0 truncate">{b.skill}</span><span className={`shrink-0 text-xs ${b.verified === b.questions ? "text-emerald-600" : ""}`}>{b.verified === b.questions ? "✓" : `${b.verified}/${b.questions}`}</span>
            </Link></li>
          ))}</ul>
          {!batches.length && <p className="p-2 text-sm text-slate-500">No questions in Grade {grade} yet.</p>}
        </aside>
        <div>
          {!v ? <p className="rounded-3xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">Choose a skill on the left.</p> : (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-bold text-brand-navy">{v.skill}</h2>
              <p className="mt-1 text-sm text-slate-600">{v.total} questions · {v.verified} verified · Levels: {LV.BELOW} {v.summary.levels.BELOW} · {LV.ON} {v.summary.levels.ON} · {LV.ABOVE} {v.summary.levels.ABOVE} · {v.summary.mapSubject ?? "no MAP subject"}{v.summary.goalArea ? ` · ${v.summary.goalArea}` : ""}{v.summary.ritRange ? ` · RIT ${v.summary.ritRange}` : ""}</p>
              {Object.keys(v.summary.missing).length > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Missing tags: {Object.entries(v.summary.missing).map(([k, n]) => `${k} (${n})`).join(" · ")}. Fix them in the question editor or by placing the questions on the Curriculum Map.</p>}
              <form action={reviewAction} className="mt-4">
                <input type="hidden" name="grade" value={grade} /><input type="hidden" name="skillId" value={skillId} />
                <h3 className="font-bold text-slate-700">🎲 Random sample ({v.sample.length} of {v.total})</h3>
                <ul className="mt-2 space-y-3">{v.sample.map((t) => (
                  <li key={t.id} className="rounded-2xl p-3 ring-1 ring-slate-200">
                    <label className="flex items-start gap-3"><input type="checkbox" name="q" value={t.id} defaultChecked={t.review !== "VERIFIED"} className="mt-1 h-4 w-4" />
                      <span className="min-w-0 flex-1"><span className="font-medium text-slate-900">{t.stem.length > 260 ? `${t.stem.slice(0, 260)}…` : t.stem}</span>
                        <span className={`ms-2 rounded-full px-2 py-0.5 text-xs font-bold ${t.review === "VERIFIED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{t.review === "VERIFIED" ? "✓ Verified" : "Suggested"}</span>
                        {tags(t)}</span></label>
                    <Link href={`/admin/questions/${t.id}`} className="ms-7 mt-1 inline-block text-sm font-semibold text-brand-teal underline">✏️ Edit</Link>
                  </li>
                ))}</ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button name="op" value="verify" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">✓ Verify ticked</button>
                  <button name="op" value="batch" className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">✓✓ Verify the whole batch ({v.total})</button>
                  <button name="op" value="undo" className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">↩ Back to “Suggested” (ticked)</button>
                </div>
              </form>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
