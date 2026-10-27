"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { bulkAssignedAction, setTabAssignedAction } from "@/app/teacher/assigned/actions";
import { WORK_TABS, WORK_TAB_LABEL } from "@/lib/work-tab";

/**
 * ☑ Assigned → several at once (owner r68): the list's checkboxes (name "sel", value "KIND:id", data-kind, data-unit)
 * + "Select all shown" + smart selects (by type, by unit) → "Cancel selected" (asked once). Cancelled rows disappear
 * from the list at once and a small toast says "Cancelled 5 · Undo" for a few seconds. With Status = Cancelled the
 * same bar offers "Undo selected". Light: no extra reads, the page refreshes once.
 */
export function AssignedBulkBar({ listId, kinds, units, cancelledView }: { listId: string; kinds: { key: string; label: string }[]; units: string[]; cancelledView: boolean }) {
  const t = useT();
  const router = useRouter();
  const [n, setN] = useState(0);
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; undo: string[] | null } | null>(null);
  const [tabVal, setTabVal] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxes = useCallback(() => Array.from(document.querySelectorAll<HTMLInputElement>(`#${CSS.escape(listId)} input[type=checkbox][name="sel"]`)), [listId]);
  const recount = useCallback(() => setN(boxes().filter((b) => b.checked).length), [boxes]);
  useEffect(() => {
    const el = document.getElementById(listId);
    el?.addEventListener("change", recount);
    recount();
    return () => el?.removeEventListener("change", recount);
  }, [listId, recount]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = (text: string, undo: string[] | null) => {
    setToast({ text, undo });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 8000);
  };
  const pick = (f: (b: HTMLInputElement) => boolean) => { for (const b of boxes()) b.checked = f(b); recount(); };
  const allOn = () => { const list = boxes(); const on = list.some((b) => !b.checked); for (const b of list) b.checked = on; recount(); };
  const run = (op: "cancel" | "restore", refs: string[]) => start(async () => {
    const r = await bulkAssignedAction({ op, refs });
    if (!r.ok) { show(r.message ? t(r.message) : t("Nothing was changed."), null); return; }
    pick(() => false);
    if (op === "cancel") show(t("Cancelled {n}", { n: r.done.length }), r.done);
    else show(t("Restored {n}", { n: r.done.length }), null);
    router.refresh();
  });
  const go = () => {
    const refs = boxes().filter((b) => b.checked).map((b) => b.value);
    if (!refs.length) return;
    if (cancelledView) { run("restore", refs); return; }
    if (!window.confirm(t("Cancel {n} items for everyone? Students will no longer see them; their answers are kept.", { n: refs.length }))) return;
    run("cancel", refs);
  };
  /** 📂 "Set tab" on the ticked SKILL rows (My Work tab) — a non-SKILL ref is quietly skipped (setTabAssignedAction). */
  const setTab = () => start(async () => {
    const refs = boxes().filter((b) => b.checked).map((b) => b.value);
    if (!refs.length) return;
    const r = await setTabAssignedAction({ refs, tab: tabVal });
    if (!r.ok) { show(r.message ? t(r.message) : t("Nothing was changed."), null); return; }
    pick(() => false);
    show(tabVal ? t("Tab set.") : t("Tab cleared."), null);
    router.refresh();
  });
  const field = "h-8 rounded-lg bg-surface px-2 text-xs text-ink ring-1 ring-line";
  return (
    <>
      <div data-testid="assigned-bulk" className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
        <button type="button" onClick={allOn} className="inline-flex h-8 items-center rounded-lg bg-surface px-2.5 font-semibold text-brand-navy ring-1 ring-line hover:ring-brand-teal">☑ {t("Select all shown")}</button>
        {kinds.length > 1 && (
          <select aria-label={t("Select by type")} className={field} value="" onChange={(e) => { const k = e.target.value; if (k) pick((b) => b.checked || b.dataset.kind === k); }}>
            <option value="">{t("Select by type…")}</option>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        )}
        {units.length > 0 && (
          <select aria-label={t("Select by unit")} className={field} value="" onChange={(e) => { const u = e.target.value; if (u) pick((b) => b.checked || b.dataset.unit === u); }}>
            <option value="">{t("Select by unit…")}</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        {!cancelledView && (
          <>
            <select aria-label={t("My Work tab")} className={field} value={tabVal} onChange={(e) => setTabVal(e.target.value)}>
              <option value="">{t("No tab")}</option>
              {WORK_TABS.map((k) => <option key={k} value={k}>{t(WORK_TAB_LABEL[k])}</option>)}
            </select>
            <button type="button" onClick={setTab} disabled={!n || busy}
              className="inline-flex h-8 items-center rounded-lg bg-surface px-2.5 font-semibold text-brand-navy ring-1 ring-line hover:ring-brand-teal disabled:opacity-50">
              📂 {t("Set the tab for the ticked skill(s)")}
            </button>
          </>
        )}
        {n > 0 && <button type="button" onClick={() => pick(() => false)} className="font-semibold text-muted hover:underline">{t("Clear")}</button>}
        <span className="ms-auto text-muted" dir="ltr">{t("{n} selected", { n })}</span>
        <button type="button" onClick={go} disabled={!n || busy}
          className={`inline-flex h-8 items-center rounded-lg px-3 font-semibold ring-1 disabled:opacity-50 ${cancelledView ? "bg-surface text-brand-navy ring-line hover:ring-brand-teal" : "bg-rose-600 text-white ring-rose-700 hover:bg-rose-700"}`}>
          {busy ? "…" : cancelledView ? t("Undo selected") : t("Cancel selected")}
        </button>
      </div>
      {toast && (
        <div role="status" data-testid="assigned-toast" className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-max max-w-[92vw] items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <span>{toast.text}</span>
          {toast.undo && <button type="button" disabled={busy} onClick={() => { const u = toast.undo!; setToast(null); run("restore", u); }} className="font-semibold text-teal-300 underline">{t("Undo")}</button>}
        </div>
      )}
    </>
  );
}
