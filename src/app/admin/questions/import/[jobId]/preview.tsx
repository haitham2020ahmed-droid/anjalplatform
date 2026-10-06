"use client";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import type { ImportJobView, PreviewRow, ImportDecision, CommitProgress } from "@/server/admin/question-import";
import type { EditorInput } from "@/server/admin/questions";
import { QuestionEditor } from "../../question-editor";
import { commitImportAction, importRowAction, importSelectAllAction } from "../../../actions";

type Skill = Parameters<typeof QuestionEditor>[0]["skills"][number];

const TYPE: Record<string, string> = {
  MULTIPLE_CHOICE: "Multiple choice", MULTI_SELECT: "Multi select", TRUE_FALSE: "True / false", DROPDOWN: "Dropdown", FILL_BLANK: "Fill in the blank",
  SENTENCE_ORDER: "Sentence order", WORD_ORDER: "Word order", ERROR_CORRECTION: "Error correction", MATCHING: "Matching", SHORT_ANSWER: "Short answer",
};
const BADGE: Record<string, string> = {
  VALID: "bg-teal-100 text-teal-900", INVALID: "bg-red-100 text-red-800", DUPLICATE: "bg-amber-100 text-amber-900",
  IMPORTED: "bg-teal-600 text-white", REPLACED: "bg-teal-600 text-white", SKIPPED: "bg-slate-200 text-slate-700", FAILED: "bg-red-600 text-white",
};

