"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { starAssignAction, starCancelAction, starMasteredAction } from "@/app/teacher/star-actions";
import { ExcludeMasteredPrompt } from "./exclude-mastered";
import { SourceSelect } from "./source-select";
import type { AssignSource } from "@/lib/assign-source";

/**
 * ☆ Quick assign (owner r67): a small star beside a skill (or a Learn lesson). ☆ → one press assigns it to the class
 * with the due date shown (default: the end of that school week, editable under 📅); ★ → pressing again cancels it
 * (soft cancel). Drop-in anywhere a skill list makes sense: <StarAssign kind="SKILL" refId={skillId} classId={…}
 * assignedId={open assignment id or null} defaultDue="yyyy-mm-dd" />.
 * ⭐ When some students already mastered the skill, the teacher is asked first: "5 students already mastered this
 * skill — exclude them?" (Yes / No).
 * 🏷️ r74: a skill needs its Source (MAP · NAFS · Curriculum · Grammar · RTI): the first press opens the (empty) Source
 * choice beside the star; choosing one assigns. A Learn lesson has no source.
 */
export function StarAssign({ kind = "SKILL", refId, classId, assignedId, defaultDue, defaultStart, track, label, onChange }: {
  kind?: "SKILL" | "LESSON"; refId: string; classId: string; assignedId: string | null; defaultDue: string; /** r68: the start date (yyyy-mm-dd; empty = now) */ defaultStart?: string;
  /** where the work shows for students (MAP, CURRICULUM, NAFS…) */ track?: string; /** the item's name (for screen readers) */ label?: string;
  onChange?: (id: string | null) => void;
}) {
  const t = useT();
  const [id, setId] = useState<string | null>(assignedId);
  const [due, setDue] = useState(defaultDue);
  const [startDay, setStartDay] = useState(defaultStart ?? "");
  const [showDue, setShowDue] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [busy, start] = useTransition();
  const [source, setSource] = useState<AssignSource | "">("");
  const [askSource, setAskSource] = useState(false);
  const assign = (excludeMastered: boolean) => start(async () => {
    setAsk(null);
    const r = await starAssignAction({ kind, ref: refId, classId, dueAt: due || null, startAt: startDay || null, track: track ?? null, excludeMastered, source: source || null });
    if (r.ok) { setId(r.id); onChange?.(r.id); } else setMsg(r.message);
  });
  const go = (src: AssignSource | "") => start(async () => {
    if (kind === "SKILL") {
      const m = await starMasteredAction({ classId, skillId: refId });
      if (m.count > 0) { setAsk(m.count); return; }
    }
    const r = await starAssignAction({ kind, ref: refId, classId, dueAt: due || null, startAt: startDay || null, track: track ?? null, source: src || null });
    if (r.ok) { setId(r.id); onChange?.(r.id); } else setMsg(r.message);
  });
  const press = () => {
    setMsg(null);
    if (id) {
      start(async () => {
        const r = await starCancelAction({ kind, id });
        if (r.ok) { setId(null); onChange?.(null); } else setMsg(r.message ?? t("Could not cancel."));
      });
      return;
    }
    // r74: a skill needs its source first (always chosen, never a default)
    if (kind === "SKILL" && !source) { setAskSource(true); return; }
    go(source);
  };
  const name = label ? ` · ${label}` : "";
  return (
    <span data-testid="star-assign" className="inline-flex flex-wrap items-center gap-1">
      <button type="button" onClick={press} disabled={busy || !classId || ask !== null} aria-pressed={Boolean(id)}
        title={id ? t("Assigned: press to cancel") : t("Assign to the class (due {date})", { date: due })}
        aria-label={`${id ? t("Assigned: press to cancel") : t("Assign to the class")}${name}`}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none transition active:scale-95 disabled:opacity-50 ${id ? "bg-amber-100 text-amber-600 ring-1 ring-amber-300" : "text-slate-400 hover:bg-amber-50 hover:text-amber-500"}`}>
        <span aria-hidden="true">{busy ? "…" : id ? "★" : "☆"}</span>
      </button>
      {!id && ask === null && (showDue
        ? <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-slate-500">{t("Start date")}<input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} aria-label={t("Start date")} className="h-8 rounded-lg border border-slate-300 px-1 text-xs" dir="ltr" />{t("End (due) date")}<input type="date" value={due} min={startDay || undefined} onChange={(e) => setDue(e.target.value)} aria-label={t("End (due) date")} className="h-8 rounded-lg border border-slate-300 px-1 text-xs" dir="ltr" /></span>
        : <button type="button" onClick={() => setShowDue(true)} title={t("Due {date}", { date: due })} aria-label={t("Change the due date")} className="text-xs text-slate-400 hover:text-brand-navy">📅</button>)}
      {askSource && !id && <SourceSelect t={t} compact value={source} onChange={(v) => { setSource(v); if (v) { setAskSource(false); go(v); } }} />}
      {ask !== null && <ExcludeMasteredPrompt count={ask} t={t} busy={busy} onYes={() => assign(true)} onNo={() => assign(false)} />}
      {msg && <span role="alert" className="text-xs text-red-700">{msg}</span>}
    </span>
  );
}
