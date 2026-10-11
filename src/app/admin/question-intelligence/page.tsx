import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, BandBar, Callout, ReportHeader, SimpleBar } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { coverage, intelligenceOverview, missingList, COVERAGE_TARGET } from "@/server/questions/intelligence";
import { META_FIELDS, type MetaField } from "@/questions/intelligence";
import { analyzeAction, confirmSkillAction, duplicatesAction, reanalyzeAllAction } from "./actions";

export const metadata = { title: "Question Intelligence" };
const FLAG: Record<string, { label: string; tone: string }> = {
  INSUFFICIENT: { label: `Under ${COVERAGE_TARGET}`, tone: "bg-red-50 text-red-800 ring-red-200" },
  NEEDS_ADVANCED: { label: "Needs hard questions", tone: "bg-amber-50 text-amber-900 ring-amber-200" },
  POOR_DISTRIBUTION: { label: "Unbalanced levels", tone: "bg-violet-50 text-violet-900 ring-violet-200" },
  LOW_DOK: { label: "No DOK 3+", tone: "bg-sky-50 text-sky-900 ring-sky-200" },
};

/** 🧠 Every question as a learning object: what is complete, missing, to review; coverage by skill; duplicates. */
export default async function QuestionIntelligencePage({ searchParams }: { searchParams: Promise<{ tab?: string; field?: string; grade?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const tab = sp.tab === "coverage" || sp.tab === "missing" ? sp.tab : "overview";
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  const grade = grades.includes(Number(sp.grade)) ? Number(sp.grade) : grades[0];
  const field = (META_FIELDS.find((f) => f.key === sp.field)?.key ?? "dok") as MetaField;
  const o = await intelligenceOverview(repo, actor.schoolId!);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const tile = "rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200";
  const pct = (a: number) => (o.total ? Math.round((100 * a) / o.total) : 0);
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/admin", label: "Home" }} icon="🧠" title="Question Intelligence"
        subtitle="Every question as a learning object: skill, standard, MAP domain, difficulty, DOK, reading level and the misconception behind each wrong option. Automatic values keep their source; disagreements and duplicates wait for a person's review. Nothing is published automatically."
        filters={<nav className="flex flex-wrap gap-2" aria-label="Sections">
          <Link href="/admin/question-intelligence" className={chip(tab === "overview")}>Overview</Link>
          <Link href="/admin/question-intelligence?tab=missing" className={chip(tab === "missing")}>Missing metadata</Link>
          <Link href={`/admin/question-intelligence?tab=coverage&grade=${grade}`} className={chip(tab === "coverage")}>Coverage</Link>
        </nav>} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={analyzeAction}><button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">🧠 Analyse new questions ({o.notAnalysed})</button></form>
        <form action={duplicatesAction}><button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">👯 Find duplicates</button></form>
        <form action={reanalyzeAllAction}><button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">🔁 Re-analyse all</button></form>
        <Link href="/admin/ai-tools?tab=review" className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">Review queue ({o.openSuggestions} questions) →</Link>
      </div>

      {tab === "overview" && (<>
        <AtAGlance className="mt-4" items={[
          { icon: "🗃️", label: "Total questions", value: o.total, meaning: `${o.published} published` },
          { icon: "✅", label: "Complete & confirmed", value: o.complete, meaning: `${pct(o.complete)}%`, tone: "good" },
          { icon: "🤖", label: "Completed automatically", value: o.autoCompleted, meaning: `${pct(o.autoCompleted)}% · confirm by skill (Coverage)`, tone: "info" },
          { icon: "⚠️", label: "Missing metadata", value: o.missingAny, meaning: `${pct(o.missingAny)}%`, tone: o.missingAny ? "warn" : "good" },
          { icon: "👀", label: "Requiring review", value: o.needsReview, meaning: "drafts, flags, suggestions", tone: o.needsReview ? "bad" : "good" },
        ]} />
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <BandBar label="Questions" parts={[{ key: "GOOD", value: o.complete, label: "Complete & confirmed" }, { key: "OK", value: o.autoCompleted, label: "Completed automatically" }, { key: "LOW", value: o.missingAny, label: "Missing metadata" }]} />
          </div>
          <Callout kind="next" items={[
            o.notAnalysed ? `Analyse the ${o.notAnalysed} new questions (button above).` : null,
            o.openSuggestions ? `Review the ${o.openSuggestions} questions in the review queue.` : null,
            o.missingAny ? "Fill the field with the most missing values first (list below)." : null,
          ]} />
        </div>
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className={tile}>
            <h2 className="mb-2 font-bold text-brand-navy">Missing, by field</h2>
            <SimpleBar unit="" bands={false} max={Math.max(1, o.total)} items={META_FIELDS.map((f) => ({ label: f.label, value: o.missing[f.key], href: `/admin/question-intelligence?tab=missing&field=${f.key}`, band: o.missing[f.key] ? "OK" as const : "GOOD" as const }))} />
          </article>
          <article className={tile}>
            <h2 className="font-bold text-brand-navy">Where the values come from</h2>
            <p className="mt-2 text-sm"><b>DOK:</b> {Object.entries(o.sources.dok).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
            <p className="mt-1 text-sm"><b>Difficulty:</b> {Object.entries(o.sources.difficulty).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
            <p className="mt-3 text-sm text-slate-600">🎯 Text-based difficulty estimate agrees within one level with the authored level for <b>{o.estimateAgreement.compared ? Math.round((100 * o.estimateAgreement.within1) / o.estimateAgreement.compared) : 0}%</b> of {o.estimateAgreement.compared} questions. Larger disagreements go to the review queue; once 30+ students answer a question, its difficulty is calibrated from their answers.</p>
          </article>
        </section>
      </>)}

      {tab === "missing" && <MissingTab schoolId={actor.schoolId!} field={field} counts={o.missing} />}
      {tab === "coverage" && <CoverageTab schoolId={actor.schoolId!} grade={grade} grades={grades} />}
    </AppShell>
  );
}

async function MissingTab({ schoolId, field, counts }: { schoolId: string; field: MetaField; counts: Record<MetaField, number> }) {
  const rows = await missingList(repo, schoolId, field, 200);
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap gap-2">{META_FIELDS.map((f) => <Link key={f.key} href={`/admin/question-intelligence?tab=missing&field=${f.key}`} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${f.key === field ? "bg-brand-navy text-white ring-brand-navy" : "bg-white ring-slate-200"}`}>{f.label} ({counts[f.key]})</Link>)}</div>
      <div className="rk-box rk-tall mt-3"><table className="w-full text-sm"><thead><tr><th className="py-2">Question</th><th>Skill</th><th>Status</th><th>Also missing</th><th /></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-b last:border-0"><td className="py-1.5 pe-2">{r.stem}</td><td className="text-xs">{r.skill}</td><td className="text-xs">{r.status}</td><td className="text-xs text-slate-500">{r.gaps.filter((g) => g !== field).join(", ") || "—"}</td><td><Link href={`/admin/questions/${r.id}`} className="text-xs font-semibold text-brand-teal underline">Edit</Link></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="mt-3 text-slate-600">No question is missing this. ✅</p>}
    </section>
  );
}

async function CoverageTab({ schoolId, grade, grades }: { schoolId: string; grade: number; grades: number[] }) {
  const rows = (await coverage(repo, schoolId, grade)).sort((a, b) => b.flags.length - a.flags.length || a.total - b.total);
  const need = rows.filter((r) => r.flags.includes("INSUFFICIENT")).length;
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">{grades.map((g) => <Link key={g} href={`/admin/question-intelligence?tab=coverage&grade=${g}`} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${g === grade ? "bg-brand-navy text-white ring-brand-navy" : "bg-white ring-slate-200"}`}>Grade {g}</Link>)}
        <span className="ms-auto text-sm text-slate-600">{rows.length} skills · {need} under {COVERAGE_TARGET} · <Link href={`/admin/question-bank?grade=${grade}`} className="font-semibold text-brand-teal underline">✨ Fill to {COVERAGE_TARGET}</Link></span></div>
      <div className="rk-box rk-tall mt-3"><table className="w-full text-sm"><thead><tr><th className="py-2">Skill</th><th>Total</th><th>Easy</th><th>Medium</th><th>Hard</th><th>DOK 1 · 2 · 3 · 4</th><th>Problems</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.skillId} className="border-b align-middle last:border-0">
            <td className="py-1.5 pe-2"><span className="font-semibold text-brand-navy">{r.name}</span></td>
            <td className="tabular-nums">{r.total}</td><td className="tabular-nums">{r.easy}</td><td className="tabular-nums">{r.medium}</td><td className={`tabular-nums ${r.hard < 3 ? "font-bold text-amber-700" : ""}`}>{r.hard}</td>
            <td className="tabular-nums text-xs">{r.dok.join(" · ")}</td>
            <td><span className="flex flex-wrap gap-1">{r.flags.map((f) => <span key={f} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${FLAG[f].tone}`}>{FLAG[f].label}</span>)}</span></td>
            <td><form action={confirmSkillAction}><input type="hidden" name="skillId" value={r.skillId} /><button className="text-xs font-semibold text-brand-teal underline">Confirm metadata</button></form></td>
          </tr>
        ))}</tbody></table></div>
    </section>
  );
}
