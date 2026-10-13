"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { sheetLayout } from "@/lib/omr/layout";
import { matchSheetCode } from "@/lib/omr/sheet-ids";
import type { OmrResult, OmrRow } from "@/lib/omr/read";
import { SheetScanner } from "@/components/omr/sheet-scanner";
import { saveAnswersAction } from "@/app/teacher/nafs/actions";

type A = 0 | 1 | 2 | 3 | null;
interface Student { id: string; name: string; answers: A[] | null; source: string | null }
interface Scanned { key: string; preview: string; studentId: string; answers: A[]; status: OmrRow["status"][]; wrongTest: boolean; saved: string | null; error: string | null }
const L = ["A", "B", "C", "D"];

/**
 * 🇸🇦 Grading on paper: (1) scan — each photo is read in the browser by the OMR reader; the review screen shows the
 * sheet (an object URL, never uploaded) next to the detected answers, uncertain rows highlighted, one tap to fix, the
 * student from the sheet's code (or chosen for a blank sheet), then Confirm saves the answers only; (2) type — a fast
 * keyboard grid (A–D or 1–4, space / – for blank; the cursor moves on by itself).
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
    setSheets((l) => [...l, {
      key: `${Date.now()}-${l.length}`, preview, studentId: m.studentId ?? "",
      answers: rows.map((x) => (x && x.status !== "MULTIPLE" ? x.answer : null)), status: rows.map((x) => x?.status ?? "BLANK"), wrongTest: m.wrongTest, saved: null,
      error: r.ok ? null : t(r.error === "TOO_BLURRY" ? "The photo is too blurry: hold the phone still and try again." : r.error === "WRONG_SHEET" ? "This is not a sheet of this test." : "No corner markers found: take the photo again with the whole sheet in view."),
    }]);
  };
  const cur = sheets[at];
  const patch = (p: Partial<Scanned>) => setSheets((l) => l.map((x, i) => (i === at ? { ...x, ...p } : x)));
  const confirm = () => start(async () => {
    if (!cur || !cur.studentId) return;
    const r = await saveAnswersAction({ testId, studentId: cur.studentId, answers: cur.answers, source: "SHEET" });
    if (r.error) { patch({ error: r.error }); return; }
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
              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cur.preview} alt={t("The scanned sheet")} className="max-h-[75vh] w-full rounded-xl object-contain ring-1 ring-line" />
                <div>
                  <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Student")}
                    <select value={cur.studentId} onChange={(e) => patch({ studentId: e.target.value, saved: null })} className={`min-h-11 rounded-xl px-3 ring-1 ${cur.studentId ? "bg-surface ring-line" : "bg-amber-50 ring-amber-300"}`}>
                      <option value="">{t("Choose the student")}</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.name}{done[s.id] ? " ✓" : ""}</option>)}
                    </select>
                  </label>
                  <ol className="mt-3 grid max-h-[60vh] gap-1 overflow-y-auto pe-1">
                    {cur.answers.map((a, i) => {
                      const st = cur.status[i];
                      const warn = st !== "OK";
                      return (
                        <li key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${warn ? "bg-amber-50 ring-1 ring-amber-300" : ""}`}>
                          <b className="w-7 text-end text-sm tabular-nums text-ink">{i + 1}</b>
                          {L.map((l, k) => <button key={l} type="button" aria-pressed={a === k} onClick={() => { const n = [...cur.answers]; n[i] = a === k ? null : (k as A); const s = [...cur.status]; s[i] = "OK"; patch({ answers: n, status: s, saved: null }); }}
                            className={`h-9 w-9 rounded-full text-sm font-bold ring-1 ${a === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink-2 ring-line"}`}>{l}</button>)}
                          {warn && <span className="text-xs font-semibold text-amber-800">{t(st === "MULTIPLE" ? "More than one mark" : st === "BLANK" ? "Blank" : "Check")}</span>}
                        </li>
                      );
                    })}
                  </ol>
                  <button type="button" disabled={busy || !cur.studentId || cur.wrongTest} onClick={confirm} className="mt-3 min-h-12 w-full rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : t("Confirm and save")}</button>
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
