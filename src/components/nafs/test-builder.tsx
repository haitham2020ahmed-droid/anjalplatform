"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { BuilderRow, MinistrySettings } from "@/server/nafs/build";
import type { BankRow } from "@/server/nafs/bank";
import type { SimulationSettings } from "@/server/nafs/framework";
import { aiDraftsAction, automaticAction, bankSearchAction, ministryAction, replaceAction, rowsAction, saveTestAction, simulationAction } from "@/app/teacher/nafs/actions";

type Mode = "SIMULATION" | "MINISTRY" | "AUTO" | "MANUAL" | "AI";
interface Skill { code: string; name: string; domain: string }
const INPUT = "min-h-10 rounded-lg bg-surface px-2 text-ink ring-1 ring-line";
const NUM = `${INPUT} w-20 tabular-nums`;
const BTN = "min-h-10 rounded-lg px-3 text-sm font-semibold";
const DIFF_NAME: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

/**
 * 🇸🇦 The NAFS test builder: NAFS simulation (preset), Ministry booklet model (preset: the 13 standards, or a whole model
 * booklet), Automatic (skills + number of questions, total or per skill), Manual (pick from the NAFS bank) and AI
 * drafts. In every mode the teacher sets the NUMBER OF QUESTIONS and the TIME first (required). Every built test opens
 * as a list the teacher changes freely: replace / remove / move / add questions and marks, then saves.
 */
