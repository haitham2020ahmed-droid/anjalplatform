"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import type { QuestionStatus } from "@/server/admin/questions";
import type { BankListFilter, BankListRow } from "@/server/admin/questions-list";
import { archiveBatchAction, deleteBatchAction, restoreBatchAction, flagBatchAction, matchingIdsAction, moveBatchAction, publishBatchAction, unpublishBatchAction, type BulkResult } from "./list-actions";
import { questionPreviewAction, type QuestionPreview } from "./preview-actions";
import { AssignQuestionsDialog, type RosterClass } from "./assign-questions-dialog";

const STATUS_LABEL: Record<QuestionStatus, string> = { DRAFT: "Draft", UNDER_REVIEW: "Waiting for review", PUBLISHED: "Published", ARCHIVED: "Archived" };
const CHIP: Record<QuestionStatus, string> = { DRAFT: "bg-slate-100 text-slate-700", UNDER_REVIEW: "bg-amber-100 text-amber-900", PUBLISHED: "bg-teal-100 text-teal-900", ARCHIVED: "bg-slate-200 text-slate-600" };
/** ids per server call (the server accepts at most 100) */
const BATCH = 50;
const STAR_KEY = "alanjal.question-bank.selection";

type Op = "publish" | "unpublish" | "move" | "flag" | "archive" | "restore" | "delete";

/**
 * The 50 rows of one page. A row opens in place (its choices, answer and passage are loaded only then). Admins tick
 * rows (or “all matching”) and run one command on them; big selections go to the server in batches with a progress
 * bar, and the page refreshes once at the end. Teachers star published questions and assign them.
 */
