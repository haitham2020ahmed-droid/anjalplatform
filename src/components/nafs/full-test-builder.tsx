"use client";
import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { BuilderRow } from "@/server/nafs/build";
import type { BankRow } from "@/server/nafs/bank";
import { AREAS_WITH_STANDARDS, BALANCED_MIX, FULL_DEFAULT, FULL_MIN_QUESTIONS, fullCoverage, fullDistribution, fullMinutes } from "@/server/nafs/coverage";
import { aiDraftsAction, bankSearchAction, fullBuildAction, fullMoreAction, fullPracticeAction, replaceAction, rowsAction, saveFullTestAction } from "@/app/teacher/nafs/actions";

type Purpose = "TEST" | "PRACTICE";
interface Std { code: string; short: string; text: string; area: string }
interface Klass { id: string; name: string; students: { id: string; name: string }[] }
const INPUT = "min-h-10 rounded-lg bg-surface px-2 text-ink ring-1 ring-line";
const NUM = `${INPUT} w-20 tabular-nums`;
const BTN = "min-h-10 rounded-lg px-3 text-sm font-semibold";
const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line";
const DIFF_NAME: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
const PROCESS: Record<string, string> = { P1: "Retrieve explicitly stated information", P2: "Make straightforward inferences", P3: "Interpret and integrate ideas and information", P4: "Evaluate and critique content and textual elements" };

/**
 * 🇸🇦 "Complete NAFS test (all standards)": one click builds a test covering EVERY Ministry standard (S01–S13 under the
 * three content areas) in the guide's proportions, scaled to the teacher's number (never below one per standard),
 * balanced difficulty, the PIRLS processes, an informational and a literary text. Before saving the teacher audits:
 * the total, the coverage table (questions, difficulty mix and processes per standard, ✓ or a warning with what the
 * bank lacks → "Generate with AI (draft)" / "Use fewer for this standard"), the texts, and every question grouped by
 * standard — replace / remove / reorder / add, change the count per standard, the time and the difficulty; the table
 * updates at once and a standard left uncovered must be confirmed before saving. Purpose: Test (fixed, timed, graded —
 * then assign online / print the booklet / bubble sheets) or Practice (the adaptive practice on the 13 standards).
 */
