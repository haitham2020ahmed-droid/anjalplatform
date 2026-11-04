"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { t } from "@/i18n/admin-confirm";
import { deleteQuestionsAction } from "../actions";
import type { ItemFlag, ItemRow } from "@/server/admin/item-quality";

const BULK_MAX = 500;

/**
 * Flagged-question rows with a checkbox per row, "Select all" and a bulk "Delete Selected" action,
 * so an admin can clear several flagged questions without opening each one. Mirrors the Question
 * Bank table's bulk-action pattern (src/app/admin/questions/question-table.tsx): a Set of selected
 * ids, batches of BULK_MAX, a confirm step before the delete, and a plain-language result/skip list.
 * Delete reuses deleteQuestionsAction, so the same RBAC (admins only) and schoolId scoping the
 * Question Bank's delete already has and is already tested for (tests/question-delete.test.ts)
 * apply here too — answered questions are kept and reported back, never silently skipped.
 */
export function FlaggedTable({ rows, canDelete, flagLabels }: { rows: ItemRow[]; canDelete: boolean; flagLabels: Record<ItemFlag, [string, string, string]> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string; skipped?: { stem: string; reason: string }[] } | null>(null);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length) return setFeedback({ error: t("en", "bulkDelete.flags.none") });
    if (!window.confirm(t("en", "bulkDelete.flags.confirm", { count: ids.length }))) return;
    setFeedback(null);
    setBusy(true);
    let deleted = 0;
    const skipped: { stem: string; reason: string }[] = [];
    for (let i = 0; i < ids.length; i += BULK_MAX) {
      const r = await deleteQuestionsAction(ids.slice(i, i + BULK_MAX));
      if (r.error) { setBusy(false); return setFeedback({ error: `${r.error}${deleted ? ` (${deleted} deleted before the error)` : ""}` }); }
      deleted += r.result!.deleted;
      skipped.push(...r.result!.skipped.map((s) => ({ stem: s.stem, reason: s.reason })));
    }
    setBusy(false);
    setSelected(new Set());
    setFeedback({ ok: `${deleted} question${deleted === 1 ? "" : "s"} deleted.${skipped.length ? ` ${skipped.length} kept (see below).` : ""}`, skipped });
    router.refresh();
  }

  return (
    <div>
      {canDelete && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto text-sm font-semibold text-slate-700" aria-live="polite">Selected: {selected.size}</span>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => void removeSelected()} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-50">Delete Selected ({selected.size})</button>
        </div>
      )}
      {busy && <p role="status" className="mb-3 text-sm text-slate-600">Working…</p>}
      {feedback?.ok && <p role="status" className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-teal-900">{feedback.ok}</p>}
      {feedback?.error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{feedback.error}</p>}
      {feedback?.skipped && feedback.skipped.length > 0 && (
        <ul className="mb-3 list-disc space-y-1 ps-5 text-sm text-amber-900">{feedback.skipped.slice(0, 20).map((s, i) => <li key={i}>{s.stem ? `“${s.stem}”: ` : ""}{s.reason}</li>)}{feedback.skipped.length > 20 && <li>…and {feedback.skipped.length - 20} more</li>}</ul>
      )}
      <div className="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              {canDelete && <th className="w-8 p-3"><input type="checkbox" aria-label="Select all flagged questions" checked={allChecked} disabled={!rows.length || busy} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
              <th className="p-3">Question</th><th className="p-3">Place</th><th className="p-3">Answers</th><th className="p-3">Correct</th><th className="p-3">Guessed</th><th className="p-3">Why</th>
            </tr>
          </thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b align-top last:border-0">
              {canDelete && <td className="p-3"><input type="checkbox" aria-label={`Select: ${r.stem.slice(0, 60)}`} checked={selected.has(r.id)} disabled={busy} onChange={() => toggle(r.id)} /></td>}
              <td className="max-w-md p-3"><Link href={`/admin/questions/${r.id}`} className="font-medium text-brand-navy hover:underline">{r.stem.slice(0, 140)}</Link></td>
              <td className="p-3"><code className="text-xs">{r.place ?? "—"}</code></td>
              <td className="p-3 tabular-nums">{r.answers}</td><td className="p-3 tabular-nums">{r.correctPct}%</td><td className="p-3 tabular-nums">{r.rapidPct}%</td>
              <td className="p-3"><div className="flex flex-wrap gap-1">{r.flags.map((f) => <span key={f} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${flagLabels[f][1]}`}>{flagLabels[f][0]}{f === "UNUSED_OPTION" ? `: ${r.unused.join(", ")}` : ""}</span>)}</div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