export function QuestionList({ rows, total, filter, canPublish, canDelete, targets, roster }: {
  rows: BankListRow[]; total: number; filter: BankListFilter; canPublish: boolean; canDelete: boolean;
  targets: { id: string; name: string; grade: number }[]; roster?: RosterClass[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, QuestionPreview | { error: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [note, setNote] = useState<{ ok?: string; error?: string; skipped?: { id: string; reason: string }[] } | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [starred, setStarred] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const checkboxes = canPublish || canDelete;

  // teachers' ⭐ selection is kept in this browser while they search and change pages
  useEffect(() => {
    if (!roster) return;
    try { const v = JSON.parse(localStorage.getItem(STAR_KEY) ?? "[]"); if (Array.isArray(v)) setStarred(v.map(String).slice(0, 500)); } catch { /* storage blocked */ }
  }, [roster]);
  const saveStars = (v: string[]) => { setStarred(v); try { localStorage.setItem(STAR_KEY, JSON.stringify(v.slice(0, 500))); } catch { /* storage blocked */ } };

  // a new page of rows: the page selection starts empty
  useEffect(() => { setSelected(new Set()); setAllMatching(null); setOpen(null); }, [rows]);

  async function toggleOpen(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (details[id]) return;
    const r = await questionPreviewAction(id);
    setDetails((d) => ({ ...d, [id]: r.preview ?? { error: r.error ?? t("This question is not available.") } }));
  }

  const ids = allMatching ?? [...selected];
  const toggle = (id: string) => { setAllMatching(null); setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function selectAllMatching() {
    setNote(null);
    const r = await matchingIdsAction(filter, "any");
    if (r.error) return setNote({ error: r.error });
    setAllMatching(r.ids ?? []);
    if (r.capped) setNote({ error: t("Only the first {n} matching questions were selected. Narrow the filters for the rest.", { n: (r.ids ?? []).length }) });
  }

  async function run(op: Op, list: string[], arg = "") {
    if (!list.length) return;
    const label = { publish: t("Publishing…"), unpublish: t("Unpublishing…"), move: t("Moving…"), flag: t("Flagging…"), archive: t("Archiving…"), restore: t("Restoring…"), delete: t("Deleting…") }[op];
    setNote(null);
    setBusy({ done: 0, total: list.length, label });
    let done = 0;
    const skipped: { id: string; reason: string }[] = [];
    for (let i = 0; i < list.length; i += BATCH) {
      const part = list.slice(i, i + BATCH);
      let r: BulkResult;
      try {
        r = op === "publish" ? await publishBatchAction(part) : op === "unpublish" ? await unpublishBatchAction(part) : op === "move" ? await moveBatchAction(part, arg)
          : op === "flag" ? await flagBatchAction(part, arg) : op === "archive" ? await archiveBatchAction(part, arg) : op === "restore" ? await restoreBatchAction(part) : await deleteBatchAction(part);
      } catch {
        r = { error: t("The server did not answer. Try again.") };
      }
      if (r.error) { setBusy(null); setNote({ error: done ? `${r.error} (${t("{n} done before the error", { n: done })})` : r.error, skipped }); router.refresh(); return; }
      done += r.done ?? 0;
      skipped.push(...(r.skipped ?? []));
      setBusy({ done: Math.min(list.length, i + BATCH), total: list.length, label });
    }
    setBusy(null);
    setSelected(new Set()); setAllMatching(null);
    const msg = { publish: "{n} questions published.", unpublish: "{n} questions moved back to drafts.", move: "{n} questions moved.", flag: "{n} questions flagged for review.", archive: "{n} questions archived.", restore: "{n} questions restored and published.", delete: "{n} questions deleted." }[op];
    setNote({ ok: t(msg, { n: done }), skipped });
    router.refresh();
  }

  function confirmRun(op: Op, list: string[]) {
    const n = list.length;
    if (!n) return;
    if (op === "delete" && !window.confirm(t("Permanently delete {n} questions? Questions students have answered are kept (archive those instead).", { n }))) return;
    if (op === "publish" && !window.confirm(t("Publish {n} questions? Students will be able to get them in practice.", { n }))) return;
    if (op === "restore" && !window.confirm(t("Restore {n} archived questions? They will be published again.", { n }))) return;
    if (op === "unpublish" && !window.confirm(t("Move {n} questions back to drafts? Students will no longer get them.", { n }))) return;
    if (op === "archive") { const why = window.prompt(t("Archive {n} questions? Archived questions never appear in practice and keep their history. Reason:", { n }), t("No longer needed")); if (why === null) return; return void run(op, list, why); }
    if (op === "flag") { const why = window.prompt(t("What should be checked? (optional)"), ""); if (why === null) return; return void run(op, list, why); }
    if (op === "move") { if (!moveTo) return setNote({ error: t("Choose the skill to move them to.") }); return void run(op, list, moveTo); }
    void run(op, list);
  }

  const cols = 6 + (checkboxes ? 1 : 0) + (roster ? 1 : 0);
  const btn = "min-h-10 rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
  return (
    <div>
      {roster && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-2 ring-1 ring-amber-200">
          <span className="text-sm text-amber-950">{t("Press ☆ in front of the questions you want, then assign them.")}</span>
          <span className="ms-auto text-sm font-semibold text-amber-950" aria-live="polite">⭐ {starred.length}</span>
          {starred.length > 0 && <button type="button" onClick={() => saveStars([])} className="text-sm text-amber-950 underline">{t("Clear")}</button>}
          <button type="button" disabled={!starred.length} onClick={() => setAssigning(true)} className={`${btn} bg-brand-navy text-white`}>{t("Assign selected")} ({starred.length})</button>
        </div>
      )}
      {assigning && roster && <AssignQuestionsDialog roster={roster} questionIds={starred} onDone={() => saveStars([])} onClose={() => setAssigning(false)} />}

      {checkboxes && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          <span className="text-sm font-semibold text-slate-700" aria-live="polite">{t("Selected: {n}", { n: ids.length.toLocaleString("en") })}</span>
          {total > rows.length && !allMatching && <button type="button" disabled={!!busy} onClick={() => void selectAllMatching()} className={`${btn} text-brand-teal underline`}>{t("Select all {n} matching", { n: total.toLocaleString("en") })}</button>}
          {(ids.length > 0) && <button type="button" disabled={!!busy} onClick={() => { setSelected(new Set()); setAllMatching(null); }} className={`${btn} text-slate-600 underline`}>{t("Clear")}</button>}
          <span className="ms-auto flex flex-wrap items-center gap-2">
            {canPublish && <button type="button" disabled={!!busy || !ids.length} onClick={() => confirmRun("publish", ids)} className={`${btn} bg-brand-teal text-white`}>{t("Publish")}</button>}
            {canPublish && <button type="button" disabled={!!busy || !ids.length} onClick={() => confirmRun("unpublish", ids)} className={`${btn} ring-1 ring-slate-300`}>{t("Unpublish")}</button>}
            {canPublish && targets.length > 0 && (
              <span className="flex items-center gap-1">
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label={t("Move to skill")} className="min-h-10 max-w-[13rem] rounded-xl border border-slate-300 bg-white px-2 text-sm">
                  <option value="">{t("Move to skill…")}</option>
                  {targets.map((k) => <option key={k.id} value={k.id}>G{k.grade} · {k.name}</option>)}
                </select>
                <button type="button" disabled={!!busy || !ids.length || !moveTo} onClick={() => confirmRun("move", ids)} className={`${btn} ring-1 ring-slate-300`}>{t("Move")}</button>
              </span>
            )}
            <button type="button" disabled={!!busy || !ids.length} onClick={() => confirmRun("flag", ids)} className={`${btn} ring-1 ring-slate-300`}>🚩 {t("Flag")}</button>
            {canPublish && <button type="button" disabled={!!busy || !ids.length} onClick={() => confirmRun("archive", ids)} className={`${btn} ring-1 ring-slate-300`}>{t("Archive")}</button>}
            {canPublish && filter.status === "ARCHIVED" && <button type="button" disabled={!!busy || !ids.length} onClick={() => confirmRun("restore", ids)} className={`${btn} bg-emerald-600 text-white`}>♻️ {t("Restore")}</button>}
            {canDelete && <button type="button" disabled={!!busy || !ids.length} onClick={() => confirmRun("delete", ids)} className={`${btn} bg-red-700 text-white`}>{t("Delete")}</button>}
          </span>
        </div>
      )}
      {busy && (
        <div role="status" className="mb-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={busy.total} aria-valuenow={busy.done}><div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * busy.done) / Math.max(1, busy.total))}%` }} /></div>
          <p className="mt-1 text-sm text-slate-600">{busy.label} {busy.done} / {busy.total}</p>
        </div>
      )}
      {note?.ok && <p role="status" className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-teal-900">{note.ok}</p>}
      {note?.error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-800">{note.error}</p>}
      {note?.skipped && note.skipped.length > 0 && (
        <details className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"><summary>{t("{n} not changed (why)", { n: note.skipped.length })}</summary>
          <ul className="mt-1 list-disc ps-5">{note.skipped.slice(0, 30).map((x) => <li key={x.id}><Link href={`/admin/questions/${x.id}`} className="underline">{x.id.slice(-6)}</Link>: {x.reason}</li>)}</ul>
        </details>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              {roster && <th className="w-8 py-2"><span className="sr-only">{t("Star")}</span></th>}
              {checkboxes && <th className="w-8 py-2"><input type="checkbox" aria-label={t("Select all questions on this page")} checked={allOnPage} disabled={!rows.length || !!busy} onChange={() => { setAllMatching(null); setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id))); }} /></th>}
              <th className="py-2">{t("Question")}</th><th>{t("Skill")}</th><th>{t("Type")}</th><th>{t("Level")}</th><th>{t("Status")}</th><th className="text-end">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const d = details[q.id];
              return (
                <Fragment key={q.id}>
                  <tr className={`border-b align-top ${open === q.id ? "bg-sky-50/60" : ""}`}>
                    {roster && <td className="py-2">{q.status === "PUBLISHED" && q.type !== "SHORT_ANSWER" && <button type="button" onClick={() => saveStars(starred.includes(q.id) ? starred.filter((x) => x !== q.id) : [...starred, q.id])} aria-pressed={starred.includes(q.id)} aria-label={t("Star for assigning")} className="text-lg leading-none">{starred.includes(q.id) ? "⭐" : "☆"}</button>}</td>}
                    {checkboxes && <td className="py-2"><input type="checkbox" aria-label={`${t("Select")}: ${q.stem.slice(0, 60)}`} checked={allMatching ? allMatching.includes(q.id) : selected.has(q.id)} disabled={!!busy} onChange={() => toggle(q.id)} /></td>}
                    <td className="max-w-md py-2 pe-2">
                      <button type="button" onClick={() => void toggleOpen(q.id)} aria-expanded={open === q.id} className="text-start text-brand-navy hover:underline">{q.stem || t("(no text)")}</button>
                      <span className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        {q.hasPassage && <span className="rounded bg-sky-50 px-1.5 text-sky-800">{t("Passage")}</span>}
                        {q.hasImage && <span className="rounded bg-violet-50 px-1.5 text-violet-800">{t("Picture")}</span>}
                        {q.origin === "AI_GENERATED" && <span className="rounded bg-amber-50 px-1.5 text-amber-800">{t("AI-drafted")}</span>}
                        {q.mine && <span className="rounded bg-indigo-50 px-1.5 text-indigo-800">{t("mine")}</span>}
                      </span>
                    </td>
                    {/* bank questions: skill + level only (no grade); Curriculum Map questions keep their grade */}
                    <td className="pe-2">{q.onMap ? <>🧭 G{q.grade} · {q.skill}</> : q.skill}</td>
                    <td className="pe-2 text-xs">{q.type.replace(/_/g, " ").toLowerCase()}</td>
                    <td className="pe-2 whitespace-nowrap">{q.level} · {q.levelLabel}{!q.onMap && <span className="block text-xs text-slate-500">RIT {q.ritBand}</span>}</td>
                    <td className="pe-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[q.status]}`}>{t(STATUS_LABEL[q.status])}</span></td>
                    <td className="py-1.5 text-end">
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        <Link href={`/admin/questions/${q.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50">✏️ {t("Edit")}</Link>
                        {canPublish && (q.status === "DRAFT" || q.status === "UNDER_REVIEW") && <button type="button" disabled={!!busy} onClick={() => confirmRun("publish", [q.id])} className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-300 hover:bg-teal-50">{t("Publish")}</button>}
                        {canPublish && q.status === "PUBLISHED" && <button type="button" disabled={!!busy} onClick={() => confirmRun("unpublish", [q.id])} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">{t("Unpublish")}</button>}
                      </span>
                    </td>
                  </tr>
                  {open === q.id && (
                    <tr className="border-b bg-sky-50/40">
                      <td colSpan={cols} className="px-3 py-3">
                        {!d && <p className="text-slate-600">{t("Loading…")}</p>}
                        {d && "error" in d && <p role="alert" className="text-red-700">{d.error}</p>}
                        {d && !("error" in d) && (
                          <div className="space-y-2">
                            {d.passage && <details className="rounded-lg bg-white p-3 ring-1 ring-slate-200"><summary className="cursor-pointer font-semibold text-slate-700">{t("Passage")}</summary><p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-line text-slate-800">{d.passage}</p></details>}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {d.image && <img src={d.image.url} alt={d.image.alt} loading="lazy" className="max-h-48 w-auto max-w-full rounded-lg ring-1 ring-slate-200" />}
                            <p className="font-medium text-slate-900">{d.stem}</p>
                            {d.options.length > 0 && <ul className="grid gap-1 sm:grid-cols-2">{d.options.map((o) => <li key={o.label} className={`rounded-lg px-3 py-1.5 ring-1 ${o.correct ? "bg-teal-50 ring-teal-400" : "bg-white ring-slate-200"}`}><b>{o.label}.</b> {o.text}{o.correct && <span className="ms-1 font-semibold text-teal-800">✓</span>}</li>)}</ul>}
                            {d.answer && <p className="rounded-lg bg-teal-50 px-3 py-1.5 text-teal-900 ring-1 ring-teal-300"><b>{t("Answer")}:</b> {d.answer}</p>}
                            {d.whyCorrect && <p className="text-slate-700"><b>{t("Why")}:</b> {d.whyCorrect}</p>}
                            <p className="flex flex-wrap gap-2 pt-1">
                              <Link href={`/admin/questions/${q.id}`} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white">✏️ {t("Open and edit")}</Link>
                              <button type="button" disabled={!!busy} onClick={() => confirmRun("flag", [q.id])} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">🚩 {t("Flag")}</button>
                              {canDelete && <button type="button" disabled={!!busy} onClick={() => confirmRun("delete", [q.id])} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-800 ring-1 ring-red-300">{t("Delete")}</button>}
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={cols} className="py-8 text-center text-slate-500">{t("No questions match these filters.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
