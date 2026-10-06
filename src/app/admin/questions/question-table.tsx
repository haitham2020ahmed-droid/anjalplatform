"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuestionStatus } from "@/server/admin/questions";
import { bulkPublishAction, publishableIdsAction } from "../actions";

export interface TableRow {
  id: string; stem: string; mine: boolean; origin: string; grade: number; skill: string; type: string; level: number; levelLabel: string; status: QuestionStatus; updatedAt: string;
}

const STATUS_LABEL: Record<QuestionStatus, string> = { DRAFT: "Drafts", UNDER_REVIEW: "Waiting for review", PUBLISHED: "Published", ARCHIVED: "Archived" };
const CHIP: Record<QuestionStatus, string> = { DRAFT: "bg-slate-100 text-slate-700", UNDER_REVIEW: "bg-amber-100 text-amber-800", PUBLISHED: "bg-teal-100 text-teal-800", ARCHIVED: "bg-slate-200 text-slate-500" };
const PUBLISHABLE: QuestionStatus[] = ["DRAFT", "UNDER_REVIEW"];
const BATCH = 50;

/**
 * Questions table. Admins with publishing permission also get row checkboxes, “Select all”,
 * “Publish Selected” and “Publish All” (all publishable questions matching the current filters).
 */
export function QuestionTable({ rows, total, canPublish, filter }: {
  rows: TableRow[]; total: number; canPublish: boolean;
  filter: { status?: QuestionStatus; grade?: number; q?: string; mine?: boolean; ai?: boolean };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string; skipped?: { stem: string; reason: string }[] } | null>(null);
  const eligible = rows.filter((r) => PUBLISHABLE.includes(r.status));
  const allChecked = eligible.length > 0 && eligible.every((r) => selected.has(r.id));
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
      {canPublish && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {selected.size > 0 && <span className="me-auto text-sm text-slate-600">{selected.size} selected</span>}
          <button type="button" disabled={!!busy || selected.size === 0} onClick={() => void publish([...selected])} className="rounded-xl bg-brand-teal px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50">Publish Selected ({selected.size})</button>
          <button type="button" disabled={!!busy} onClick={() => void publishAll()} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Publish All</button>
        </div>
      )}
      {busy && (
        <div role="status" className="mb-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * busy.done) / Math.max(1, busy.total))}%` }} /></div>
          <p className="mt-1 text-sm text-slate-600">Publishing… {busy.done} of {busy.total}</p>
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
            {canPublish && <th className="w-8 py-2"><input type="checkbox" aria-label="Select all questions that can be published" checked={allChecked} disabled={!eligible.length || !!busy} onChange={() => setSelected(allChecked ? new Set() : new Set(eligible.map((r) => r.id)))} /></th>}
            <th className="py-2">Question</th><th>Skill</th><th>Type</th><th>Level</th><th>Status</th><th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id} className="border-b align-top last:border-0">
              {canPublish && <td className="py-2"><input type="checkbox" aria-label={`Select: ${q.stem.slice(0, 60)}`} checked={selected.has(q.id)} disabled={!PUBLISHABLE.includes(q.status) || !!busy} onChange={() => toggle(q.id)} /></td>}
              <td className="max-w-md py-2"><Link href={`/admin/questions/${q.id}`} className="text-brand-navy hover:underline">{q.stem}</Link>{q.mine && <span className="ml-2 text-xs text-brand-purple">mine</span>}{q.origin === "AI_GENERATED" && <span className="ml-2 text-xs text-amber-700">AI-drafted</span>}</td>
              <td>G{q.grade} · {q.skill}</td>
              <td className="text-xs">{q.type.replace(/_/g, " ").toLowerCase()}</td>
              <td>{q.level} · {q.levelLabel}</td>
              <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[q.status]}`}>{STATUS_LABEL[q.status]}</span></td>
              <td>{q.updatedAt.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={canPublish ? 7 : 6} className="py-6 text-center text-slate-500">No questions here.</td></tr>}
        </tbody>
      </table>
      {total > rows.length && <p className="mt-2 text-sm text-slate-500">Showing the {rows.length} most recent of {total}. Use the filters to narrow the list. “Publish All” includes all {total} matching questions that can be published.</p>}
    </div>
  );
}
