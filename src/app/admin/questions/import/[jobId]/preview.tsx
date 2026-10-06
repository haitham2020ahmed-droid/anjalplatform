"use client";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import type { ImportJobView, PreviewRow, ImportDecision, CommitProgress } from "@/server/admin/question-import";
import type { EditorInput } from "@/server/admin/questions";
import { QuestionEditor } from "../../question-editor";
import { commitImportAction, importRowAction, importSelectAllAction } from "../../../actions";

type Skill = Parameters<typeof QuestionEditor>[0]["skills"][number];
type Filter = "all" | "ready" | "errors" | "duplicates" | "done";

const TYPE: Record<string, string> = {
  MULTIPLE_CHOICE: "Multiple Choice", MULTI_SELECT: "Multi Select", TRUE_FALSE: "True/False", DROPDOWN: "Dropdown", FILL_BLANK: "Fill in the Blank",
  SENTENCE_ORDER: "Sentence order", WORD_ORDER: "Word order", ERROR_CORRECTION: "Error correction", MATCHING: "Matching", SHORT_ANSWER: "Short Answer",
};
const STATUS: Record<string, { text: string; cls: string }> = {
  VALID: { text: "Ready", cls: "bg-teal-100 text-teal-900" }, INVALID: { text: "Error", cls: "bg-red-100 text-red-800" }, DUPLICATE: { text: "Duplicate", cls: "bg-amber-100 text-amber-900" },
  IMPORTED: { text: "Imported", cls: "bg-teal-600 text-white" }, REPLACED: { text: "Replaced", cls: "bg-teal-600 text-white" }, SKIPPED: { text: "Skipped", cls: "bg-slate-200 text-slate-700" }, FAILED: { text: "Failed", cls: "bg-red-600 text-white" },
};
const PAGE = 50;
const short = (code: string | null | undefined) => (code ?? "").replace(/^CCSS\.ELA-LITERACY\./, "");

function answerOf(i: EditorInput | null): string {
  if (!i) return "—";
  switch (i.type) {
    case "TRUE_FALSE": return i.answer === undefined ? "—" : i.answer ? "True" : "False";
    case "FILL_BLANK": case "SHORT_ANSWER": return (i.answers ?? []).join(" | ") || "—";
    default: return (i.options ?? []).filter((o) => o.correct).map((o) => o.label).join(", ") || "—";
  }
}

const willImport = (r: PreviewRow) => r.selected && r.status !== "INVALID" && !(r.status === "DUPLICATE" && r.decision === "SKIP") && r.decision !== "SKIP";