function answerOf(i: EditorInput | null): string {
  if (!i) return "—";
  switch (i.type) {
    case "TRUE_FALSE": return i.answer === undefined ? "—" : i.answer ? "True" : "False";
    case "FILL_BLANK": case "SHORT_ANSWER": return (i.answers ?? []).join(" / ") || "—";
    case "SENTENCE_ORDER": case "WORD_ORDER": return (i.sequence ?? []).join(" → ");
    case "MATCHING": return (i.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join("; ");
    case "ERROR_CORRECTION": return `${i.segments?.[i.errorIndex ?? 0] ?? "?"} → ${i.correction ?? "?"}`;
    default: return (i.options ?? []).filter((o) => o.correct).map((o) => `${o.label}) ${o.text}`).join(", ") || "—";
  }
}

export function ImportPreview({ job, skills, standards, canPublish }: { job: ImportJobView; skills: Skill[]; standards: string[]; canPublish: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<PreviewRow[]>(job.rows);
  const [editing, setEditing] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editable = job.status === "AWAITING_CONFIRMATION" && !progress;
  const skillName = new Map(skills.map((s) => [s.id, `G${s.grade} · ${s.name}`]));
  const willImport = rows.filter((r) => r.selected && r.status !== "INVALID" && !(r.status === "DUPLICATE" && r.decision === "SKIP")).length;

  const patch = (rowId: string, p: { selected?: boolean; decision?: ImportDecision; input?: EditorInput }) =>
    start(async () => {
      const r = await importRowAction(job.id, rowId, p);
      if (r.error) return setError(r.error);
      setError(null);
      if (r.row) setRows((xs) => xs.map((x) => (x.id === rowId ? r.row! : x)));
    });

  async function runImport() {
    setError(null);
    let p: CommitProgress | undefined;
    do {
      const r = await commitImportAction(job.id, publish);
      if (r.error) return setError(r.error);
      p = r.progress!;
      setProgress(p);
    } while (!p.done);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300" onClick={() => start(async () => { await importSelectAllAction(job.id, true); router.refresh(); setRows((xs) => xs.map((x) => (x.status === "INVALID" ? x : { ...x, selected: true }))); })}>Select all valid</button>
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300" onClick={() => start(async () => { await importSelectAllAction(job.id, false); setRows((xs) => xs.map((x) => ({ ...x, selected: false }))); })}>Select none</button>
          <span className="text-sm text-slate-600">{willImport} question(s) will be imported</span>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-2">Import</th><th>#</th><th>Type</th><th className="min-w-[18rem]">Question and answer</th><th>Skill · level</th><th>Status</th><th>Duplicate</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b align-top">
                  <td className="p-2"><input type="checkbox" aria-label={`Import question ${r.rowIndex + 1}`} checked={r.selected} disabled={!editable || r.status === "INVALID" || pending} onChange={(e) => patch(r.id, { selected: e.target.checked })} /></td>
                  <td className="py-2 pe-2">{r.rowIndex + 1}</td>
                  <td className="pe-2">{TYPE[r.detected.input?.type ?? ""] ?? "—"}</td>
                  <td className="pe-2">
                    <p className="font-medium text-brand-navy">{r.detected.input?.stem ?? r.source.slice(0, 160)}</p>
                    {r.detected.input?.options && <p className="text-xs text-slate-600">{r.detected.input.options.map((o) => `${o.label}) ${o.text}`).join("   ")}</p>}
                    <p className="text-xs"><span className="font-semibold">Answer:</span> {answerOf(r.detected.input)}{r.detected.meta.aiSuggestedAnswer && <span className="ms-1 rounded bg-amber-100 px-1 text-amber-900">AI-suggested</span>}</p>
                  </td>
                  <td className="pe-2 text-xs">{r.detected.input ? `${skillName.get(r.detected.input.skillId) ?? "?"} · L${r.detected.input.level}` : "—"}{r.detected.input?.standardCode ? <><br />{r.detected.input.standardCode.replace(/^CCSS\.ELA-LITERACY\./, "")}</> : null}</td>
                  <td className="pe-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.status] ?? ""}`}>{r.status.toLowerCase()}</span>
                    {r.errors.map((e) => <p key={e} className="mt-1 text-xs text-red-700">{e}</p>)}
                    {r.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-800">{w}</p>)}
                  </td>
                  <td className="pe-2 text-xs">
                    {r.duplicate ? (
                      <>
                        <a className="text-brand-teal hover:underline" href={`/admin/questions/${r.duplicate.id}`} target="_blank" rel="noreferrer">{Math.round(r.duplicate.similarity * 100)}% like an existing question</a>
                        <p className="text-slate-500">“{r.duplicate.stem.slice(0, 70)}…”</p>
                      </>
                    ) : r.status === "DUPLICATE" ? <p>repeated in this file</p> : null}
                    {(r.duplicate || r.status === "DUPLICATE") && (
                      <select aria-label="What to do with this duplicate" disabled={!editable || pending} value={r.decision} onChange={(e) => patch(r.id, { decision: e.target.value as ImportDecision })} className="mt-1 rounded border px-1 py-0.5">
                        <option value="SKIP">Skip</option>
                        {r.duplicate && <option value="REPLACE">Replace existing</option>}
                        <option value="FORCE">Import anyway</option>
                      </select>
                    )}
                  </td>
                  <td className="pe-2">{editable && r.detected.input && <button type="button" className="text-brand-teal hover:underline" onClick={() => setEditing(editing === r.id ? null : r.id)}>{editing === r.id ? "Close" : "Edit"}</button>}</td>
                </tr>
                {editing === r.id && r.detected.input && (
                  <tr key={`${r.id}-edit`} className="border-b bg-slate-50"><td colSpan={8} className="p-4">
                    <QuestionEditor questionId={null} initial={r.detected.input} skills={skills} standards={standards} readOnly={false}
                      onSave={async (payload) => {
                        const res = await importRowAction(job.id, r.id, { input: payload });
                        if (res.row) setRows((xs) => xs.map((x) => (x.id === r.id ? res.row! : x)));
                        return res;
                      }} />
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <button type="button" disabled={pending || willImport === 0} onClick={() => void runImport()} className="rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">Import {willImport} question(s)</button>
          {canPublish && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />Approve on import (students can practise them at once; short answers stay drafts)</label>}
          {!publish && <span className="text-sm text-slate-600">Questions are added as drafts for review.</span>}
        </div>
      )}
      {progress && (
        <div role="status" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.processed}>
            <div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * progress.processed) / Math.max(1, progress.total))}%` }} />
          </div>
          <p className="mt-2 text-sm">{progress.done ? "Finished." : `Importing… ${progress.processed} of ${progress.total}`}</p>
          <p className="text-sm font-semibold text-brand-navy">Imported {progress.counts.imported} · Replaced {progress.counts.replaced} · Skipped {progress.counts.skipped} · Failed {progress.counts.failed} · Duplicates found {progress.counts.duplicates}</p>
        </div>
      )}
    </div>
  );
}
