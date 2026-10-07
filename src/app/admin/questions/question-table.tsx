"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuestionStatus } from "@/server/admin/questions";
import { archiveQuestionsAction, bulkPublishAction, deleteQuestionsAction, publishableIdsAction } from "../actions";

export interface TableRow {
  id: string; stem: string; mine: boolean; origin: string; grade: number; skill: string; type: string; level: number; levelLabel: string; status: QuestionStatus; updatedAt: string;
  hasPassage?: boolean; hasImage?: boolean; possibleMissingPassage?: boolean;
}

const STATUS_LABEL: Record<QuestionStatus, string> = { DRAFT: "Drafts", UNDER_REVIEW: "Waiting for review", PUBLISHED: "Published", ARCHIVED: "Archived" };
const CHIP: Record<QuestionStatus, string> = { DRAFT: "bg-slate-100 text-slate-700", UNDER_REVIEW: "bg-amber-100 text-amber-800", PUBLISHED: "bg-teal-100 text-teal-800", ARCHIVED: "bg-slate-200 text-slate-500" };
const PUBLISHABLE: QuestionStatus[] = ["DRAFT", "UNDER_REVIEW"];
const BATCH = 50;

/**
 * Questions table. Admins with publishing permission also get row checkboxes, “Select all”,
 * “Publish Selected” and “Publish All” (all publishable questions matching the current filters).
 */
