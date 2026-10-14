"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { sheetLayout } from "@/lib/omr/layout";
import { matchSheetCode } from "@/lib/omr/sheet-ids";
import type { OmrQuality, OmrResult, OmrRow } from "@/lib/omr/read";
import { SheetScanner } from "@/components/omr/sheet-scanner";
import { saveAnswersAction } from "@/app/teacher/nafs/actions";
import { Combo } from "@/components/ui/combo";

type A = 0 | 1 | 2 | 3 | null;
interface Student { id: string; name: string; answers: A[] | null; source: string | null }
interface Scanned {
  key: string; preview: string; studentId: string; answers: A[]; status: OmrRow["status"][]; wrongTest: boolean; saved: string | null; error: string | null;
  /** the reader's suggestion for a row it is not sure of (never saved until the teacher picks) */
  suggest: A[];
  /** false = this row still needs the teacher's decision (an unsure or double mark) */
  resolved: boolean[];
  quality: OmrQuality | null;
  /** a LOW-confidence sheet: the teacher ticked "I checked every answer against the paper" */
  checkedAll: boolean;
}
const L = ["A", "B", "C", "D"];

/**
 * 🇸🇦 Grading on paper: (1) scan — each photo is read in the browser by the OMR reader; the review screen shows the
 * sheet (an object URL, never uploaded) next to the detected answers, the sheet's confidence (Clear / Check some
 * answers / Check every answer) and the list of answers to check; an unsure row has NO answer until the teacher picks
 * one (the reader's suggestion is shown, one tap accepts it), so nothing uncertain is ever saved without the
 * teacher; the student from the sheet's code (or chosen for a blank sheet), then Confirm saves the answers only;
 * (2) type — a fast keyboard grid (A–D or 1–4, space / – for blank; the cursor moves on by itself).
 */
