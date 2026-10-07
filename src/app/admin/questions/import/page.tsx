import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { card, h2 } from "@/components/admin/styles";
import { MAP_COLUMNS, SUPPORTED_TYPES, TEACHER_RULES, TEMPLATE_COLUMNS } from "@/imports/questions/template";
import { CURRICULUM_RULES } from "@/imports/questions/template-files";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listImportJobs } from "@/server/admin/question-import";
import { ImportUpload } from "./upload-form";

const STATUS: Record<string, { text: string; cls: string }> = {
  AWAITING_CONFIRMATION: { text: "Waiting for review", cls: "bg-amber-100 text-amber-900" },
  IMPORTING: { text: "Importing", cls: "bg-sky-100 text-sky-900" },
  COMPLETED: { text: "Completed", cls: "bg-teal-100 text-teal-900" },
  CANCELLED: { text: "Cancelled", cls: "bg-slate-200 text-slate-700" },
  FAILED: { text: "Failed", cls: "bg-red-100 text-red-800" },
};

export default async function ImportQuestionsPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const actor = await requireActor({ permission: "questions:edit" });
  const toCurriculum = (await searchParams).to === "curriculum";
  const tab = (on: boolean) => `flex items-center gap-2 rounded-2xl px-5 py-3 text-lg font-bold ${on ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const me = (await getActor())!.user;
  const jobs = await listImportJobs(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin/questions" className="text-brand-teal hover:underline">← Questions</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Import questions</h1>
      <p className="mt-1 max-w-3xl text-slate-600">Prepare your Excel file, upload it, review every question, then import. Nothing is added to the question bank until you confirm, and imported questions go through the normal review before students see them.</p>

      <nav aria-label="Import to" className="mt-5 flex flex-wrap gap-3">
        <Link href="/admin/questions/import" aria-current={!toCurriculum ? "page" : undefined} className={tab(!toCurriculum)}><span aria-hidden="true">📚</span> Import to Question Bank</Link>
        <Link href="/admin/questions/import?to=curriculum" aria-current={toCurriculum ? "page" : undefined} className={tab(toCurriculum)}><span aria-hidden="true">🧭</span> Import to Curriculum</Link>
      </nav>
      <p className="mt-2 text-sm text-slate-600">{toCurriculum ? "Curriculum questions go to the Curriculum Map and the Question Bank." : "Question Bank questions stay in the bank (not on the Curriculum Map). Use the optional Use column for Placement and MAP tests."}</p>

      {toCurriculum ? (
        <>
          <section className={card}>
            <h2 className={h2}>1. Prepare your file</h2>
            <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">Questions imported here are placed on the <strong>Curriculum Map</strong> and are added to the <strong>Question Bank</strong> automatically.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href="/api/question-imports/template?format=map-xlsx" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Download Curriculum Excel template</a>
              <a href="/api/question-imports/template?format=map-csv" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Download Curriculum CSV template</a>
              <a href="/admin/curriculum-map" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🧭 Open the Curriculum Map</a>
            </div>
            <h3 className="mt-4 font-semibold text-brand-navy">Rules</h3>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-700">{CURRICULUM_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-2 text-sm text-slate-600">The other columns (Question Text, Type, Options, Correct Answer, Explanation, Grade, Passage/Text) work exactly as in the Question Bank template. The Excel template has a <strong>Curriculum Map</strong> sheet with every place and its ID.</p>
          </section>
          <section className={card}>
            <h2 className={h2}>2. Upload</h2>
            <ImportUpload target="CURRICULUM" />
          </section>
        </>
      ) : (
        <>
      <section className={card}>
        <h2 className={h2}>1. Prepare your file</h2>
        <p className="mt-1 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900">Use the official CSV or Excel template for the highest import accuracy.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a href="/api/question-imports/template?format=xlsx" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Download Excel template</a>
          <a href="/api/question-imports/template?format=csv" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Download CSV template</a>
          <a href="/api/question-imports/template?format=curriculum" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Download skills and standards list</a>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-brand-navy">Rules</h3>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-700">{TEACHER_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-2 text-sm text-slate-600">The Excel template has a <strong>Curriculum</strong> sheet with every grade, skill and standard of the school, and drop-down lists for the question type, grade, difficulty and cognitive level.</p>
          </div>
          <details className="text-sm text-slate-700">
            <summary className="cursor-pointer font-semibold text-brand-navy">What goes in each column</summary>
            <dl className="mt-2 space-y-1">
              {TEMPLATE_COLUMNS.filter((c) => c.help && !MAP_COLUMNS.includes(c.key)).map((c) => (
                <div key={c.key}><dt className="inline font-semibold">{c.header}{c.required ? "" : " (optional)"}: </dt><dd className="inline">{c.help}</dd></div>
              ))}
            </dl>
            <p className="mt-2">Question types: {SUPPORTED_TYPES.map((t) => t.name).join(", ")}.</p>
          </details>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>2. Upload</h2>
        <ImportUpload target="BANK" />
      </section>

        </>
      )}

      <section className={card}>
        <h2 className={h2}>Import history</h2>
        {jobs.length === 0 ? <p className="text-slate-600">No imports yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">File</th><th>Date</th><th>By</th><th>Rows</th><th>Result</th><th>Status</th></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.id} className="border-b align-top last:border-0">
                  <td className="py-2 pe-2"><Link className="font-semibold text-brand-teal hover:underline" href={`/admin/questions/import/${j.id}`}>{j.fileName}</Link><span className="ms-2 text-xs uppercase text-slate-500">{j.kind}</span></td>
                  <td className="pe-2">{j.createdAt.slice(0, 10)}</td>
                  <td className="pe-2">{j.uploadedBy}</td>
                  <td className="pe-2">{j.status === "FAILED" ? "—" : `${j.totals.total} (${j.totals.valid} ready, ${j.totals.invalid} with errors, ${j.totals.duplicates} duplicates)`}</td>
                  <td className="pe-2">
                    {j.summary ? `${j.summary.imported + j.summary.replaced} imported, ${j.summary.skipped} skipped, ${j.summary.failed} failed` : j.status === "FAILED" ? <span className="text-red-700">{j.errors[0] ?? "The file could not be read."}{j.errors.length > 1 ? ` (+${j.errors.length - 1} more)` : ""}</span> : "—"}
                  </td>
                  <td><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[j.status]?.cls ?? ""}`}>{STATUS[j.status]?.text ?? j.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