export function ImportPreview({ job, skills, standards, canPublish }: { job: ImportJobView; skills: Skill[]; standards: string[]; canPublish: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<PreviewRow[]>(job.rows);
  const [editing, setEditing] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const finished = job.status === "COMPLETED" || job.status === "CANCELLED" || Boolean(progress?.done);
  const editable = job.status === "AWAITING_CONFIRMATION" && !progress;
  const [filter, setFilter] = useState<Filter>(job.status === "COMPLETED" ? "all" : job.totals.invalid ? "errors" : "all");
  const [page, setPage] = useState(0);
  const skillName = useMemo(() => new Map(skills.map((s) => [s.id, s.name])), [skills]);

  const counts = useMemo(() => ({
    all: rows.length, ready: rows.filter((r) => r.status === "VALID").length, errors: rows.filter((r) => r.status === "INVALID" || r.status === "FAILED").length,
    duplicates: rows.filter((r) => r.status === "DUPLICATE" || r.duplicate).length, done: rows.filter((r) => r.status === "IMPORTED" || r.status === "REPLACED").length,
  }), [rows]);
  const shown = useMemo(() => rows.filter((r) => filter === "all" ? true : filter === "ready" ? r.status === "VALID" : filter === "errors" ? r.status === "INVALID" || r.status === "FAILED" : filter === "duplicates" ? r.status === "DUPLICATE" || Boolean(r.duplicate) : r.status === "IMPORTED" || r.status === "REPLACED"), [rows, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const visible = shown.slice(page * PAGE, page * PAGE + PAGE);
  const toImport = rows.filter(willImport).length;

  const patch = (rowId: string, p: { selected?: boolean; decision?: ImportDecision; input?: EditorInput }) =>
    start(async () => {
      const r = await importRowAction(job.id, rowId, p);
      if (r.error) return setError(r.error);
      setError(null);
      if (r.row) setRows((xs) => xs.map((x) => (x.id === rowId ? r.row! : x)));
    });

  async function runImport() {
    setError(null);
    setRunning(true);
    try {
      let p: CommitProgress | undefined;
      do {
        const r = await commitImportAction(job.id, publish);
        if (r.error || !r.progress) {
          setError(`${r.error ?? "The server did not answer."} The import stopped at ${p?.processed ?? progress?.processed ?? 0} of ${p?.total ?? rows.length} rows; questions already imported are kept. Press “Continue import” to go on.`);
          return;
        }
        p = r.progress;
        setProgress(p);
      } while (!p.done);
      router.refresh();
    } catch {
      setError("The connection to the server was lost during the import. Questions already imported are kept. Press “Continue import” to go on.");
    } finally {
      setRunning(false);
    }
  }

  const resumable = job.status === "IMPORTING" || Boolean(progress && !progress.done);
  const tabs: [Filter, string][] = [["all", "All"], ["ready", "Ready"], ["errors", "Errors"], ["duplicates", "Duplicates"]];
  if (finished) tabs.push(["done", "Imported"]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Show rows">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setPage(0); }}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === k ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>{l} ({counts[k]})</button>
        ))}
        {editable && (
          <span className="ms-auto flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="rounded-lg px-3 py-1 ring-1 ring-slate-300" disabled={pending} onClick={() => start(async () => { const r = await importSelectAllAction(job.id, true); if (r.error) return setError(r.error); setRows((xs) => xs.map((x) => (x.status === "INVALID" ? x : { ...x, selected: true }))); })}>Select all without errors</button>
            <button type="button" className="rounded-lg px-3 py-1 ring-1 ring-slate-300" disabled={pending} onClick={() => start(async () => { const r = await importSelectAllAction(job.id, false); if (r.error) return setError(r.error); setRows((xs) => xs.map((x) => ({ ...x, selected: false }))); })}>Select none</button>
          </span>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-800 ring-1 ring-red-200">{error}</p>}

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="p-2">Import</th><th>Row</th><th className="min-w-[20rem]">Question</th><th>Grade</th><th className="min-w-[10rem]">Skill</th><th>Standard</th><th>Difficulty</th><th>Cognitive</th><th className="min-w-[14rem]">Status</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={10} className="p-4 text-slate-600">No rows in this view.</td></tr>}
            {visible.map((r) => {
              const i = r.detected.input;
              const m = r.detected.meta;
              const isDup = r.status === "DUPLICATE";
              return (
                <Fragment key={r.id}>
                  <tr className="border-b align-top">
                    <td className="p-2"><input type="checkbox" aria-label={`Import row ${r.rowNumber}`} checked={willImport(r) || (r.selected && r.status === "INVALID")} disabled={!editable || r.status === "INVALID" || pending} onChange={(e) => patch(r.id, e.target.checked && isDup ? { selected: true, decision: "FORCE" } : { selected: e.target.checked })} /></td>
                    <td className="py-2 pe-2 tabular-nums">{r.rowNumber}</td>
                    <td className="pe-2">
                      <p className="font-medium text-brand-navy">{i?.stem || <span className="text-slate-500">(no question text)</span>}</p>
                      <p className="text-xs text-slate-500">{TYPE[i?.type ?? ""] ?? "Unknown type"}{i?.options?.length ? `: ${i.options.map((o) => `${o.label}) ${o.text}`).join("  ")}` : ""}</p>
                      <p className="text-xs"><span className="font-semibold">Answer:</span> {answerOf(i)}</p>
                      {m.passage && <p className="text-xs text-slate-500">With a reading passage ({m.passage.split(/\s+/).length} words)</p>}
                    </td>
                    <td className="pe-2">{m.grade ?? (m.gradeText || "—")}</td>
                    <td className="pe-2">{m.skillName ?? (i?.skillId ? skillName.get(i.skillId) : null) ?? <span className="text-red-700">{m.skillText || "—"}</span>}</td>
                    <td className="pe-2 whitespace-nowrap">{m.standardCode ?? (short(i?.standardCode) || <span className="text-red-700">{m.standardText || "—"}</span>)}</td>
                    <td className="pe-2">{i?.level ?? (m.levelText || "—")}</td>
                    <td className="pe-2">{i?.cognitiveLevel ?? (m.cognitiveText || "—")}</td>
                    <td className="pe-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[r.status]?.cls ?? ""}`}>{STATUS[r.status]?.text ?? r.status}</span>
                      {r.errors.map((e) => <p key={e} className="mt-1 text-xs text-red-700">{e}</p>)}
                      {r.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-800">{w}</p>)}
                      {r.duplicate && <p className="mt-1 text-xs"><a className="text-brand-teal hover:underline" href={`/admin/questions/${r.duplicate.id}`} target="_blank" rel="noreferrer">See the existing question</a></p>}
                      {isDup && editable && (
                        <div className="mt-1 flex gap-1" role="group" aria-label="What to do with this duplicate">
                          <button type="button" disabled={pending} onClick={() => patch(r.id, { decision: "SKIP" })} className={`rounded px-2 py-0.5 text-xs ring-1 ${r.decision === "SKIP" ? "bg-slate-700 text-white ring-slate-700" : "ring-slate-300"}`}>Skip</button>
                          <button type="button" disabled={pending} onClick={() => patch(r.id, { decision: "FORCE", selected: true })} className={`rounded px-2 py-0.5 text-xs ring-1 ${r.decision === "FORCE" || r.decision === "IMPORT" ? "bg-brand-navy text-white ring-brand-navy" : "ring-slate-300"}`}>Import anyway</button>
                        </div>
                      )}
                      {r.questionId && <p className="mt-1 text-xs"><a className="text-brand-teal hover:underline" href={`/admin/questions/${r.questionId}`}>Open the question</a></p>}
                    </td>
                    <td className="pe-2">{editable && i && <button type="button" className="text-brand-teal hover:underline" onClick={() => setEditing(editing === r.id ? null : r.id)}>{editing === r.id ? "Close" : r.status === "INVALID" ? "Fix" : "Edit"}</button>}</td>
                  </tr>
                  {editing === r.id && i && (
                    <tr className="border-b bg-slate-50"><td colSpan={10} className="p-4">
                      <QuestionEditor questionId={null} initial={i} skills={skills} standards={standards} readOnly={false}
                        onSave={async (payload) => {
                          const res = await importRowAction(job.id, r.id, { input: payload });
                          if (res.row) setRows((xs) => xs.map((x) => (x.id === r.id ? res.row! : x)));
                          return res;
                        }} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className="rounded-lg px-3 py-1 ring-1 ring-slate-300 disabled:opacity-50" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page + 1} of {pages} ({shown.length} rows)</span>
          <button type="button" className="rounded-lg px-3 py-1 ring-1 ring-slate-300 disabled:opacity-50" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {(editable || resumable) && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <button type="button" disabled={running || pending || (!resumable && toImport === 0)} onClick={() => void runImport()} className="rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">
            {running ? "Importing…" : resumable ? "Continue import" : `Import ${toImport} question${toImport === 1 ? "" : "s"}`}
          </button>
          {editable && canPublish && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />Approve on import (students can practise them at once; short answers stay drafts)</label>}
          {editable && !publish && <span className="text-sm text-slate-600">Questions are added as drafts for review.</span>}
          {editable && counts.errors > 0 && <span className="text-sm text-red-700">{counts.errors} row(s) with errors will not be imported. Fix them here, or fix the file and upload it again.</span>}
        </div>
      )}

      {progress && (
        <div role="status" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.processed}>
            <div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * progress.processed) / Math.max(1, progress.total))}%` }} />
          </div>
          <p className="mt-2 text-sm">{progress.done ? "Finished." : `Importing… ${progress.processed} of ${progress.total} rows`}</p>
          <p className="text-sm font-semibold text-brand-navy">Imported {progress.counts.imported + progress.counts.replaced}, skipped {progress.counts.skipped}, failed {progress.counts.failed}</p>
        </div>
      )}
    </div>
  );
}