export function QuestionTable({ rows, total, canPublish, canDelete = false, filter }: {
  rows: TableRow[]; total: number; canPublish: boolean; canDelete?: boolean;
  filter: import("../actions").ListFilterInput;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string; skipped?: { stem: string; reason: string }[] } | null>(null);
  const eligible = rows.filter((r) => PUBLISHABLE.includes(r.status));
  // admins can select any row (archive / delete); otherwise only publishable rows
  const selectable = canDelete ? rows : eligible;
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const selectedPublishable = rows.filter((r) => selected.has(r.id) && PUBLISHABLE.includes(r.status)).map((r) => r.id);
  const checkboxes = canPublish || canDelete;

  async function runBatches<T>(ids: string[], verb: string, call: (part: string[]) => Promise<{ result?: T; error?: string }>, onResult: (r: T) => void): Promise<boolean> {
    setFeedback(null);
    setBusy({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += 200) {
      const r = await call(ids.slice(i, i + 200));
      if (r.error) { setBusy(null); setFeedback({ error: `${r.error}${i ? ` (${i} ${verb} before the error)` : ""}` }); return false; }
      onResult(r.result!);
      setBusy({ done: Math.min(ids.length, i + 200), total: ids.length });
    }
    setBusy(null);
    return true;
  }

  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Permanently delete ${ids.length} question${ids.length === 1 ? "" : "s"}? This cannot be undone. Questions students have answered are kept (archive those instead).`)) return;
    let deleted = 0;
    const skipped: { stem: string; reason: string }[] = [];
    const ok = await runBatches(ids, "deleted", deleteQuestionsAction, (r) => { deleted += r.deleted; skipped.push(...r.skipped); });
    if (!ok) return;
    setSelected(new Set());
    setFeedback({ ok: `${deleted} question${deleted === 1 ? "" : "s"} deleted.${skipped.length ? ` ${skipped.length} kept (see below).` : ""}`, skipped });
    router.refresh();
  }

  async function archiveSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const reason = window.prompt(`Archive ${ids.length} question${ids.length === 1 ? "" : "s"}? Archived questions never appear in practice and keep their history.\n\nReason:`, "No longer needed");
    if (reason === null) return;
    let archived = 0;
    const ok = await runBatches(ids, "archived", (part) => archiveQuestionsAction(part, reason), (r) => { archived += r.archived; });
    if (!ok) return;
    setSelected(new Set());
    setFeedback({ ok: `${archived} question${archived === 1 ? "" : "s"} archived.` });
    router.refresh();
  }
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function publish(ids: string[]) {
    if (!ids.length) return setFeedback({ error: "There are no questions here that can be published." });
    if (!window.confirm(`Are you sure you want to publish ${ids.length} question${ids.length === 1 ? "" : "s"}?`)) return;
    setFeedback(null);
    let published = 0;
    const skipped: { stem: string; reason: string }[] = [];
    setBusy({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += BATCH) {
      const r = await bulkPublishAction(ids.slice(i, i + BATCH));
      if (r.error) {
        setBusy(null);
        return setFeedback({ error: r.error, ok: published ? `${published} published before the error.` : undefined, skipped });
      }
      published += r.result!.published.length;
      skipped.push(...r.result!.skipped.map((s) => ({ stem: s.stem, reason: s.reason })));
      setBusy({ done: Math.min(ids.length, i + BATCH), total: ids.length });
    }
    setBusy(null);
    setSelected(new Set());
    setFeedback({ ok: `${published} question${published === 1 ? "" : "s"} published.${skipped.length ? ` ${skipped.length} not published (see below).` : ""}`, skipped });
    router.refresh();
  }

  async function publishAll() {
    setFeedback(null);
    const r = await publishableIdsAction(filter);
    if (r.error) return setFeedback({ error: r.error });
    await publish(r.ids ?? []);
  }

  return (
    <div>
      {checkboxes && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto text-sm font-semibold text-slate-700" aria-live="polite">Selected: {selected.size}</span>
          {canPublish && <button type="button" disabled={!!busy || selectedPublishable.length === 0} onClick={() => void publish(selectedPublishable)} className="rounded-xl bg-brand-teal px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50">Publish Selected ({selectedPublishable.length})</button>}
          {canPublish && <button type="button" disabled={!!busy} onClick={() => void publishAll()} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Publish All</button>}
          {canPublish && <button type="button" disabled={!!busy || selected.size === 0} onClick={() => void archiveSelected()} className="rounded-xl px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50">Archive Selected</button>}
          {canDelete && <button type="button" disabled={!!busy || selected.size === 0} onClick={() => void removeSelected()} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-50">Delete Selected ({selected.size})</button>}
        </div>
      )}
      {busy && (
        <div role="status" className="mb-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * busy.done) / Math.max(1, busy.total))}%` }} /></div>
          <p className="mt-1 text-sm text-slate-600">Working… {busy.done} of {busy.total}</p>
        </div>
      )}
      {feedback?.ok && <p role="status" className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-teal-900">{feedback.ok}</p>}
      {feedback?.error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{feedback.error}</p>}
      {feedback?.skipped && feedback.skipped.length > 0 && (
        <ul className="mb-3 list-disc space-y-1 ps-5 text-sm text-amber-900">{feedback.skipped.slice(0, 20).map((s, i) => <li key={i}>{s.stem ? `“${s.stem}”: ` : ""}{s.reason}</li>)}{feedback.skipped.length > 20 && <li>…and {feedback.skipped.length - 20} more</li>}</ul>
      )}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-slate-500">
            {checkboxes && <th className="w-8 py-2"><input type="checkbox" aria-label="Select all questions on this page" checked={allChecked} disabled={!selectable.length || !!busy} onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((r) => r.id)))} /></th>}
            <th className="py-2">Question</th><th>Skill</th><th>Type</th><th>Level</th><th>Status</th><th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id} className="border-b align-top last:border-0">
              {checkboxes && <td className="py-2"><input type="checkbox" aria-label={`Select: ${q.stem.slice(0, 60)}`} checked={selected.has(q.id)} disabled={(!canDelete && !PUBLISHABLE.includes(q.status)) || !!busy} onChange={() => toggle(q.id)} /></td>}
              <td className="max-w-md py-2"><Link href={`/admin/questions/${q.id}`} className="text-brand-navy hover:underline">{q.stem}</Link>{q.mine && <span className="ml-2 text-xs text-brand-purple">mine</span>}{q.origin === "AI_GENERATED" && <span className="ml-2 text-xs text-amber-700">AI-drafted</span>}
                {(q.hasPassage || q.hasImage || q.possibleMissingPassage) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {q.hasPassage && <span className="rounded bg-sky-50 px-1.5 text-xs text-sky-800">Passage</span>}
                    {q.hasImage && <span className="rounded bg-violet-50 px-1.5 text-xs text-violet-800">Image</span>}
                    {q.possibleMissingPassage && <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900" title="The question mentions a passage, story or paragraph, but has no passage.">⚠ Possible missing passage</span>}
                  </span>
                )}</td>
              <td>G{q.grade} · {q.skill}</td>
              <td className="text-xs">{q.type.replace(/_/g, " ").toLowerCase()}</td>
              <td>{q.level} · {q.levelLabel}</td>
              <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[q.status]}`}>{STATUS_LABEL[q.status]}</span></td>
              <td>{q.updatedAt.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={checkboxes ? 7 : 6} className="py-6 text-center text-slate-500">No questions here.</td></tr>}
        </tbody>
      </table>
      {total > rows.length && <p className="mt-2 text-sm text-slate-500">This page shows {rows.length} of {total} matching questions. “Publish All” includes every matching question that can be published, on all pages.</p>}
    </div>
  );
}