export function NafsGradeSheets({ testId, questions, initialMode, students, scannerLabels }: { testId: string; questions: number; initialMode: "scan" | "type"; students: Student[]; scannerLabels: Record<string, string> }) {
  const t = useT();
  const [mode, setMode] = useState(initialMode);
  const layout = useMemo(() => sheetLayout(questions), [questions]);
  const [sheets, setSheets] = useState<Scanned[]>([]);
  const [at, setAt] = useState(0);
  const [busy, start] = useTransition();
  const [done, setDone] = useState<Record<string, string>>(Object.fromEntries(students.filter((s) => s.answers).map((s) => [s.id, s.source ?? ""])));
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "";
  // object URLs live only in this page: freed when the page closes
  const urls = useRef<string[]>([]);
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u); }, []);

  const onSheet = (r: OmrResult, preview: string) => {
    urls.current.push(preview);
    const m = matchSheetCode(r.code, testId, students.map((s) => s.id));
    const rows = Array.from({ length: questions }, (_x, i) => r.rows.find((x) => x.q === i + 1));
    // only clear rows get an answer; an unsure or double mark waits for the teacher (the suggestion is shown)
    const clear = (x: OmrRow | undefined) => !x || x.status === "OK" || x.status === "BLANK";
    setSheets((l) => [...l, {
      key: `${Date.now()}-${l.length}`, preview, studentId: m.studentId ?? "",
      answers: rows.map((x) => (x && x.status === "OK" ? x.answer : null)), status: rows.map((x) => x?.status ?? "BLANK"), wrongTest: m.wrongTest, saved: null,
      suggest: rows.map((x) => (x && x.status === "UNSURE" ? (x.suggest ?? x.answer) : null)), resolved: rows.map((x) => r.ok && clear(x)), quality: r.quality ?? null, checkedAll: false,
      error: r.ok ? null : t(r.error === "TOO_BLURRY" ? "The photo is too blurry: hold the phone still and try again." : r.error === "WRONG_SHEET" ? "This is not a sheet of this test." : "No corner markers found: take the photo again with the whole sheet in view."),
    }]);
  };
  const cur = sheets[at];
  const patch = (p: Partial<Scanned>) => setSheets((l) => l.map((x, i) => (i === at ? { ...x, ...p } : x)));
  const unresolved = cur ? cur.resolved.filter((x) => !x).length : 0;
  const low = Boolean(cur) && (!cur!.quality || cur!.quality.confidence === "LOW");
  const confirm = () => start(async () => {
    if (!cur || !cur.studentId) return;
    // never saved while an answer still waits for the teacher, or a low-confidence sheet is not checked
    if (unresolved > 0 || (low && !cur.checkedAll)) return;
    const r = await saveAnswersAction({ testId, studentId: cur.studentId, answers: cur.answers, source: "SHEET", review: { unresolved, confidence: cur.quality?.confidence ?? "LOW", checkedAll: cur.checkedAll } });
    if (r.error) { patch({ error: t(r.error) }); return; }
    patch({ saved: t("Saved: {c} of {n} correct · {p} / {m} marks", { c: r.ok!.correct, n: questions, p: r.ok!.points, m: r.ok!.maxPoints }), error: null });
    setDone((d) => ({ ...d, [cur.studentId]: "SHEET" }));
    if (at < sheets.length - 1) setAt(at + 1);
  });

  return (
    <div className="grid gap-4">
      <nav className="flex gap-1.5" aria-label={t("Grade bubble sheets")}>
        {(["scan", "type"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ${mode === m ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>{t(m === "scan" ? "Scan sheets" : "Type answers")}</button>)}
      </nav>
      <p className="text-sm text-muted">{t("{n} of {total} students have answers saved.", { n: Object.keys(done).length, total: students.length })}</p>

      {mode === "scan" && (
        <>
          <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
            <p className="mb-3 text-sm text-ink-2">🔒 {t("The sheets are read in your browser: no image is sent or stored, only the answers.")}</p>
            <SheetScanner layout={layout} onSheet={onSheet} labels={scannerLabels} />
          </section>
          {cur && (
            <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line" aria-label={t("Review")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink">{t("Review sheet {n} of {total}", { n: at + 1, total: sheets.length })}</h2>
                <div className="flex gap-1.5">
                  <button type="button" disabled={at === 0} onClick={() => setAt(at - 1)} className="min-h-10 rounded-lg px-3 font-semibold ring-1 ring-line disabled:opacity-40">‹</button>
                  <button type="button" disabled={at >= sheets.length - 1} onClick={() => setAt(at + 1)} className="min-h-10 rounded-lg px-3 font-semibold ring-1 ring-line disabled:opacity-40">›</button>
                </div>
              </div>
              {cur.wrongTest && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{t("This is not a sheet of this test.")}</p>}
              {cur.error && <p role="alert" className="mt-2 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{cur.error}</p>}
              {cur.quality && !cur.error && <SheetConfidenceNote q={cur.quality} unresolved={unresolved} />}
              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cur.preview} alt={t("The scanned sheet")} className="max-h-[75vh] w-full rounded-xl object-contain ring-1 ring-line" />
                <div>
                  <div className={`grid gap-1 rounded-xl text-sm font-semibold text-ink-2 ${cur.studentId ? "" : "bg-amber-50 p-1 ring-1 ring-amber-300"}`}><span>{t("Student")}</span>
                    <Combo label={t("Student")} value={cur.studentId} onChange={(v) => patch({ studentId: v, saved: null })} placeholder={t("Choose the student")}
                      options={students.map((s) => ({ value: s.id, label: s.name, hint: done[s.id] ? "✓" : undefined }))} />
                  </div>
                  <ol className="mt-3 grid max-h-[60vh] gap-1 overflow-y-auto pe-1">
                    {cur.answers.map((a, i) => {
                      const st = cur.status[i];
                      const todo = !cur.resolved[i];
                      const warn = st !== "OK" || todo;
                      const pick = (v: A) => { const n = [...cur.answers]; n[i] = v; const rs = [...cur.resolved]; rs[i] = true; patch({ answers: n, resolved: rs, saved: null }); };
                      return (
                        <li key={i} className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 ${todo ? "bg-rose-50 ring-1 ring-rose-300" : warn ? "bg-amber-50 ring-1 ring-amber-200" : ""}`}>
                          <b className="w-7 text-end text-sm tabular-nums text-ink">{i + 1}</b>
                          {L.map((l, k) => <button key={l} type="button" aria-pressed={a === k} onClick={() => pick(a === k && !todo ? null : (k as A))}
                            className={`h-9 w-9 rounded-full text-sm font-bold ring-1 ${a === k ? "bg-brand-navy text-white ring-brand-navy" : todo && cur.suggest[i] === k ? "bg-amber-100 text-amber-900 ring-amber-400" : "bg-surface text-ink-2 ring-line"}`}>{l}</button>)}
                          {todo && <button type="button" onClick={() => pick(null)} className="h-9 rounded-full px-2 text-xs font-semibold text-ink-2 ring-1 ring-line">{t("No answer")}</button>}
                          {todo ? <span className="text-xs font-semibold text-rose-800">{st === "MULTIPLE" ? t("More than one mark: pick one") : cur.suggest[i] !== null ? t("Check: looks like {l}", { l: L[cur.suggest[i]!] }) : t("Check this answer")}</span>
                            : warn && <span className="text-xs font-semibold text-amber-800">{t(st === "BLANK" ? "Blank" : "Checked")}</span>}
                        </li>
                      );
                    })}
                  </ol>
                  {low && <label className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200"><input type="checkbox" checked={cur.checkedAll} onChange={(e) => patch({ checkedAll: e.target.checked })} className="mt-0.5 h-4 w-4" /> {t("I checked every answer against the paper.")}</label>}
                  {unresolved > 0 && <p className="mt-3 text-sm font-semibold text-rose-800" role="status">{t("{n} answer(s) still to check before saving.", { n: unresolved })}</p>}
                  <button type="button" disabled={busy || !cur.studentId || cur.wrongTest || unresolved > 0 || (low && !cur.checkedAll)} onClick={confirm} className="mt-3 min-h-12 w-full rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : t("Confirm and save")}</button>
                  {cur.saved && <p role="status" className="mt-2 text-sm font-semibold text-emerald-700">✓ {cur.saved}</p>}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {mode === "type" && <TypeGrid testId={testId} questions={questions} students={students} onSaved={(id) => setDone((d) => ({ ...d, [id]: "TYPED" }))} />}
    </div>
  );
}

/** The sheet's confidence, in plain words, with the questions to check. */
export function SheetConfidenceNote({ q, unresolved }: { q: OmrQuality; unresolved: number }) {
  const t = useT();
  const why: Record<string, string> = { BLUR: "the photo is blurry", CONTRAST: "the photo is dark or the marks are faint", ALIGN: "the sheet is hard to line up (folded, cut off or very tilted)", MANY_UNSURE: "many marks are unclear", LIGHT_MARKS: "some marks are light" };
  const tone = q.confidence === "HIGH" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : q.confidence === "MEDIUM" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-rose-50 text-rose-900 ring-rose-200";
  return (
    <div role="status" className={`mt-2 rounded-xl px-4 py-2 text-sm ring-1 ${tone}`}>
      <b>{t(q.confidence === "HIGH" ? "Clear sheet: every answer was read with confidence." : q.confidence === "MEDIUM" ? "Check some answers." : "Low confidence: check every answer, or take the photo again.")}</b>
      {q.reasons.filter((r) => why[r]).length > 0 && <span> {t("Why:")} {q.reasons.filter((r) => why[r]).map((r) => t(why[r])).join(" · ")}.</span>}
      {q.check.length > 0 && <span className="block">{t("Check these answers:")} <span dir="ltr" className="font-semibold tabular-nums">{q.check.join(", ")}</span>{unresolved === 0 ? ` ✓ ${t("Checked")}` : ""}</span>}
    </div>
  );
}

function TypeGrid({ testId, questions, students, onSaved }: { testId: string; questions: number; students: Student[]; onSaved: (id: string) => void }) {
  const t = useT();
  const [grid, setGrid] = useState<Record<string, A[]>>(Object.fromEntries(students.map((s) => [s.id, s.answers ?? Array.from({ length: questions }, () => null)])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const cells = useRef<Map<string, HTMLInputElement>>(new Map());
  const focus = (r: number, c: number) => { const s = students[r]; if (s) cells.current.get(`${s.id}:${c}`)?.focus(); };
  const set = (sid: string, q: number, v: A) => { setGrid((g) => ({ ...g, [sid]: g[sid].map((x, i) => (i === q ? v : x)) })); setDirty((d) => new Set(d).add(sid)); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const sid = students[r].id, k = e.key.toUpperCase();
    const idx = "ABCD".indexOf(k) >= 0 && k.length === 1 ? "ABCD".indexOf(k) : "1234".indexOf(k) >= 0 && k.length === 1 ? "1234".indexOf(k) : -1;
    if (idx >= 0) { e.preventDefault(); set(sid, c, idx as A); if (c + 1 < questions) focus(r, c + 1); else focus(r + 1, 0); }
    else if (k === " " || k === "-") { e.preventDefault(); set(sid, c, null); if (c + 1 < questions) focus(r, c + 1); }
    else if (k === "BACKSPACE") { e.preventDefault(); set(sid, c, null); if (c > 0) focus(r, c - 1); }
    else if (k === "ARROWRIGHT") { e.preventDefault(); focus(r, Math.min(questions - 1, c + 1)); }
    else if (k === "ARROWLEFT") { e.preventDefault(); focus(r, Math.max(0, c - 1)); }
    else if (k === "ARROWDOWN" || k === "ENTER") { e.preventDefault(); focus(r + 1, c); }
    else if (k === "ARROWUP") { e.preventDefault(); focus(r - 1, c); }
    else if (k !== "TAB") e.preventDefault();
  };
  const saveAll = () => start(async () => {
    for (const sid of dirty) {
      const r = await saveAnswersAction({ testId, studentId: sid, answers: grid[sid], source: "TYPED" });
      setMsg((m) => ({ ...m, [sid]: r.error ? r.error : `${r.ok!.correct}/${questions}` }));
      if (!r.error) { onSaved(sid); setDirty((d) => { const n = new Set(d); n.delete(sid); return n; }); }
    }
  });
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
      <p className="text-sm text-ink-2">{t("Type A, B, C, D (or 1–4) — the cursor moves on by itself. Space or – = blank. Arrows and Enter move around.")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-sm">
          <thead><tr><th className="sticky start-0 bg-surface pe-2 text-start text-xs text-muted">{t("Student")}</th>{Array.from({ length: questions }, (_x, i) => <th key={i} className="w-8 text-center text-xs text-muted">{i + 1}</th>)}<th /></tr></thead>
          <tbody>
            {students.map((s, r) => (
              <tr key={s.id}>
                <th scope="row" className="sticky start-0 whitespace-nowrap bg-surface pe-2 text-start font-semibold text-ink">{s.name}{dirty.has(s.id) ? " •" : ""}</th>
                {grid[s.id].map((a, c) => (
                  <td key={c}><input ref={(el) => { if (el) cells.current.set(`${s.id}:${c}`, el); }} value={a === null ? "" : L[a]} onKeyDown={(e) => onKey(e, r, c)} onChange={() => undefined}
                    aria-label={t("{name}, question {n}", { name: s.name, n: c + 1 })} className="h-8 w-8 rounded-md bg-surface-2 text-center font-bold uppercase text-ink ring-1 ring-line focus:bg-white focus:ring-2 focus:ring-teal-500" /></td>
                ))}
                <td className="ps-2 text-xs text-muted">{msg[s.id] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" disabled={busy || !dirty.size} onClick={saveAll} className="mt-3 min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : t("Save {n} student(s)", { n: dirty.size })}</button>
    </section>
  );
}