export function NafsTestBuilder(props: {
  initialMode: Mode; skills: Skill[]; domains: { code: string; name: string }[]; classes: { id: string; name: string }[];
  simulation: SimulationSettings; ministry: MinistrySettings; maxQuestions: number; maxMinutes: number;
  standards: { code: string; short: string; text?: string }[]; booklets: { code: string; title: string; questions: number; written: number }[];
  existing: { id: string | null; title: string; mode: Mode; rows: BuilderRow[]; marks: Record<string, number> | null; timeLimitMin: number | null; locked: boolean } | null;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<Mode>(props.existing?.mode ?? props.initialMode);
  const [title, setTitle] = useState(props.existing?.title ?? "");
  const [rows, setRows] = useState<BuilderRow[]>(props.existing?.rows ?? []);
  const [marks, setMarks] = useState<Record<string, number>>(props.existing?.marks ?? {});
  const startMode = props.existing?.mode ?? props.initialMode;
  const [count, setCount] = useState<string>(String(props.existing ? props.existing.rows.length : startMode === "MINISTRY" ? props.ministry.questions : props.simulation.questions));
  const [minutes, setMinutes] = useState<string>(String(props.existing?.timeLimitMin ?? (startMode === "MINISTRY" ? props.ministry.minutes : props.simulation.minutes)));
  const [classId, setClassId] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<SimulationSettings>(props.simulation);
  const [min, setMin] = useState<MinistrySettings>(props.ministry);
  const [codes, setCodes] = useState<string[]>([]);
  const [perSkill, setPerSkill] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [ai, setAi] = useState({ count: 5, topic: "", withPassage: true, kind: "" as "" | "LIT" | "INFO" });
  const [aiDone, setAiDone] = useState<number | null>(null);
  const [search, setSearch] = useState({ q: "", code: "", page: 1, dif: "" });
  // the test's difficulty: any · Easy · Medium · Hard · a mix with percentages
  const [dmode, setDmode] = useState<"ANY" | "1" | "2" | "3" | "MIX">("ANY");
  const [mix, setMix] = useState<{ 1: number; 2: number; 3: number }>({ 1: 30, 2: 40, 3: 30 });
  const difficulty = dmode === "ANY" ? null : dmode === "MIX" ? mix : Number(dmode);
  const [found, setFound] = useState<{ rows: BankRow[]; page: number; pages: number; total: number } | null>(null);
  const ids = rows.map((r) => r.id);
  const totalMarks = Math.round(rows.reduce((a, r) => a + (marks[r.id] ?? 1), 0) * 100) / 100;
  const locked = Boolean(props.existing?.locked);
  const short = new Map(props.standards.map((x) => [x.code, x.short]));
  const perSkillSum = codes.reduce((a, c) => a + (counts[c] ?? 1), 0);
  const n = mode === "AUTO" && perSkill ? perSkillSum : Math.round(Number(count));
  const nOk = Number.isFinite(n) && n >= 1 && n <= props.maxQuestions;
  const m = Math.round(Number(minutes));
  const mOk = minutes.trim() !== "" && Number.isFinite(m) && m >= 1 && m <= props.maxMinutes;

  const run = (fn: () => Promise<void>) => start(async () => { setError(null); try { await fn(); } catch { setError(t("Something went wrong. Try again.")); } });
  const renumber = (l: BuilderRow[]) => l.map((r, i) => ({ ...r, n: i + 1 }));
  const needBasics = () => {
    if (!nOk) { setError(t("Set the number of questions (1 to {n}).", { n: props.maxQuestions })); return false; }
    if (!mOk) { setError(t("Set the time of the test (1 to {n} minutes).", { n: props.maxMinutes })); return false; }
    return true;
  };
  const build = () => run(async () => {
    if (!needBasics()) return;
    if (mode === "SIMULATION") {
      const r = await simulationAction({ settings: { ...sim, questions: n, minutes: m }, classId: classId || null, seed: String(Date.now()), difficulty });
      if (r.error) return setError(r.error);
      setRows(r.ok!.rows); setNotes(r.ok!.notes); setMarks({});
      if (!title) setTitle(t("NAFS simulation"));
    } else if (mode === "MINISTRY") {
      const r = await ministryAction({ settings: { ...min, questions: n, minutes: m }, classId: classId || null, seed: String(Date.now()), difficulty });
      if (r.error) return setError(r.error);
      setRows(r.ok!.rows); setNotes(r.ok!.notes); setMarks({});
      if (min.booklet && r.ok!.rows.length) setCount(String(r.ok!.rows.length));
      if (!title) setTitle(t("Ministry booklet model"));
    } else {
      const r = await automaticAction({ codes, total: perSkill ? null : n, perSkill: perSkill ? Object.fromEntries(codes.map((c) => [c, counts[c] ?? 1])) : null, classId: classId || null, seed: String(Date.now()), difficulty });
      if (r.error) return setError(r.error);
      setRows(r.ok!.rows); setNotes(r.ok!.notes); setMarks({});
      if (!title) setTitle(t("NAFS practice"));
    }
  });
  const replace = (id: string) => run(async () => {
    const r = await replaceAction({ questionId: id, current: ids, classId: classId || null });
    if (r.error) return setError(r.error);
    setRows(renumber(rows.map((x) => (x.id === id ? r.ok! : x))));
  });
  const move = (i: number, d: -1 | 1) => { const l = [...rows]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setRows(renumber(l)); };
  const remove = (id: string) => setRows(renumber(rows.filter((x) => x.id !== id)));
  const find = (page = 1) => run(async () => {
    const r = await bankSearchAction({ q: search.q, code: search.code && !search.code.startsWith("MOE.") ? search.code : null, standard: search.code.startsWith("MOE.") ? search.code : null, difficulty: search.dif ? Number(search.dif) : null, page });
    if (r.error) return setError(r.error);
    setFound(r.ok!); setSearch({ ...search, page });
  });
  const add = (id: string) => run(async () => {
    if (ids.includes(id)) return;
    const r = await rowsAction([id]);
    if (r.error) return setError(r.error);
    setRows(renumber([...rows, ...(r.ok ?? [])]));
  });
  const generate = () => run(async () => {
    const r = await aiDraftsAction({ codes, count: ai.count, topic: ai.topic, withPassage: ai.withPassage, textType: ai.kind || null });
    if (r.error) return setError(r.error);
    if (r.ok!.error) return setError(r.ok!.error);
    setAiDone(r.ok!.ids.length);
  });
  const save = () => run(async () => {
    if (!needBasics()) return;
    if (rows.length !== n) return setError(t("The test has {have} question(s) but you chose {n}. Add or remove questions, or change the number of questions.", { have: rows.length, n }));
    const base = mode === "SIMULATION" ? { ...sim, questions: n, minutes: m } : mode === "MINISTRY" ? { ...min, questions: n, minutes: m } : mode === "AUTO" ? { codes, total: perSkill ? null : n, perSkill: perSkill ? counts : null } : { questions: n };
    const settings = { ...base, difficulty };
    const r = await saveTestAction({ id: locked ? null : props.existing?.id ?? null, title, mode: mode === "AI" ? "MANUAL" : mode, questionIds: ids, marks: Object.fromEntries(ids.filter((id) => marks[id] !== undefined).map((id) => [id, marks[id]])), timeLimitMin: m, settings });
    if (r.error) return setError(r.error);
    router.push(`/teacher/nafs/tests/${r.ok}`);
  });
  const toggle = (c: string) => setCodes(codes.includes(c) ? codes.filter((x) => x !== c) : [...codes, c]);
  const pickMode = (k: Mode) => {
    setMode(k); setError(null);
    if (!rows.length && k === "MINISTRY") { setCount(String(props.ministry.questions)); setMinutes(String(props.ministry.minutes)); }
    if (!rows.length && k === "SIMULATION") { setCount(String(props.simulation.questions)); setMinutes(String(props.simulation.minutes)); }
  };
  const skillPicker = (only: (k: Skill) => boolean, withStandards = false) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {withStandards && (
        <fieldset className="rounded-xl bg-surface-2 p-3 ring-1 ring-line sm:col-span-2">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("The 13 Ministry standards")}</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {props.standards.map((x) => (
              <div key={x.code} className="flex items-center justify-between gap-2 py-1">
                <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" className="mt-1 h-4 w-4" checked={codes.includes(x.code)} onChange={() => toggle(x.code)} /><span><b className="me-1 font-mono" dir="ltr">{x.short}</b>{x.text ? t(x.text) : ""}</span></label>
                {mode === "AUTO" && perSkill && codes.includes(x.code) && <input type="number" min={0} max={props.maxQuestions} value={counts[x.code] ?? 1} onChange={(e) => setCounts({ ...counts, [x.code]: Number(e.target.value) })} className={NUM} aria-label={t("Questions for {skill}", { skill: x.short })} />}
              </div>
            ))}
          </div>
        </fieldset>
      )}
      {props.domains.map((d) => {
        const list = props.skills.filter((k) => k.domain === d.code && only(k));
        if (!list.length) return null;
        return (
          <fieldset key={d.code} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t(d.name)}</legend>
            {list.map((k) => (
              <div key={k.code} className="flex items-center justify-between gap-2 py-1">
                <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-4 w-4" checked={codes.includes(k.code)} onChange={() => toggle(k.code)} />{t(k.name)}</label>
                {mode === "AUTO" && perSkill && codes.includes(k.code) && <input type="number" min={0} max={props.maxQuestions} value={counts[k.code] ?? 1} onChange={(e) => setCounts({ ...counts, [k.code]: Number(e.target.value) })} className={NUM} aria-label={t("Questions for {skill}", { skill: t(k.name) })} />}
              </div>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
  const MODES: { k: Mode; label: string }[] = [{ k: "SIMULATION", label: "NAFS simulation" }, { k: "MINISTRY", label: "Ministry booklet model" }, { k: "AUTO", label: "Automatic" }, { k: "MANUAL", label: "Manual" }, { k: "AI", label: "Generate new questions with AI" }];
  const num = (key: keyof SimulationSettings, label: string, max: number) => (
    <label className="grid gap-1 text-xs font-semibold text-ink-2">{t(label)}<input type="number" min={0} max={max} value={sim[key] as number} onChange={(e) => setSim({ ...sim, [key]: Number(e.target.value) })} className={NUM} /></label>
  );
  const bk = props.booklets.find((b) => b.code === min.booklet);

  return (
    <div className="grid gap-4">
      {locked && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("This test already has results: saving makes a new copy.")}</p>}
      <nav className="flex flex-wrap gap-1.5" aria-label={t("How to make the test")}>
        {MODES.map((x) => <button key={x.k} type="button" onClick={() => pickMode(x.k)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ${mode === x.k ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>{t(x.label)}</button>)}
      </nav>

      {mode !== "AI" && (
        <section className="flex flex-wrap items-end gap-4 rounded-2xl bg-surface p-5 shadow-card ring-2 ring-teal-200" aria-label={t("Test settings")}>
          <label className="grid gap-1 text-sm font-semibold text-ink">{t("Number of questions")} <span className="text-xs font-normal text-muted">{t("required")}</span>
            {mode === "AUTO" && perSkill ? <output className={`${NUM} inline-flex min-h-11 items-center`}>{perSkillSum}</output>
              : <input type="number" required min={1} max={props.maxQuestions} value={count} onChange={(e) => setCount(e.target.value)} className={`${NUM} min-h-11 text-lg ${nOk ? "" : "ring-2 ring-rose-400"}`} />}
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">{t("Time (minutes)")} <span className="text-xs font-normal text-muted">{t("required")}</span>
            <input type="number" required min={1} max={props.maxMinutes} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${NUM} min-h-11 text-lg ${mOk ? "" : "ring-2 ring-rose-400"}`} />
          </label>
          <fieldset className="grid gap-1">
            <legend className="text-sm font-semibold text-ink">{t("Difficulty")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {([["ANY", "Any"], ["1", "Easy"], ["2", "Medium"], ["3", "Hard"], ["MIX", "Mixed"]] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={dmode === k} onClick={() => setDmode(k)} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 ${dmode === k ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>{t(label)}</button>
              ))}
            </div>
            {dmode === "MIX" && (
              <div className="mt-1 flex flex-wrap items-end gap-2">
                {([1, 2, 3] as const).map((k) => <label key={k} className="grid gap-1 text-xs font-semibold text-ink-2">{t(k === 1 ? "Easy" : k === 2 ? "Medium" : "Hard")} %<input type="number" min={0} max={100} value={mix[k]} onChange={(e) => setMix({ ...mix, [k]: Number(e.target.value) })} className={NUM} /></label>)}
                <span className={`pb-2 text-xs ${mix[1] + mix[2] + mix[3] === 100 ? "text-muted" : "text-amber-700"}`}>{t("Total")}: {mix[1] + mix[2] + mix[3]}%</span>
              </div>
            )}
          </fieldset>
          <p className="max-w-md text-sm text-ink-2">{t("Each online assignment can change the time and the open / due dates later.")}</p>
          {rows.length > 0 && nOk && rows.length !== n && <p role="status" className="w-full rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t("The test has {have} question(s) but you chose {n}. Add or remove questions, or change the number of questions.", { have: rows.length, n })} <button type="button" onClick={() => setCount(String(rows.length))} className="ms-1 font-semibold underline">{t("Use {n}", { n: rows.length })}</button></p>}
        </section>
      )}

      {(mode === "SIMULATION" || mode === "AUTO" || mode === "MINISTRY") && (
        <section className="grid gap-3 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
          {mode === "SIMULATION" ? (
            <>
              <p className="text-sm text-ink-2">{t("Like the real booklet: passages (at least one literary and one informational), each with its questions, the PIRLS mix and vocabulary items. Change any number.")}</p>
              <div className="flex flex-wrap gap-3">
                {num("passages", "Passages", 8)}{num("perPassageMin", "Per passage (min)", 20)}{num("perPassageMax", "Per passage (max)", 20)}{num("vocabularyPct", "Vocabulary %", 100)}
              </div>
              <div className="flex flex-wrap gap-3">
                {(["P1", "P2", "P3", "P4"] as const).map((p) => <label key={p} className="grid gap-1 text-xs font-semibold text-ink-2">{p} %<input type="number" min={0} max={100} value={sim.process[p]} onChange={(e) => setSim({ ...sim, process: { ...sim.process, [p]: Number(e.target.value) } })} className={NUM} /></label>)}
              </div>
            </>
          ) : mode === "MINISTRY" ? (
            <>
              <p className="text-sm text-ink-2">{t("Like the Ministry guide: questions grouped and ordered by the 13 standards (3 per standard, 1 for S11 and S12 — 35 in all), scaled to your number of questions. Or a whole model booklet as it is.")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Questions from")}
                  <select value={min.booklet ?? ""} onChange={(e) => { const code = e.target.value || null; setMin({ ...min, booklet: code }); const b = props.booklets.find((x) => x.code === code); if (b) setCount(String(min.written ? b.questions : b.questions - b.written)); }} className={`${INPUT} max-w-sm`}>
                    <option value="">{t("All NAFS questions, by the 13 standards")}</option>
                    {props.booklets.map((b) => <option key={b.code} value={b.code}>{t("Model booklet")} {b.code} · {b.title} ({t("{n} questions", { n: b.questions })})</option>)}
                  </select>
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={min.written} onChange={(e) => setMin({ ...min, written: e.target.checked })} className="h-4 w-4" /> {t("Include short written answers (you mark them)")}</label>
              </div>
              {!props.booklets.length && <p className="text-xs text-muted">{t("No model booklets in the bank yet: they load in the background, or an admin loads them from Load new questions.")}</p>}
              {bk && <p className="text-xs text-muted">{t("The whole booklet as it is when the number of questions covers it; fewer questions are picked by the standards.")}</p>}
            </>
          ) : (
            <>
              <p className="text-sm text-ink-2">{t("Choose Ministry standards, NAFS skills (or PIRLS processes), the difficulty and the number of questions. The platform balances them and keeps passage questions with their passage.")}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={!perSkill} onChange={() => setPerSkill(false)} /> {t("Total")}</label>
                <label className="flex items-center gap-2"><input type="radio" checked={perSkill} onChange={() => setPerSkill(true)} /> {t("Per skill")}</label>
              </div>
              {skillPicker(() => true, true)}
            </>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Prefer questions this class has not seen")}<select value={classId} onChange={(e) => setClassId(e.target.value)} className={INPUT}><option value="">—</option>{props.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button type="button" disabled={busy || (mode === "AUTO" && !codes.length)} onClick={build} className={`${BTN} min-h-11 bg-brand-navy px-5 text-white disabled:opacity-50`}>{busy ? t("Building…") : t(rows.length ? "Build again" : "Build the test")}</button>
          </div>
        </section>
      )}

      {mode === "AI" && (
        <section className="grid gap-3 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
          <p className="text-sm text-ink-2">{t("New, original questions written by AI from the NAFS blueprint and the 13 Ministry standards (MCQ A–D, Grade 6). They arrive as drafts: review, edit and approve them in the Question bank before use. Only curriculum data is sent — never student data.")}</p>
          {skillPicker((k) => k.domain !== "PIRLS")}
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Questions")}<input type="number" min={1} max={8} value={ai.count} onChange={(e) => setAi({ ...ai, count: Number(e.target.value) })} className={NUM} /></label>
            <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={ai.withPassage} onChange={(e) => setAi({ ...ai, withPassage: e.target.checked })} /> {t("With a new passage")}</label>
            {ai.withPassage && <select value={ai.kind} onChange={(e) => setAi({ ...ai, kind: e.target.value as "" | "LIT" | "INFO" })} className={INPUT} aria-label={t("Kind of text")}><option value="">{t("Any kind")}</option><option value="LIT">{t("Literary")}</option><option value="INFO">{t("Informational")}</option></select>}
            <label className="grid flex-1 gap-1 text-xs font-semibold text-ink-2">{t("Passage topic (optional)")}<input value={ai.topic} maxLength={120} onChange={(e) => setAi({ ...ai, topic: e.target.value })} className={INPUT} /></label>
            <button type="button" disabled={busy || !codes.length} onClick={generate} className={`${BTN} min-h-11 bg-brand-navy px-5 text-white disabled:opacity-50`}>{busy ? t("Writing…") : t("Generate drafts")}</button>
          </div>
          {aiDone !== null && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">{t("{n} draft(s) ready for review.", { n: aiDone })} <Link href="/teacher/nafs?tab=bank&src=DRAFT" className="font-semibold underline">{t("Review the drafts")}</Link></p>}
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-rose-900 ring-1 ring-rose-200">{error}</p>}
      {notes.length > 0 && <ul className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{notes.map((x) => <li key={x}>{x}</li>)}</ul>}

      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">{t("The questions")} <span className="text-sm font-normal text-muted">{t("{n} questions", { n: rows.length })} · {t("{n} marks", { n: totalMarks })}</span></h2>
        </div>
        {!rows.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t(mode === "MANUAL" ? "Add questions from the NAFS bank below." : "Build the test, or add questions from the NAFS bank below.")}</p> : (
          <ol className="mt-3 grid gap-2">
            {rows.map((r, i) => (
              <li key={r.id} className={`rounded-xl p-3 ring-1 ring-line ${r.passageId && rows[i - 1]?.passageId === r.passageId ? "ms-4 bg-surface-2" : "bg-surface-2"}`}>
                {r.passageId && rows[i - 1]?.passageId !== r.passageId && <p className="mb-1 text-xs font-semibold text-teal-ink">📄 {r.passageTitle}</p>}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm text-ink" lang="en" dir="ltr"><b>{r.n}.</b> {r.stem}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} className={`${BTN} ring-1 ring-line`} aria-label={t("Move up")}>↑</button>
                    <button type="button" onClick={() => move(i, 1)} className={`${BTN} ring-1 ring-line`} aria-label={t("Move down")}>↓</button>
                    <button type="button" onClick={() => replace(r.id)} disabled={busy} className={`${BTN} text-teal-ink ring-1 ring-line`}>{t("Replace")}</button>
                    <button type="button" onClick={() => remove(r.id)} className={`${BTN} text-rose-700 ring-1 ring-rose-200`}>{t("Remove")}</button>
                    <input type="number" min={0} max={100} step={0.5} value={marks[r.id] ?? 1} onChange={(e) => setMarks({ ...marks, [r.id]: Number(e.target.value) })} className={`${INPUT} w-16`} aria-label={t("Marks")} title={t("Marks")} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted">{r.standard ? <b className="me-1 text-ink-2" dir="ltr">{short.get(r.standard)}</b> : null}{t(DIFF_NAME[r.difficulty])} · {t(r.skill)} · {r.process} · {r.kind === "WRITTEN" ? `✍ ${t("Short written answer")}` : `${t("Answer")}: ${"ABCD"[r.correct]}`}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <h2 className="text-lg font-semibold text-ink">{t("Add from the NAFS bank")}</h2>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input value={search.q} onChange={(e) => setSearch({ ...search, q: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(1); } }} placeholder={t("Words in the question")} className={`${INPUT} min-w-48 flex-1`} />
          <select value={search.code} onChange={(e) => setSearch({ ...search, code: e.target.value })} className={INPUT} aria-label={t("Skill")}><option value="">{t("All skills")}</option>{props.standards.map((x) => <option key={x.code} value={x.code}>{x.short}</option>)}{props.skills.map((k) => <option key={k.code} value={k.code}>{t(k.name)}</option>)}</select>
          <select value={search.dif} onChange={(e) => setSearch({ ...search, dif: e.target.value })} className={INPUT} aria-label={t("Difficulty")}><option value="">{t("Any")}</option><option value="1">{t("Easy")}</option><option value="2">{t("Medium")}</option><option value="3">{t("Hard")}</option></select>
          <button type="button" onClick={() => find(1)} disabled={busy} className={`${BTN} bg-surface ring-1 ring-line`}>{t("Search")}</button>
        </div>
        {found && (
          <>
            <ul className="mt-3 divide-y divide-line">
              {found.rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <p className="min-w-0 flex-1 text-sm text-ink" lang="en" dir="ltr">{r.stem} <span className="text-xs text-muted">· {r.standard ? `${short.get(r.standard)} · ` : ""}{t(DIFF_NAME[r.difficulty])} · {t(r.skill)} · {r.process}{r.kind === "WRITTEN" ? " · ✍" : ""}{r.hasPassage ? " · 📄" : ""}</span></p>
                  <button type="button" disabled={ids.includes(r.id) || busy} onClick={() => add(r.id)} className={`${BTN} bg-teal-700 text-white disabled:opacity-40`}>{t(ids.includes(r.id) ? "Added" : "Add")}</button>
                </li>
              ))}
            </ul>
            {found.pages > 1 && <div className="mt-2 flex justify-between text-sm">{found.page > 1 ? <button type="button" onClick={() => find(found.page - 1)} className="font-semibold text-teal-ink">‹ {t("Previous")}</button> : <span />}<span className="text-muted">{t("Page {n} of {total}", { n: found.page, total: found.pages })}</span>{found.page < found.pages ? <button type="button" onClick={() => find(found.page + 1)} className="font-semibold text-teal-ink">{t("Next")} ›</button> : <span />}</div>}
          </>
        )}
      </section>

      {mode !== "AI" && (
        <section className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
          <label className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2">{t("Test name")}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={`${INPUT} min-h-11`} /></label>
          <p className="text-sm text-ink-2">{t("{n} questions", { n: rows.length })} · {mOk ? t("{n} minutes", { n: m }) : t("Set the time")}</p>
          <button type="button" disabled={busy || !rows.length || !title.trim()} onClick={save} className="min-h-11 rounded-xl bg-brand-navy px-6 font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : t("Save the test")}</button>
        </section>
      )}
    </div>
  );
}