export function FullNafsBuilder(props: {
  classes: Klass[]; standards: Std[]; maxQuestions: number; maxMinutes: number; initialPurpose: Purpose;
  existing: { id: string | null; title: string; rows: BuilderRow[]; marks: Record<string, number> | null; timeLimitMin: number | null; locked: boolean; counts: Record<string, number> | null; written: boolean | null } | null;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const ex = props.existing;
  const [purpose, setPurpose] = useState<Purpose>(ex ? "TEST" : props.initialPurpose);
  const [rows, setRows] = useState<BuilderRow[]>(ex?.rows ?? []);
  const [marks, setMarks] = useState<Record<string, number>>(ex?.marks ?? {});
  const startCounts = ex?.counts ?? (ex ? Object.fromEntries(props.standards.map((x) => [x.code, Math.max(1, ex.rows.filter((r) => r.standard === x.code).length)])) : fullDistribution(FULL_DEFAULT.questions));
  const [counts, setCounts] = useState<Record<string, number>>(startCounts);
  const [count, setCount] = useState(String(Object.values(startCounts).reduce((a, b) => a + b, 0)));
  const [minutes, setMinutes] = useState(String(ex?.timeLimitMin ?? FULL_DEFAULT.minutes));
  const [minutesSet, setMinutesSet] = useState(Boolean(ex));
  const [written, setWritten] = useState(ex?.written ?? FULL_DEFAULT.written);
  const [dmode, setDmode] = useState<"ANY" | "1" | "2" | "3" | "MIX">("MIX");
  const [mix, setMix] = useState<{ 1: number; 2: number; 3: number }>({ ...BALANCED_MIX });
  const difficulty = dmode === "ANY" ? null : dmode === "MIX" ? mix : Number(dmode);
  const [classId, setClassId] = useState(props.classes[0]?.id ?? "");
  const [available, setAvailable] = useState<Record<string, number> | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"STANDARD" | "ORDER">("STANDARD");
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(ex?.title ?? "");
  const [addFor, setAddFor] = useState<string | null>(null);
  const [search, setSearch] = useState({ q: "", page: 1 });
  const [found, setFound] = useState<{ rows: BankRow[]; page: number; pages: number; total: number } | null>(null);
  const [aiDone, setAiDone] = useState<Record<string, number>>({});
  // practice: who, how many, when
  const [sids, setSids] = useState<string[]>([]);
  const [wholeBank, setWholeBank] = useState(false);
  const [perStudent, setPerStudent] = useState("");
  const [due, setDue] = useState("");
  const locked = Boolean(ex?.locked);
  const isTest = purpose === "TEST";
  const ids = rows.map((r) => r.id);
  const std = new Map(props.standards.map((x) => [x.code, x]));
  const cov = useMemo(() => fullCoverage(rows.map((r) => ({ id: r.id, standard: r.standard, difficulty: r.difficulty, process: r.process, kind: r.kind, passageId: r.passageId, textType: r.textType ?? null })), counts, available), [rows, counts, available]);
  const planned = Object.values(counts).reduce((a, b) => a + b, 0);
  const n = Math.round(Number(count));
  const nOk = Number.isFinite(n) && n >= FULL_MIN_QUESTIONS && n <= props.maxQuestions;
  const m = Math.round(Number(minutes));
  const mOk = minutes.trim() !== "" && Number.isFinite(m) && m >= 1 && m <= props.maxMinutes;
  const needsConfirm = cov.uncovered.length > 0;
  const totalMarks = Math.round(rows.reduce((a, r) => a + (marks[r.id] ?? 1), 0) * 100) / 100;

  const run = (fn: () => Promise<void>) => start(async () => { setError(null); try { await fn(); } catch { setError(t("Something went wrong. Try again.")); } });
  const renumber = (l: BuilderRow[]) => l.map((r, i) => ({ ...r, n: i + 1 }));
  const changeCount = (v: string) => {
    setCount(v);
    const k = Math.round(Number(v));
    if (Number.isFinite(k) && k >= FULL_MIN_QUESTIONS && k <= props.maxQuestions) { setCounts(fullDistribution(k)); if (!minutesSet) setMinutes(String(fullMinutes(k))); }
  };
  const build = () => run(async () => {
    if (!nOk) return setError(t("Set the number of questions ({min} to {n}): every standard needs at least one.", { min: FULL_MIN_QUESTIONS, n: props.maxQuestions }));
    if (!mOk && isTest) return setError(t("Set the time of the test (1 to {n} minutes).", { n: props.maxMinutes }));
    const r = await fullBuildAction({ settings: { questions: planned, minutes: m, written: isTest && written, counts }, classId: classId || null, seed: String(Date.now()), difficulty, practice: !isTest });
    if (r.error) return setError(r.error);
    setRows(r.ok!.rows); setNotes(r.ok!.notes); setAvailable(r.ok!.available); setCounts(r.ok!.counts); setMarks({}); setConfirm(false);
    if (!title) setTitle(t("Complete NAFS test (all standards)"));
  });
  /** A standard's count: lower → its last questions leave the list; higher → more questions of that standard. */
  const setStdCount = (code: string, v: number) => {
    const want = Math.max(1, Math.min(props.maxQuestions, Math.round(v) || 1));
    setCounts({ ...counts, [code]: want });
    setCount(String(planned - (counts[code] ?? 1) + want));
    const mine = rows.filter((r) => r.standard === code);
    if (!rows.length) return;
    if (want < mine.length) { const drop = new Set(mine.slice(want).map((r) => r.id)); setRows(renumber(rows.filter((r) => !drop.has(r.id)))); return; }
    if (want > mine.length) run(async () => {
      const r = await fullMoreAction({ standard: code, n: want - mine.length, current: ids, classId: classId || null, written: isTest && written });
      if (r.error) return setError(r.error);
      if ((r.ok ?? []).length < want - mine.length) setError(t("{s}: the bank has no more questions for this standard.", { s: std.get(code)?.short ?? code }));
      setRows(renumber(insertForStandard(rows, r.ok ?? [], code)));
    });
  };
  /** New questions of a standard go after that standard's last question (or at the end). */
  const insertForStandard = (list: BuilderRow[], add: BuilderRow[], code: string) => {
    const last = list.map((r) => r.standard).lastIndexOf(code);
    return last < 0 ? [...list, ...add] : [...list.slice(0, last + 1), ...add, ...list.slice(last + 1)];
  };
  const useFewer = (code: string) => { const av = available?.[code] ?? 0; setStdCount(code, Math.max(1, av)); };
  const generate = (code: string, missing: number) => run(async () => {
    const r = await aiDraftsAction({ codes: [], standard: code, count: Math.max(1, Math.min(8, missing)), withPassage: false });
    if (r.error) return setError(r.error);
    if (r.ok!.error) return setError(r.ok!.error);
    setAiDone({ ...aiDone, [code]: r.ok!.ids.length });
  });
  const replace = (id: string) => run(async () => {
    const r = await replaceAction({ questionId: id, current: ids, classId: classId || null, sameStandard: true });
    if (r.error) return setError(r.error);
    setRows(renumber(rows.map((x) => (x.id === id ? r.ok! : x))));
  });
  const remove = (id: string) => setRows(renumber(rows.filter((x) => x.id !== id)));
  const move = (i: number, d: -1 | 1) => { const l = [...rows]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setRows(renumber(l)); };
  const find = (page = 1, code = addFor) => run(async () => {
    const r = await bankSearchAction({ q: search.q, standard: code, page });
    if (r.error) return setError(r.error);
    setFound(r.ok!); setSearch({ ...search, page });
  });
  const add = (id: string, code: string | null) => run(async () => {
    if (ids.includes(id)) return;
    const r = await rowsAction([id]);
    if (r.error) return setError(r.error);
    const got = r.ok ?? [];
    setRows(renumber(code ? insertForStandard(rows, got, code) : [...rows, ...got]));
    if (code) { const now = rows.filter((x) => x.standard === code).length + got.length; if (now > (counts[code] ?? 1)) setCounts({ ...counts, [code]: now }); }
  });
  const save = () => run(async () => {
    if (!rows.length) return setError(t("Build the test first."));
    if (needsConfirm && !confirm) return setError(t("Not every standard is covered: tick the confirmation below to save anyway."));
    const settings = { kind: "FULL", purpose, counts, written: isTest && written, difficulty };
    if (isTest) {
      if (!mOk) return setError(t("Set the time of the test (1 to {n} minutes).", { n: props.maxMinutes }));
      const r = await saveFullTestAction({ id: locked ? null : ex?.id ?? null, title, questionIds: ids, marks: Object.fromEntries(ids.filter((id) => marks[id] !== undefined).map((id) => [id, marks[id]])), timeLimitMin: m, settings, confirmUncovered: confirm });
      if (r.error) return setError(r.error);
      router.push(`/teacher/nafs/tests/${r.ok}`);
    } else {
      if (!classId) return setError(t("You have no Grade 6 class yet."));
      const r = await fullPracticeAction({ title, classId, studentIds: sids.length ? sids : null, questionIds: wholeBank ? null : ids, wholeBank, maxQuestions: perStudent ? Number(perStudent) : Math.min(60, rows.length), timeLimitMin: minutes.trim() && mOk ? m : null, dueAt: due || null, confirmUncovered: confirm });
      if (r.error) return setError(r.error);
      router.push(`/teacher/nafs?tab=practice&open=${encodeURIComponent(r.ok!.id)}&msg=${encodeURIComponent(t("Given to {n} student(s). They find it in their NAFS icon.", { n: r.ok!.students }))}`);
    }
  });

  const texts = [...new Map(rows.filter((r) => r.passageId).map((r) => [r.passageId!, r])).values()].map((r) => ({
    id: r.passageId!, title: r.passageTitle ?? "", type: r.textType ?? null,
    n: rows.filter((x) => x.passageId === r.passageId).length,
    standards: [...new Set(rows.filter((x) => x.passageId === r.passageId && x.standard).map((x) => std.get(x.standard!)?.short ?? ""))].filter(Boolean).sort(),
  }));
  const solo = rows.filter((r) => !r.passageId).length;
  const klass = props.classes.find((c) => c.id === classId);
  const rowLine = (r: BuilderRow, i: number, withMove: boolean) => (
    <li key={r.id} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-ink" lang="en" dir="ltr"><b>{r.n}.</b> {r.stem}</p>
        <div className="flex flex-wrap items-center gap-1">
          {withMove && <><button type="button" onClick={() => move(i, -1)} className={`${BTN} ring-1 ring-line`} aria-label={t("Move up")}>↑</button><button type="button" onClick={() => move(i, 1)} className={`${BTN} ring-1 ring-line`} aria-label={t("Move down")}>↓</button></>}
          <button type="button" onClick={() => replace(r.id)} disabled={busy || !r.standard} className={`${BTN} text-teal-ink ring-1 ring-line disabled:opacity-40`}>{t("Replace")}</button>
          <button type="button" onClick={() => remove(r.id)} className={`${BTN} text-rose-700 ring-1 ring-rose-200`}>{t("Remove")}</button>
          {isTest && <input type="number" min={0} max={100} step={0.5} value={marks[r.id] ?? 1} onChange={(e) => setMarks({ ...marks, [r.id]: Number(e.target.value) })} className={`${INPUT} w-16`} aria-label={t("Marks")} title={t("Marks")} />}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        {r.standard ? <b className="me-1 text-ink-2" dir="ltr">{std.get(r.standard)?.short}</b> : <b className="me-1 text-amber-700">{t("No Ministry standard")}</b>}
        {t(DIFF_NAME[r.difficulty])} · {r.process} · {r.passageTitle ? `📄 ${r.passageTitle}` : t("No text")} · {r.kind === "WRITTEN" ? `✍ ${t("Short written answer")}` : `${t("Answer")}: ${"ABCD"[r.correct]}`}
      </p>
    </li>
  );

  return (
    <div className="grid gap-4">
      {locked && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("This test already has results: saving makes a new copy.")}</p>}

      <section className={`${CARD} grid gap-4 ring-2 ring-teal-200`} aria-label={t("Test settings")}>
        <p className="text-sm text-ink-2">{t("Covers EVERY standard of the NAFS reading test: the 13 Ministry standards under the three content areas, in the guide's proportions (3 per standard, 1 for S11 and S12 — 35 per text), scaled to your number of questions but never below one per standard. At least one informational and one literary text, balanced difficulty and the four PIRLS processes.")}</p>
        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold text-ink">{t("Purpose")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["TEST", "PRACTICE"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={purpose === k} disabled={Boolean(ex) && k === "PRACTICE"} onClick={() => { setPurpose(k); setError(null); }} className={`min-h-11 rounded-xl px-4 text-start text-sm ring-1 disabled:opacity-40 ${purpose === k ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>
                <b>{t(k === "TEST" ? "Test" : "Practice")}</b> <span className="opacity-80">· {t(k === "TEST" ? "fixed, timed, graded — assign online, print the booklet or bubble sheets" : "adaptive practice on the same 13 standards")}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-sm font-semibold text-ink">{t("Number of questions")} <span className="text-xs font-normal text-muted">{t("at least {n} (one per standard)", { n: FULL_MIN_QUESTIONS })}</span>
            <input type="number" min={FULL_MIN_QUESTIONS} max={props.maxQuestions} value={count} onChange={(e) => changeCount(e.target.value)} className={`${NUM} min-h-11 text-lg ${nOk ? "" : "ring-2 ring-rose-400"}`} />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">{t(isTest ? "Time (minutes)" : "Time (minutes, optional)")}
            <input type="number" min={1} max={props.maxMinutes} value={minutes} onChange={(e) => { setMinutes(e.target.value); setMinutesSet(true); }} className={`${NUM} min-h-11 text-lg ${mOk || !isTest ? "" : "ring-2 ring-rose-400"}`} />
          </label>
          <fieldset className="grid gap-1">
            <legend className="text-sm font-semibold text-ink">{t("Difficulty")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {([["MIX", "Balanced / mixed"], ["ANY", "Any"], ["1", "Easy"], ["2", "Medium"], ["3", "Hard"]] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={dmode === k} onClick={() => setDmode(k)} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 ${dmode === k ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>{t(label)}</button>
              ))}
            </div>
            {dmode === "MIX" && (
              <div className="mt-1 flex flex-wrap items-end gap-2">
                {([1, 2, 3] as const).map((k) => <label key={k} className="grid gap-1 text-xs font-semibold text-ink-2">{t(DIFF_NAME[k])} %<input type="number" min={0} max={100} value={mix[k]} onChange={(e) => setMix({ ...mix, [k]: Number(e.target.value) })} className={NUM} /></label>)}
              </div>
            )}
          </fieldset>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {isTest && <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} className="h-4 w-4" /> {t("Include the short written answers (S03, S13 — you mark them)")}</label>}
          <label className="grid gap-1 text-xs font-semibold text-ink-2">{t(isTest ? "Prefer questions this class has not seen" : "Class")}
            <select value={classId} onChange={(e) => { setClassId(e.target.value); setSids([]); }} className={INPUT}>{isTest && <option value="">—</option>}{props.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <button type="button" disabled={busy} onClick={build} className={`${BTN} min-h-11 bg-brand-navy px-5 text-white disabled:opacity-50`}>{busy ? t("Building…") : t(rows.length ? "Build again" : "Build the complete test")}</button>
        </div>
        {!rows.length && <p className="text-xs text-muted">{t("Planned")}: {props.standards.map((x) => `${x.short} ${counts[x.code] ?? 1}`).join(" · ")} = {planned}</p>}
      </section>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-rose-900 ring-1 ring-rose-200">{error}</p>}

      {rows.length > 0 && (
        <section className={CARD} aria-labelledby="cov-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="cov-h" className="text-lg font-semibold text-ink">{t("Summary to check before saving")}</h2>
            <p className="text-sm text-ink-2"><b className="text-2xl tabular-nums text-ink">{cov.total}</b> {t("questions")} · {t("{n} of 13 standards covered", { n: 13 - cov.uncovered.length })}{isTest ? ` · ${t("{n} marks", { n: totalMarks })}` : ""}</p>
          </div>
          {needsConfirm ? <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">⚠ {t("Not covered")}: {cov.uncovered.map((c) => std.get(c)?.short).join(", ")}</p>
            : <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">✓ {t("Every one of the 13 standards is covered.")}</p>}
          {cov.noStandard > 0 && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t("{n} question(s) have no Ministry standard: they cover no standard.", { n: cov.noStandard })}</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-start text-xs uppercase tracking-wide text-muted">
                <th className="py-2 text-start">{t("Standard")}</th><th className="text-start">{t("Questions")}</th><th className="text-start">{t("Difficulty")}</th><th className="text-start">{t("PIRLS processes")}</th><th className="text-start">{t("Covered")}</th>
              </tr></thead>
              <tbody>
                {AREAS_WITH_STANDARDS.map((a) => (
                  <Fragment key={a.code}>
                    <tr><td colSpan={5} className="bg-surface-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-2">{a.n}. {t(a.name)}</td></tr>
                    {a.standards.map((code) => {
                      const r = cov.rows.find((x) => x.code === code)!;
                      const lack = r.available !== null && r.available < r.want;
                      return (
                        <tr key={code} className="border-b border-line align-top">
                          <td className="py-2 pe-2"><b className="me-1 font-mono" dir="ltr">{r.short}</b><span className="text-ink-2">{t(r.text)}</span></td>
                          <td className="py-2 pe-2 whitespace-nowrap"><span className={`tabular-nums ${r.got < r.want ? "font-semibold text-amber-700" : "text-ink"}`}>{r.got}</span> / <input type="number" min={1} max={props.maxQuestions} value={counts[code] ?? 1} onChange={(e) => setStdCount(code, Number(e.target.value))} className={`${INPUT} w-14 tabular-nums`} aria-label={t("Questions for {skill}", { skill: r.short })} /></td>
                          <td className="py-2 pe-2 whitespace-nowrap text-xs">{([1, 2, 3] as const).map((k) => `${t(DIFF_NAME[k])} ${r.byDifficulty[k]}`).join(" · ")}</td>
                          <td className="py-2 pe-2 text-xs" dir="ltr">{r.processes.join(" ") || "—"}</td>
                          <td className="py-2">
                            {r.covered && r.got >= r.want ? <span className="font-semibold text-emerald-700" aria-label={t("Covered")}>✓</span>
                              : <div className="grid gap-1 text-xs">
                                <span className={r.covered ? "text-amber-800" : "font-semibold text-rose-700"}>{r.covered ? `✓ ${t("{n} fewer than planned", { n: r.want - r.got })}` : `⚠ ${t("Not covered")}`}</span>
                                {lack && <span className="text-rose-800">{t("The bank has {have} — {n} missing.", { have: r.available ?? 0, n: r.missing })}</span>}
                                <div className="flex flex-wrap gap-1">
                                  {lack && <button type="button" disabled={busy} onClick={() => generate(code, r.missing)} className="rounded-md px-2 py-1 font-semibold text-teal-ink ring-1 ring-line">✨ {t("Generate with AI (draft)")}</button>}
                                  {lack && (r.available ?? 0) >= 1 && <button type="button" onClick={() => useFewer(code)} className="rounded-md px-2 py-1 font-semibold text-ink-2 ring-1 ring-line">{t("Use fewer for this standard")}</button>}
                                  <button type="button" onClick={() => { setAddFor(code); setFound(null); find(1, code); }} className="rounded-md px-2 py-1 font-semibold text-ink-2 ring-1 ring-line">{t("Add")}</button>
                                </div>
                                {aiDone[code] !== undefined && <span className="text-emerald-800">{t("{n} draft(s) ready for review.", { n: aiDone[code] })} <Link href={`/teacher/nafs?tab=bank&src=DRAFT&std=${code}`} className="font-semibold underline">{t("Review the drafts")}</Link></span>}
                              </div>}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Difficulty")}</p>
              <p className="mt-1 tabular-nums">{([1, 2, 3] as const).map((k) => `${t(DIFF_NAME[k])} ${cov.byDifficulty[k]}`).join(" · ")}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("PIRLS processes")}</p>
              <ul className="mt-1 grid gap-0.5 text-xs">{(["P1", "P2", "P3", "P4"] as const).map((p) => <li key={p} className={cov.byProcess[p] ? "text-ink-2" : "font-semibold text-amber-700"}><b dir="ltr">{p}</b> {cov.byProcess[p]} · {t(PROCESS[p])}</li>)}</ul>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Texts used")}</p>
              {!texts.length ? <p className="mt-1 text-xs text-muted">{t("No text")}</p> : (
                <ul className="mt-1 grid gap-1 text-xs">{texts.map((x) => <li key={x.id}>📄 <b>{x.title}</b> · {t(x.type === "INFO" ? "Informational" : x.type === "LIT" ? "Literary" : "Kind not set")} · {t("{n} questions", { n: x.n })} <span className="text-muted" dir="ltr">({x.standards.join(" ")})</span></li>)}</ul>
              )}
              {solo > 0 && <p className="mt-1 text-xs text-muted">{t("{n} question(s) without a text", { n: solo })}</p>}
              {(!cov.texts.INFO || !cov.texts.LIT) && <p className="mt-1 text-xs font-semibold text-amber-700">{t(!cov.texts.INFO ? "No informational text in the test." : "No literary text in the test.")}</p>}
            </div>
          </div>
          {notes.length > 0 && <ul className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{notes.map((x) => <li key={x}>{x}</li>)}</ul>}
        </section>
      )}

      {addFor && (
        <section className={CARD} aria-labelledby="add-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="add-h" className="text-lg font-semibold text-ink">{t("Add from the NAFS bank")} · <span dir="ltr">{std.get(addFor)?.short}</span></h2>
            <button type="button" onClick={() => { setAddFor(null); setFound(null); }} className="text-sm font-semibold text-teal-ink">{t("Close")}</button>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input value={search.q} onChange={(e) => setSearch({ ...search, q: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(1); } }} placeholder={t("Words in the question")} className={`${INPUT} min-w-48 flex-1`} />
            <button type="button" onClick={() => find(1)} disabled={busy} className={`${BTN} bg-surface ring-1 ring-line`}>{t("Search")}</button>
          </div>
          {found && (
            <>
              {!found.rows.length && <p className="mt-3 text-sm text-muted">{t("No questions match.")}</p>}
              <ul className="mt-3 divide-y divide-line">
                {found.rows.map((r) => {
                  const off = ids.includes(r.id) || (r.kind === "WRITTEN" && !isTest);
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                      <p className="min-w-0 flex-1 text-sm text-ink" lang="en" dir="ltr">{r.stem} <span className="text-xs text-muted">· {t(DIFF_NAME[r.difficulty])} · {r.process}{r.kind === "WRITTEN" ? " · ✍" : ""}{r.hasPassage ? ` · 📄 ${r.passageTitle ?? ""}` : ""}</span></p>
                      <button type="button" disabled={off || busy} onClick={() => add(r.id, addFor)} className={`${BTN} bg-teal-700 text-white disabled:opacity-40`}>{t(ids.includes(r.id) ? "Added" : "Add")}</button>
                    </li>
                  );
                })}
              </ul>
              {found.pages > 1 && <div className="mt-2 flex justify-between text-sm">{found.page > 1 ? <button type="button" onClick={() => find(found.page - 1)} className="font-semibold text-teal-ink">‹ {t("Previous")}</button> : <span />}<span className="text-muted">{t("Page {n} of {total}", { n: found.page, total: found.pages })}</span>{found.page < found.pages ? <button type="button" onClick={() => find(found.page + 1)} className="font-semibold text-teal-ink">{t("Next")} ›</button> : <span />}</div>}
            </>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className={CARD} aria-labelledby="list-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="list-h" className="text-lg font-semibold text-ink">{t("The questions")} <span className="text-sm font-normal text-muted">{t("{n} questions", { n: rows.length })}</span></h2>
            <div className="flex gap-1" role="group" aria-label={t("View")}>
              {(["STANDARD", "ORDER"] as const).map((k) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`${BTN} ring-1 ${view === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink-2 ring-line"}`}>{t(k === "STANDARD" ? "By standard" : "Test order")}</button>)}
            </div>
          </div>
          {view === "STANDARD" ? (
            <div className="mt-3 grid gap-4">
              {AREAS_WITH_STANDARDS.map((a) => (
                <div key={a.code} className="grid gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{a.n}. {t(a.name)}</h3>
                  {a.standards.map((code) => {
                    const mine = rows.filter((r) => r.standard === code);
                    return (
                      <div key={code} className="rounded-xl p-2 ring-1 ring-line">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                          <p className="text-sm font-semibold text-ink"><span dir="ltr" className="font-mono">{std.get(code)?.short}</span> · {mine.length ? <span className="text-emerald-700">✓ {mine.length}</span> : <span className="text-rose-700">⚠ {t("Not covered")}</span>}</p>
                          <button type="button" onClick={() => { setAddFor(code); setFound(null); find(1, code); }} className={`${BTN} text-teal-ink ring-1 ring-line`}>+ {t("Add")}</button>
                        </div>
                        <ol className="mt-1 grid gap-1.5">{mine.map((r) => rowLine(r, rows.indexOf(r), false))}</ol>
                      </div>
                    );
                  })}
                </div>
              ))}
              {cov.noStandard > 0 && <div className="grid gap-1.5"><h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t("No Ministry standard")}</h3><ol className="grid gap-1.5">{rows.filter((r) => !r.standard).map((r) => rowLine(r, rows.indexOf(r), false))}</ol></div>}
            </div>
          ) : (
            <ol className="mt-3 grid gap-2">
              {rows.map((r, i) => (
                <Fragment key={r.id}>
                  {r.passageId && rows[i - 1]?.passageId !== r.passageId && <p className="mt-1 text-xs font-semibold text-teal-ink">📄 {r.passageTitle}</p>}
                  {rowLine(r, i, true)}
                </Fragment>
              ))}
            </ol>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className={`${CARD} grid gap-3`} aria-label={t("Save")}>
          {!isTest && (
            <div className="grid gap-3">
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={wholeBank} onChange={(e) => setWholeBank(e.target.checked)} className="h-4 w-4" /> {t("Adapt over every bank question of the 13 standards (not only this list)")}</label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2">{t("Only these students (optional)")}
                  <select multiple size={4} value={sids} onChange={(e) => setSids([...e.target.selectedOptions].map((o) => o.value))} className="rounded-xl bg-surface px-2 py-1 ring-1 ring-line">
                    {(klass?.students ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Questions per student")}<input type="number" min={1} max={60} value={perStudent} placeholder={String(Math.min(60, rows.length))} onChange={(e) => setPerStudent(e.target.value)} className={`${INPUT} w-24`} /></label>
                <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Due date (optional)")}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={INPUT} /></label>
              </div>
            </div>
          )}
          {needsConfirm && <label className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1 h-4 w-4" /> {t("I know these standards are not covered and want to save anyway: {list}", { list: cov.uncovered.map((c) => std.get(c)?.short).join(", ") })}</label>}
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2">{t(isTest ? "Test name" : "Name")}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={`${INPUT} min-h-11`} /></label>
            <p className="text-sm text-ink-2">{t("{n} questions", { n: rows.length })}{mOk ? ` · ${t("{n} minutes", { n: m })}` : ""}</p>
            <button type="button" disabled={busy || !title.trim() || (needsConfirm && !confirm)} onClick={save} className="min-h-11 rounded-xl bg-brand-navy px-6 font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : t(isTest ? "Save the test" : "Give the practice")}</button>
          </div>
          {isTest && <p className="text-xs text-muted">{t("After saving: assign it online, print the booklet or print bubble sheets from the test's page.")}</p>}
        </section>
      )}
    </div>
  );
}
