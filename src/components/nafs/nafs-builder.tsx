"use client";
import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { BuilderRow, MinistrySettings, SetChoice } from "@/server/nafs/build";
import type { BankRow } from "@/server/nafs/bank";
import { codeName, DIFFICULTY_NAME, type DifficultyChoice, type DifficultyMix, type SimulationSettings } from "@/server/nafs/framework";
import { AREAS_WITH_STANDARDS, BALANCED_MIX, FULL_DEFAULT, FULL_MIN_QUESTIONS, fullCoverage, fullDistribution, fullMinutes } from "@/server/nafs/coverage";
import { aiDraftsAction, approveDraftsAction, automaticAction, bankSearchAction, builderPracticeAction, fullBuildAction, fullMoreAction, ministryAction, replaceAction, rowsAction, saveFullTestAction, saveTestAction, simulationAction } from "@/app/teacher/nafs/actions";
import { Combo, type ComboOption } from "@/components/ui/combo";
import { DifficultyPicker, difficultyValue } from "./difficulty-picker";
import { TargetChecklist } from "./target-checklist";
import { nafsGroups, STARTS, startOfMode, type BuilderStart } from "./builder-starts";
import { RichInline } from "@/components/rich-inline";

export type { BuilderStart } from "./builder-starts";

type Purpose = "TEST" | "PRACTICE";
/** "Choose standards / skills myself": balanced over the choice, or shaped like the real booklet (passages, PIRLS mix). */
type Shape = "BALANCED" | "BOOKLET";
interface Std { code: string; short: string; text: string; area: string }
interface Klass { id: string; name: string; students: { id: string; name: string }[] }
export interface BuilderExisting { id: string | null; title: string; mode: string; rows: BuilderRow[]; marks: Record<string, number> | null; timeLimitMin: number | null; locked: boolean; settings: Record<string, unknown> | null }

const INPUT = "min-h-10 rounded-lg bg-surface px-2 text-ink ring-1 ring-line";
const NUM = `${INPUT} w-20 tabular-nums`;
const BTN = "min-h-10 rounded-lg px-3 text-sm font-semibold";
const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line";
const STEP = "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-navy text-sm font-bold text-white";

const modeOf = (start: BuilderStart, shape: Shape, codes: string[]) => start === "ALL" ? "FULL" : start === "BOOKLET" ? "MINISTRY" : shape === "BOOKLET" ? "SIMULATION" : codes.length ? "AUTO" : "MANUAL";

/**
 * 🇸🇦 The NAFS test builder — ONE clear way (owner request): Step 1 "Start from" a model booklet (pick one or a random
 * one) · all 13 standards (the complete test) · standards / skills I choose. Step 2, the same for every start: the
 * number of questions, the time, the difficulty (Easy · Medium · Hard · Mixed % · Any · Adaptive) and Test or Practice.
 * Step 3: the question list with full edit — replace, remove, reorder, marks, add from the bank, and "✨ write new with
 * AI" as one more way to add (drafts are shown, approved and added here). Old links (?mode=…) open the matching start.
 */
export function NafsBuilder(props: {
  start: BuilderStart; initialPurpose?: Purpose; initialCodes?: string[]; initialClassId?: string | null; initialShape?: Shape; initialAdd?: "BANK" | "AI" | null;
  standards: Std[]; areas: { code: string; name: string }[]; skills: { code: string; name: string; domain: string }[]; domains: { code: string; name: string }[];
  classes: Klass[]; booklets: SetChoice[]; sets: SetChoice[];
  maxQuestions: number; maxMinutes: number; simulation: SimulationSettings; ministry: MinistrySettings;
  existing: BuilderExisting | null;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, run0] = useTransition();
  const ex = props.existing;
  const es = (ex?.settings ?? {}) as Record<string, unknown>;
  const exStart = ex ? startOfMode(ex.mode, es) : null;
  const [start, setStart] = useState<BuilderStart>(exStart ?? props.start);
  const [purpose, setPurpose] = useState<Purpose>(ex ? "TEST" : props.initialPurpose ?? "TEST");
  const [rows, setRows] = useState<BuilderRow[]>(ex?.rows ?? []);
  const [marks, setMarks] = useState<Record<string, number>>(ex?.marks ?? {});
  const defaults = (s: BuilderStart) => s === "ALL" ? { n: FULL_DEFAULT.questions, m: FULL_DEFAULT.minutes } : s === "BOOKLET" ? { n: props.ministry.questions, m: props.ministry.minutes } : { n: props.simulation.questions, m: props.simulation.minutes };
  const d0 = defaults(exStart ?? props.start);
  const exCounts = es.counts && typeof es.counts === "object" ? (es.counts as Record<string, number>) : null;
  const [counts, setCounts] = useState<Record<string, number>>(exCounts ?? fullDistribution(ex?.rows.length && exStart === "ALL" ? ex.rows.length : FULL_DEFAULT.questions));
  const [count, setCount] = useState(String(ex ? ex.rows.length : d0.n));
  const [minutes, setMinutes] = useState(String(ex?.timeLimitMin ?? d0.m));
  const [minutesSet, setMinutesSet] = useState(Boolean(ex));
  const [written, setWritten] = useState(typeof es.written === "boolean" ? es.written : true);
  const [booklet, setBooklet] = useState<string>(typeof es.booklet === "string" ? es.booklet : "");
  const [codes, setCodes] = useState<string[]>(ex ? (Array.isArray(es.codes) ? (es.codes as string[]) : Array.isArray(es.targets) ? (es.targets as string[]) : []) : props.initialCodes ?? []);
  const [shape, setShape] = useState<Shape>(ex?.mode === "SIMULATION" ? "BOOKLET" : props.initialShape ?? "BALANCED");
  const [perSkill, setPerSkill] = useState(false);
  const [skillCounts, setSkillCounts] = useState<Record<string, number>>({});
  const [sim, setSim] = useState<SimulationSettings>(props.simulation);
  const exDif = es.adaptive === true || es.difficulty === "ADAPTIVE" ? "ADAPTIVE" : es.difficulty && typeof es.difficulty === "object" ? "MIX" : typeof es.difficulty === "number" ? String(es.difficulty) as DifficultyChoice : null;
  const [dchoice, setDchoice] = useState<DifficultyChoice>(exDif ?? ((exStart ?? props.start) === "ALL" ? "MIX" : "ANY"));
  const [mix, setMix] = useState<DifficultyMix>(es.difficulty && typeof es.difficulty === "object" ? (es.difficulty as DifficultyMix) : { ...BALANCED_MIX });
  const [classId, setClassId] = useState(props.initialClassId && props.classes.some((c) => c.id === props.initialClassId) ? props.initialClassId : "");
  const [available, setAvailable] = useState<Record<string, number> | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"STANDARD" | "ORDER">("ORDER");
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(ex?.title ?? "");
  // practice: who, how many, when
  const [sids, setSids] = useState<string[]>([]);
  const [wholeBank, setWholeBank] = useState(false);
  const [perStudent, setPerStudent] = useState("");
  const [due, setDue] = useState("");
  // add sources (step 3)
  const [add, setAdd] = useState<"BANK" | "AI" | null>(props.initialAdd ?? null);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [search, setSearch] = useState({ q: "", code: "", dif: "", set: "" });
  const [found, setFound] = useState<{ rows: BankRow[]; page: number; pages: number; total: number } | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [ai, setAi] = useState({ code: "", count: 5, topic: "", withPassage: true, kind: "" as "" | "LIT" | "INFO" });
  const [drafts, setDrafts] = useState<BuilderRow[]>([]);

  const isTest = purpose === "TEST";
  const full = start === "ALL";
  const locked = Boolean(ex?.locked);
  const ids = rows.map((r) => r.id);
  const std = useMemo(() => new Map(props.standards.map((x) => [x.code, x])), [props.standards]);
  const groups = useMemo(() => nafsGroups({ areas: props.areas, standards: props.standards, domains: props.domains.filter((d) => d.code !== "PIRLS"), skills: props.skills }, t), [props.areas, props.standards, props.domains, props.skills, t]);
  const cov = useMemo(() => fullCoverage(rows.map((r) => ({ id: r.id, standard: r.standard, difficulty: r.difficulty, process: r.process, kind: r.kind, passageId: r.passageId, textType: r.textType ?? null })), counts, available), [rows, counts, available]);
  const planned = Object.values(counts).reduce((a, b) => a + b, 0);
  const perSkillSum = codes.reduce((a, c) => a + (skillCounts[c] ?? 1), 0);
  const n = full ? planned : start === "CHOOSE" && shape === "BALANCED" && perSkill ? perSkillSum : Math.round(Number(count));
  const nMin = full ? FULL_MIN_QUESTIONS : 1;
  const nOk = Number.isFinite(n) && n >= nMin && n <= props.maxQuestions;
  const m = Math.round(Number(minutes));
  const mOk = minutes.trim() !== "" && Number.isFinite(m) && m >= 1 && m <= props.maxMinutes;
  const needsConfirm = full && rows.length > 0 && cov.uncovered.length > 0;
  const totalMarks = Math.round(rows.reduce((a, r) => a + (marks[r.id] ?? 1), 0) * 100) / 100;
  const dv = difficultyValue(dchoice, mix);
  const klass = props.classes.find((c) => c.id === classId);

  const run = (fn: () => Promise<void>) => run0(async () => { setError(null); try { await fn(); } catch { setError(t("Something went wrong. Try again.")); } });
  const renumber = (l: BuilderRow[]) => l.map((r, i) => ({ ...r, n: i + 1 }));
  const pickStart = (s: BuilderStart) => {
    setStart(s); setError(null); setNotes([]);
    if (!rows.length) { const d = defaults(s); setCount(String(d.n)); if (!minutesSet) setMinutes(String(d.m)); if (s === "ALL") { setCounts(fullDistribution(d.n)); if (dchoice === "ANY") setDchoice("MIX"); } }
  };
  const changeCount = (v: string) => {
    setCount(v);
    const k = Math.round(Number(v));
    if (full && Number.isFinite(k) && k >= FULL_MIN_QUESTIONS && k <= props.maxQuestions) { setCounts(fullDistribution(k)); if (!minutesSet) setMinutes(String(fullMinutes(k))); }
  };
  const chooseBooklet = (code: string) => {
    setBooklet(code);
    const b = props.booklets.find((x) => x.code === code);
    if (b) setCount(String(written && isTest ? b.questions : b.questions - b.written));
  };

  // ---------------------------------------------------------------- step 2 → build
  const build = () => run(async () => {
    if (!nOk) return setError(full ? t("Set the number of questions ({min} to {n}): every standard needs at least one.", { min: FULL_MIN_QUESTIONS, n: props.maxQuestions }) : t("Set the number of questions (1 to {n}).", { n: props.maxQuestions }));
    if (isTest && !mOk) return setError(t("Set the time of the test (1 to {n} minutes).", { n: props.maxMinutes }));
    const seed = String(Date.now());
    const common = { classId: classId || null, seed, difficulty: dv };
    if (full) {
      const r = await fullBuildAction({ ...common, settings: { questions: planned, minutes: m, written: isTest && written, counts }, practice: !isTest });
      if (r.error) return setError(r.error);
      setRows(r.ok!.rows); setNotes(r.ok!.notes); setAvailable(r.ok!.available); setCounts(r.ok!.counts); setCount(String(Object.values(r.ok!.counts).reduce((a, b) => a + b, 0))); setMarks({}); setConfirm(false); setView("STANDARD");
      if (!title) setTitle(t("Complete NAFS test (all standards)"));
      return;
    }
    if (start === "BOOKLET") {
      let code = booklet;
      if (code === "RANDOM" || !code) {
        if (!props.booklets.length) return setError(t("No model booklets in the bank yet: they load in the background, or an admin loads them from Load new questions."));
        if (!code) return setError(t("Choose a model booklet (or a random one)."));
        code = props.booklets[crypto.getRandomValues(new Uint32Array(1))[0] % props.booklets.length].code;
        setBooklet(code);
      }
      const r = await ministryAction({ ...common, settings: { ...props.ministry, booklet: code, written: isTest && written, questions: n, minutes: mOk ? m : props.ministry.minutes } });
      if (r.error) return setError(r.error);
      setRows(r.ok!.rows); setNotes(r.ok!.notes); setMarks({});
      const b = props.booklets.find((x) => x.code === code);
      if (!title) setTitle(b ? `${t("Model booklet")} ${b.code} · ${b.title}` : t("Model booklet"));
      return;
    }
    if (shape === "BOOKLET") {
      const r = await simulationAction({ ...common, settings: { ...sim, questions: n, minutes: mOk ? m : sim.minutes }, codes });
      if (r.error) return setError(r.error);
      setRows(r.ok!.rows); setNotes(r.ok!.notes); setMarks({});
      if (!title) setTitle(t("NAFS simulation"));
      return;
    }
    if (!codes.length) return setError(t("Tick standards or skills, or add questions from the bank below."));
    const r = await automaticAction({ ...common, codes, total: perSkill ? null : n, perSkill: perSkill ? Object.fromEntries(codes.map((c) => [c, skillCounts[c] ?? 1])) : null });
    if (r.error) return setError(r.error);
    setRows(r.ok!.rows); setNotes(r.ok!.notes); setMarks({});
    if (!title) setTitle(t("NAFS test"));
  });

  // ---------------------------------------------------------------- step 3 → edit
  const insertForStandard = (list: BuilderRow[], more: BuilderRow[], code: string | null) => {
    if (!code) return [...list, ...more];
    const last = list.map((r) => r.standard).lastIndexOf(code);
    return last < 0 ? [...list, ...more] : [...list.slice(0, last + 1), ...more, ...list.slice(last + 1)];
  };
  const replace = (id: string) => run(async () => {
    const r = await replaceAction({ questionId: id, current: ids, classId: classId || null, sameStandard: full });
    if (r.error) return setError(r.error);
    setRows(renumber(rows.map((x) => (x.id === id ? r.ok! : x))));
  });
  const move = (i: number, d: -1 | 1) => { const l = [...rows]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setRows(renumber(l)); };
  const remove = (id: string) => setRows(renumber(rows.filter((x) => x.id !== id)));
  /** A standard's count (complete test): lower → its last questions leave; higher → more questions of it. */
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
      if ((r.ok ?? []).length < want - mine.length) setError(t("{s}: the bank has no more questions for this standard.", { s: codeName(code, t) }));
      setRows(renumber(insertForStandard(rows, r.ok ?? [], code)));
    });
  };
  const find = (page = 1, code: string | null = addFor) => run(async () => {
    const c = code ?? search.code;
    const r = await bankSearchAction({ q: search.q, code: c && !c.startsWith("MOE.") ? c : null, standard: c && c.startsWith("MOE.") ? c : null, difficulty: search.dif ? Number(search.dif) : null, set: search.set || null, page });
    if (r.error) return setError(r.error);
    setFound(r.ok!);
  });
  const addRow = (id: string) => run(async () => {
    if (ids.includes(id)) return;
    const r = await rowsAction([id]);
    if (r.error) return setError(r.error);
    const got = r.ok ?? [];
    const code = full ? addFor ?? got[0]?.standard ?? null : null;
    setRows(renumber(insertForStandard(rows, got, code)));
    if (full && code) { const now = rows.filter((x) => x.standard === code).length + got.length; if (now > (counts[code] ?? 1)) { setCounts({ ...counts, [code]: now }); setCount(String(planned - (counts[code] ?? 1) + now)); } }
  });
  const writeAi = () => run(async () => {
    const code = ai.code || (start === "CHOOSE" ? codes[0] ?? "" : "");
    if (!code) return setError(t("Choose the standard or skill the new questions are for."));
    const isStd = code.startsWith("MOE.");
    const r = await aiDraftsAction({ codes: isStd ? [] : [code], standard: isStd ? code : null, count: ai.count, topic: ai.topic, withPassage: ai.withPassage, textType: ai.kind || null });
    if (r.error) return setError(r.error);
    if (r.ok!.error) return setError(r.ok!.error);
    const got = await rowsAction(r.ok!.ids);
    if (got.error) return setError(got.error);
    setDrafts(got.ok ?? []);
  });
  const approve = (list: string[]) => run(async () => {
    const r = await approveDraftsAction(list);
    if (r.error) return setError(r.error);
    setRows(renumber([...rows, ...(r.ok ?? []).filter((x) => !ids.includes(x.id))]));
    setDrafts(drafts.filter((d) => !list.includes(d.id)));
  });

  // ---------------------------------------------------------------- save
  const save = () => run(async () => {
    if (!rows.length) return setError(t("Build the test first."));
    if (needsConfirm && !confirm) return setError(t("Not every standard is covered: tick the confirmation below to save anyway."));
    const adaptive = dchoice === "ADAPTIVE";
    if (isTest) {
      if (!mOk) return setError(t("Set the time of the test (1 to {n} minutes).", { n: props.maxMinutes }));
      const marksOut = Object.fromEntries(ids.filter((id) => marks[id] !== undefined).map((id) => [id, marks[id]]));
      const base = { start, difficulty: dv, adaptive, targets: start === "CHOOSE" ? codes : [] };
      if (full) {
        const r = await saveFullTestAction({ id: locked ? null : ex?.id ?? null, title, questionIds: ids, marks: marksOut, timeLimitMin: m, settings: { ...base, kind: "FULL", purpose, counts, written: written }, confirmUncovered: confirm });
        if (r.error) return setError(r.error);
        return router.push(`/teacher/nafs/tests/${r.ok}`);
      }
      if (rows.length !== n && !(start === "CHOOSE" && !codes.length && shape === "BALANCED")) return setError(t("The test has {have} question(s) but you chose {n}. Add or remove questions, or change the number of questions.", { have: rows.length, n }));
      const mode = ex && exStart === start ? ex.mode : modeOf(start, shape, codes);
      const settings = start === "BOOKLET" ? { ...base, booklet, written, questions: rows.length, minutes: m }
        : mode === "SIMULATION" ? { ...base, ...sim, questions: rows.length, minutes: m, codes }
        : mode === "AUTO" ? { ...base, codes, total: perSkill ? null : n, perSkill: perSkill ? skillCounts : null } : { ...base, questions: rows.length };
      const r = await saveTestAction({ id: locked ? null : ex?.id ?? null, title, mode, questionIds: ids, marks: marksOut, timeLimitMin: m, settings });
      if (r.error) return setError(r.error);
      return router.push(`/teacher/nafs/tests/${r.ok}`);
    }
    if (!classId) return setError(t("Choose the class."));
    const r = await builderPracticeAction({
      title, classId, targets: start === "CHOOSE" ? codes : null, studentIds: sids.length ? sids : null, questionIds: wholeBank ? null : ids, wholeBank, full,
      maxQuestions: perStudent ? Number(perStudent) : Math.min(60, rows.length), timeLimitMin: minutes.trim() && mOk ? m : null, dueAt: due || null,
      difficulty: wholeBank ? dv : null, confirmUncovered: confirm,
    });
    if (r.error) return setError(r.error);
    router.push(`/teacher/nafs?tab=adaptive&sub=report&open=${encodeURIComponent(r.ok!.id)}&msg=${encodeURIComponent(t("Given to {n} student(s). They find it in their NAFS icon.", { n: r.ok!.students }))}`);
  });

  // ---------------------------------------------------------------- pieces
  const classOptions: ComboOption[] = props.classes.map((c) => ({ value: c.id, label: c.name, hint: t("{n} students", { n: c.students.length }) }));
  const targetOptions: ComboOption[] = [
    ...props.standards.map((x) => ({ value: x.code, label: codeName(x.code, t), group: t("The 13 Ministry standards") })),
    ...props.skills.filter((k) => k.domain !== "PIRLS").map((k) => ({ value: k.code, label: codeName(k.code, t), group: t(props.domains.find((d) => d.code === k.domain)?.name ?? "") })),
  ];
  const setOptions: ComboOption[] = props.sets.map((b) => ({ value: b.code, label: `${b.code} · ${b.title}`, hint: t("{n} questions", { n: b.questions }), group: t(b.code.startsWith("NP-") ? "NAFS practice sets" : "NAFS model booklets"), keywords: `${b.genre} ${b.kind === "LIT" ? "literary story" : b.kind === "INFO" ? "informational article" : ""}` }));
  const bookletOptions: ComboOption[] = [
    { value: "RANDOM", label: `🎲 ${t("A random model booklet")}`, hint: t("{n} booklets", { n: props.booklets.length }) },
    ...props.booklets.map((b) => ({ value: b.code, label: `${b.code} · ${b.title}`, hint: `${t(b.kind === "LIT" ? "Literary" : b.kind === "INFO" ? "Informational" : "Kind not set")}${b.genre ? ` · ${b.genre}` : ""} · ${t("{n} questions", { n: b.questions })}`, group: t(b.kind === "LIT" ? "Literary" : b.kind === "INFO" ? "Informational" : "Kind not set"), keywords: b.genre })),
  ];
  const meta = (r: BuilderRow) => (
    <p className="mt-1 text-xs text-muted">
      {r.standard ? <b className="me-1 text-ink-2">{codeName(r.standard, t)}</b> : <b className="me-1 text-amber-700">{t("No Ministry standard")}</b>}
      · {t(DIFFICULTY_NAME[r.difficulty])} · {t(r.skill)} · {codeName(r.process, t)} · {r.passageTitle ? `📄 ${r.passageTitle}` : t("No text")} · {r.kind === "WRITTEN" ? `✍ ${t("Short written answer")}` : `${t("Answer")}: ${"ABCD"[r.correct]}`}
    </p>
  );
  const rowLine = (r: BuilderRow, i: number, withMove: boolean) => (
    <li key={r.id} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-ink" lang="en" dir="ltr"><b>{r.n}.</b> <RichInline text={r.stem} /></p>
        <div className="flex flex-wrap items-center gap-1">
          {withMove && <><button type="button" onClick={() => move(i, -1)} className={`${BTN} ring-1 ring-line`} aria-label={t("Move up")}>↑</button><button type="button" onClick={() => move(i, 1)} className={`${BTN} ring-1 ring-line`} aria-label={t("Move down")}>↓</button></>}
          <button type="button" onClick={() => replace(r.id)} disabled={busy || (full && !r.standard)} className={`${BTN} text-teal-ink ring-1 ring-line disabled:opacity-40`}>{t("Replace")}</button>
          <button type="button" onClick={() => remove(r.id)} className={`${BTN} text-rose-700 ring-1 ring-rose-200`}>{t("Remove")}</button>
          {isTest && <input type="number" min={0} max={100} step={0.5} value={marks[r.id] ?? 1} onChange={(e) => setMarks({ ...marks, [r.id]: Number(e.target.value) })} className={`${INPUT} w-16`} aria-label={t("Marks")} title={t("Marks")} />}
        </div>
      </div>
      {meta(r)}
    </li>
  );
  const pager = (p: { page: number; pages: number }, go: (n: number) => void) => p.pages > 1 && (
    <div className="mt-2 flex justify-between text-sm">{p.page > 1 ? <button type="button" onClick={() => go(p.page - 1)} className="font-semibold text-teal-ink">‹ {t("Previous")}</button> : <span />}<span className="text-muted">{t("Page {n} of {total}", { n: p.page, total: p.pages })}</span>{p.page < p.pages ? <button type="button" onClick={() => go(p.page + 1)} className="font-semibold text-teal-ink">{t("Next")} ›</button> : <span />}</div>
  );
  const simNum = (key: keyof SimulationSettings, label: string, max: number) => (
    <label className="grid gap-1 text-xs font-semibold text-ink-2">{t(label)}<input type="number" min={0} max={max} value={sim[key] as number} onChange={(e) => setSim({ ...sim, [key]: Number(e.target.value) })} className={NUM} /></label>
  );
  const byStd = props.standards.map((x) => ({ x, n: rows.filter((r) => r.standard === x.code).length })).filter((y) => y.n);

  return (
    <div className="grid gap-4">
      {locked && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("This test already has results: saving makes a new copy.")}</p>}

      {/* ------------------------------------------------------------ step 1: start from */}
      <section className={CARD} aria-labelledby="s1-h">
        <h2 id="s1-h" className="flex items-center gap-2 text-lg font-semibold text-ink"><span className={STEP}>1</span>{t("Start from")}</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3" role="radiogroup" aria-labelledby="s1-h">
          {STARTS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={start === x.key} onClick={() => pickStart(x.key)}
              className={`rounded-2xl p-4 text-start ring-2 ${start === x.key ? "bg-teal-50 ring-teal-600" : "bg-surface ring-line hover:ring-teal-300"}`}>
              <p className="font-semibold text-ink"><span aria-hidden="true">{x.icon} </span>{t(x.title)}</p>
              <p className="mt-1 text-sm text-ink-2">{t(x.text)}</p>
            </button>
          ))}
        </div>
        {start === "BOOKLET" && (
          <div className="mt-4 grid gap-2">
            <label className="grid max-w-xl gap-1 text-sm font-semibold text-ink-2" htmlFor="nb-pick">{t("Model booklet")}</label>
            <Combo id="nb-pick" label={t("Model booklet")} value={booklet} onChange={chooseBooklet} options={bookletOptions} className="max-w-xl" />
            {!props.booklets.length && <p className="text-xs text-muted">{t("No model booklets in the bank yet: they load in the background, or an admin loads them from Load new questions.")}</p>}
            <p className="text-xs text-muted">{t("The whole booklet as it is when the number of questions covers it; fewer questions are picked by the standards.")}</p>
          </div>
        )}
        {start === "ALL" && <p className="mt-4 text-sm text-ink-2">{t("Covers EVERY standard of the NAFS reading test: the 13 Ministry standards under the three content areas, in the guide's proportions (3 per standard, 1 for S11 and S12 — 35 per text), scaled to your number of questions but never below one per standard. At least one informational and one literary text, balanced difficulty and the four PIRLS processes.")}</p>}
        {start === "CHOOSE" && (
          <div className="mt-4 grid gap-3">
            <TargetChecklist groups={groups} value={codes} onChange={setCodes} legend="Standards and skills" preview={false}
              counts={perSkill && shape === "BALANCED" ? skillCounts : undefined} onCount={perSkill && shape === "BALANCED" ? (c, v) => setSkillCounts({ ...skillCounts, [c]: Math.max(0, Math.min(props.maxQuestions, v)) }) : undefined} />
            <fieldset className="flex flex-wrap items-center gap-3 text-sm">
              <legend className="mb-1 text-sm font-semibold text-ink-2">{t("Shape")}</legend>
              <label className="flex min-h-10 items-center gap-2"><input type="radio" checked={shape === "BALANCED"} onChange={() => setShape("BALANCED")} /> {t("Balanced over my choice")}</label>
              <label className="flex min-h-10 items-center gap-2"><input type="radio" checked={shape === "BOOKLET"} onChange={() => setShape("BOOKLET")} /> {t("Like the real booklet (passages, PIRLS mix)")}</label>
              {shape === "BALANCED" && <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={perSkill} onChange={(e) => setPerSkill(e.target.checked)} /> {t("Number of questions per skill")}</label>}
            </fieldset>
            {shape === "BOOKLET" && (
              <div className="grid gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                <p className="text-xs text-ink-2">{t("Like the real booklet: passages (at least one literary and one informational), each with its questions, the PIRLS mix and vocabulary items. Change any number.")}</p>
                <div className="flex flex-wrap gap-3">{simNum("passages", "Passages", 8)}{simNum("perPassageMin", "Per passage (min)", 20)}{simNum("perPassageMax", "Per passage (max)", 20)}{simNum("vocabularyPct", "Vocabulary %", 100)}</div>
                <div className="flex flex-wrap gap-3">{(["P1", "P2", "P3", "P4"] as const).map((p) => <label key={p} className="grid gap-1 text-xs font-semibold text-ink-2" title={codeName(p, t)}>{p} %<input type="number" min={0} max={100} value={sim.process[p]} onChange={(e) => setSim({ ...sim, process: { ...sim.process, [p]: Number(e.target.value) } })} className={NUM} /></label>)}</div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ step 2: options (every start) */}
      <section className={`${CARD} grid gap-4 ring-2 ring-teal-200`} aria-labelledby="s2-h">
        <h2 id="s2-h" className="flex items-center gap-2 text-lg font-semibold text-ink"><span className={STEP}>2</span>{t("Options")}</h2>
        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold text-ink">{t("Test or practice")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["TEST", "PRACTICE"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={purpose === k} disabled={Boolean(ex) && k === "PRACTICE"} onClick={() => { setPurpose(k); setError(null); }} className={`min-h-11 rounded-xl px-4 text-start text-sm ring-1 disabled:opacity-40 ${purpose === k ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>
                <b>{t(k === "TEST" ? "Test" : "Practice")}</b> <span className="opacity-80">· {t(k === "TEST" ? "fixed, timed, graded — assign online, print the booklet or bubble sheets" : "adaptive practice on the same standards")}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-sm font-semibold text-ink">{t("Number of questions")} <span className="text-xs font-normal text-muted">{full ? t("at least {n} (one per standard)", { n: FULL_MIN_QUESTIONS }) : t("required")}</span>
            {start === "CHOOSE" && shape === "BALANCED" && perSkill ? <output className={`${NUM} inline-flex min-h-11 items-center`}>{perSkillSum}</output>
              : <input type="number" required min={nMin} max={props.maxQuestions} value={count} onChange={(e) => changeCount(e.target.value)} className={`${NUM} min-h-11 text-lg ${nOk ? "" : "ring-2 ring-rose-400"}`} />}
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">{t(isTest ? "Time (minutes)" : "Time (minutes, optional)")} {isTest && <span className="text-xs font-normal text-muted">{t("required")}</span>}
            <input type="number" min={1} max={props.maxMinutes} value={minutes} onChange={(e) => { setMinutes(e.target.value); setMinutesSet(true); }} className={`${NUM} min-h-11 text-lg ${mOk || !isTest ? "" : "ring-2 ring-rose-400"}`} />
          </label>
          <DifficultyPicker value={dchoice} mix={mix} onChange={(c, x) => { setDchoice(c); setMix(x); }}
            adaptiveNote={isTest ? "Online, each student starts at Medium: a right answer brings a harder question, a wrong answer an easier one, inside the test's standards. On paper the test prints as Mixed." : undefined} />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {isTest && start !== "CHOOSE" && <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} className="h-4 w-4" /> {t("Include the short written answers (S03, S13 — you mark them)")}</label>}
          <div className="grid min-w-56 gap-1 text-xs font-semibold text-ink-2">
            <span>{t(isTest ? "Prefer questions this class has not seen" : "Class")}</span>
            <Combo label={t(isTest ? "Prefer questions this class has not seen" : "Class")} value={classId} onChange={(v) => { setClassId(v); setSids([]); }} options={isTest ? [{ value: "", label: "—" }, ...classOptions] : classOptions} />
          </div>
          <button type="button" disabled={busy} onClick={build} className={`${BTN} min-h-11 bg-brand-navy px-5 text-white disabled:opacity-50`}>{busy ? t("Building…") : t(rows.length ? "Build again" : "Build the test")}</button>
        </div>
        {full && !rows.length && <p className="text-xs text-muted">{t("Planned")}: {props.standards.map((x) => `${x.short} ${counts[x.code] ?? 1}`).join(" · ")} = {planned}</p>}
        {!full && rows.length > 0 && nOk && rows.length !== n && isTest && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t("The test has {have} question(s) but you chose {n}. Add or remove questions, or change the number of questions.", { have: rows.length, n })} <button type="button" onClick={() => { setCount(String(rows.length)); setPerSkill(false); }} className="ms-1 font-semibold underline">{t("Use {n}", { n: rows.length })}</button></p>}
      </section>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-rose-900 ring-1 ring-rose-200">{error}</p>}
      {notes.length > 0 && <ul className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{notes.map((x) => <li key={x}>{x}</li>)}</ul>}

      {/* ------------------------------------------------------------ the complete test: coverage to check */}
      {full && rows.length > 0 && (
        <section className={CARD} aria-labelledby="cov-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="cov-h" className="text-lg font-semibold text-ink">{t("Summary to check before saving")}</h2>
            <p className="text-sm text-ink-2"><b className="text-2xl tabular-nums text-ink">{cov.total}</b> {t("questions")} · {t("{n} of 13 standards covered", { n: 13 - cov.uncovered.length })}{isTest ? ` · ${t("{n} marks", { n: totalMarks })}` : ""}</p>
          </div>
          {needsConfirm ? <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">⚠ {t("Not covered")}: {cov.uncovered.map((c) => codeName(c, t)).join(" · ")}</p>
            : <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">✓ {t("Every one of the 13 standards is covered.")}</p>}
          {cov.noStandard > 0 && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t("{n} question(s) have no Ministry standard: they cover no standard.", { n: cov.noStandard })}</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-xs uppercase tracking-wide text-muted"><th className="py-2 text-start">{t("Standard")}</th><th className="text-start">{t("Questions")}</th><th className="text-start">{t("Difficulty")}</th><th className="text-start">{t("PIRLS processes")}</th><th className="text-start">{t("Covered")}</th></tr></thead>
              <tbody>
                {AREAS_WITH_STANDARDS.map((a) => (
                  <Fragment key={a.code}>
                    <tr><td colSpan={5} className="bg-surface-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-2">{a.n}. {t(a.name)}</td></tr>
                    {a.standards.map((code) => {
                      const r = cov.rows.find((x) => x.code === code)!;
                      const lack = r.available !== null && r.available < r.want;
                      return (
                        <tr key={code} className="border-b border-line align-top">
                          <td className="py-2 pe-2 text-ink">{codeName(code, t)}</td>
                          <td className="whitespace-nowrap py-2 pe-2"><span className={`tabular-nums ${r.got < r.want ? "font-semibold text-amber-700" : "text-ink"}`}>{r.got}</span> / <input type="number" min={1} max={props.maxQuestions} value={counts[code] ?? 1} onChange={(e) => setStdCount(code, Number(e.target.value))} className={`${INPUT} w-14 tabular-nums`} aria-label={t("Questions for {skill}", { skill: codeName(code, t) })} /></td>
                          <td className="whitespace-nowrap py-2 pe-2 text-xs">{([1, 2, 3] as const).map((k) => `${t(DIFFICULTY_NAME[k])} ${r.byDifficulty[k]}`).join(" · ")}</td>
                          <td className="py-2 pe-2 text-xs" dir="ltr">{r.processes.join(" ") || "—"}</td>
                          <td className="py-2">
                            {r.covered && r.got >= r.want ? <span className="font-semibold text-emerald-700" aria-label={t("Covered")}>✓</span> : (
                              <div className="grid gap-1 text-xs">
                                <span className={r.covered ? "text-amber-800" : "font-semibold text-rose-700"}>{r.covered ? `✓ ${t("{n} fewer than planned", { n: r.want - r.got })}` : `⚠ ${t("Not covered")}`}</span>
                                {lack && <span className="text-rose-800">{t("The bank has {have} — {n} missing.", { have: r.available ?? 0, n: r.missing })}</span>}
                                <div className="flex flex-wrap gap-1">
                                  {lack && <button type="button" onClick={() => { setAi({ ...ai, code, count: Math.max(1, Math.min(8, r.missing)), withPassage: false }); setAdd("AI"); }} className="rounded-md px-2 py-1 font-semibold text-teal-ink ring-1 ring-line">✨ {t("Write new with AI")}</button>}
                                  {lack && (r.available ?? 0) >= 1 && <button type="button" onClick={() => setStdCount(code, Math.max(1, available?.[code] ?? 1))} className="rounded-md px-2 py-1 font-semibold text-ink-2 ring-1 ring-line">{t("Use fewer for this standard")}</button>}
                                  <button type="button" onClick={() => { setAddFor(code); setAdd("BANK"); setFound(null); find(1, code); }} className="rounded-md px-2 py-1 font-semibold text-ink-2 ring-1 ring-line">{t("Add")}</button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-ink-2">{t("Difficulty")}: {([1, 2, 3] as const).map((k) => `${t(DIFFICULTY_NAME[k])} ${cov.byDifficulty[k]}`).join(" · ")} · {t("PIRLS processes")}: {(["P1", "P2", "P3", "P4"] as const).map((p) => `${p} ${cov.byProcess[p]}`).join(" · ")}</p>
          {(!cov.texts.INFO || !cov.texts.LIT) && <p className="mt-1 text-xs font-semibold text-amber-700">{t(!cov.texts.INFO ? "No informational text in the test." : "No literary text in the test.")}</p>}
        </section>
      )}

      {/* ------------------------------------------------------------ step 3: the questions */}
      <section className={CARD} aria-labelledby="s3-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="s3-h" className="flex items-center gap-2 text-lg font-semibold text-ink"><span className={STEP}>3</span>{t("The questions")} <span className="text-sm font-normal text-muted">{t("{n} questions", { n: rows.length })}{isTest ? ` · ${t("{n} marks", { n: totalMarks })}` : ""}</span></h2>
          {full && rows.length > 0 && <div className="flex gap-1" role="group" aria-label={t("View")}>{(["STANDARD", "ORDER"] as const).map((k) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`${BTN} ring-1 ${view === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink-2 ring-line"}`}>{t(k === "STANDARD" ? "By standard" : "Test order")}</button>)}</div>}
        </div>
        {!full && byStd.length > 0 && <p className="mt-2 flex flex-wrap gap-1 text-xs">{byStd.map(({ x, n: k }) => <span key={x.code} className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-900 ring-1 ring-indigo-200">{codeName(x.code, t)} · <b className="tabular-nums">{k}</b></span>)}</p>}
        {!rows.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t("Build the test, or add questions from the NAFS bank below.")}</p>
          : full && view === "STANDARD" ? (
            <div className="mt-3 grid gap-3">
              {AREAS_WITH_STANDARDS.map((a) => (
                <div key={a.code} className="grid gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{a.n}. {t(a.name)}</h3>
                  {a.standards.map((code) => {
                    const mine = rows.filter((r) => r.standard === code);
                    return (
                      <div key={code} className="rounded-xl p-2 ring-1 ring-line">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                          <p className="text-sm font-semibold text-ink">{codeName(code, t)} · {mine.length ? <span className="text-emerald-700">✓ {mine.length}</span> : <span className="text-rose-700">⚠ {t("Not covered")}</span>}</p>
                          <button type="button" onClick={() => { setAddFor(code); setAdd("BANK"); setFound(null); find(1, code); }} className={`${BTN} text-teal-ink ring-1 ring-line`}>+ {t("Add")}</button>
                        </div>
                        <ol className="mt-1 grid gap-1.5">{mine.map((r) => rowLine(r, rows.indexOf(r), false))}</ol>
                      </div>
                    );
                  })}
                </div>
              ))}
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
        {/* the ways to add: from the bank, or new questions written by AI (drafts approved here) */}
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("Add questions")}>
          <button type="button" aria-pressed={add === "BANK"} onClick={() => { setAdd(add === "BANK" ? null : "BANK"); setAddFor(null); }} className={`${BTN} min-h-11 ring-1 ${add === "BANK" ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink ring-line"}`}>+ {t("Add from the NAFS bank")}</button>
          <button type="button" aria-pressed={add === "AI"} onClick={() => setAdd(add === "AI" ? null : "AI")} className={`${BTN} min-h-11 ring-1 ${add === "AI" ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-teal-ink ring-teal-300"}`}>✨ {t("Write new with AI")}</button>
        </div>
        {add === "BANK" && (
          <div className="mt-3 grid gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
            {addFor && <p className="text-sm font-semibold text-ink">{t("For")}: {codeName(addFor, t)} <button type="button" onClick={() => { setAddFor(null); setFound(null); }} className="ms-2 text-xs font-semibold text-teal-ink underline">{t("Any standard")}</button></p>}
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <input value={search.q} onChange={(e) => setSearch({ ...search, q: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(1); } }} placeholder={t("Words in the question")} aria-label={t("Words in the question")} className={`${INPUT} min-h-11`} />
              {!addFor && <Combo label={t("Standard or skill")} value={search.code} onChange={(v) => setSearch({ ...search, code: v })} options={[{ value: "", label: t("All standards and skills") }, ...targetOptions]} />}
              <Combo label={t("Model booklet or practice set")} value={search.set} onChange={(v) => setSearch({ ...search, set: v })} options={[{ value: "", label: t("Every source") }, ...setOptions]} className="md:col-span-1" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["", "1", "2", "3"] as const).map((k) => <button key={k} type="button" aria-pressed={search.dif === k} onClick={() => setSearch({ ...search, dif: k })} className={`${BTN} min-h-9 ring-1 ${search.dif === k ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>{k ? t(DIFFICULTY_NAME[Number(k) as 1 | 2 | 3]) : t("Any")}</button>)}
              <button type="button" onClick={() => find(1)} disabled={busy} className={`${BTN} ms-auto bg-brand-navy text-white`}>{t("Search")}</button>
            </div>
            {found && (
              <>
                {!found.rows.length && <p className="text-sm text-muted">{t("No questions match.")}</p>}
                <ul className="divide-y divide-line">
                  {found.rows.map((r) => {
                    const off = ids.includes(r.id) || (r.kind === "WRITTEN" && !isTest);
                    return (
                      <li key={r.id} className="py-2">
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" aria-expanded={peek === r.id} onClick={() => setPeek(peek === r.id ? null : r.id)} className="min-w-0 flex-1 text-start text-sm text-ink" lang="en" dir="ltr"><RichInline text={r.stem} /> <span className="text-xs text-muted">· {r.standard ? `${codeName(r.standard, t)} · ` : ""}{t(DIFFICULTY_NAME[r.difficulty])} · {t(r.skill)}{r.kind === "WRITTEN" ? " · ✍" : ""}{r.hasPassage ? ` · 📄 ${r.passageTitle ?? ""}` : ""}</span></button>
                          <button type="button" disabled={off || busy} onClick={() => addRow(r.id)} className={`${BTN} bg-teal-700 text-white disabled:opacity-40`}>{t(ids.includes(r.id) ? "Added" : "Add")}</button>
                        </div>
                        {peek === r.id && r.options.length > 0 && <ol className="mt-1 grid gap-1 sm:grid-cols-2" lang="en" dir="ltr">{r.options.map((o, i) => <li key={i} className={`rounded-md px-2 py-1 text-xs ring-1 ${i === r.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-200" : "bg-surface text-ink-2 ring-line"}`}><b>{"ABCD"[i]}.</b> <RichInline text={o} /></li>)}</ol>}
                      </li>
                    );
                  })}
                </ul>
                {pager(found, (p) => find(p))}
              </>
            )}
          </div>
        )}
        {add === "AI" && (
          <div className="mt-3 grid gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
            <p className="text-sm text-ink-2">{t("New, original questions written by AI from the NAFS blueprint and the 13 Ministry standards (MCQ A–D, Grade 6). Check each one, then approve it to add it to the test. Only curriculum data is sent — never student data.")}</p>
            <div className="grid gap-2 md:grid-cols-[2fr_auto_auto]">
              <Combo label={t("Standard or skill")} value={ai.code || (start === "CHOOSE" ? codes[0] ?? "" : "")} onChange={(v) => setAi({ ...ai, code: v })} options={targetOptions} />
              <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Questions")}<input type="number" min={1} max={8} value={ai.count} onChange={(e) => setAi({ ...ai, count: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} className={NUM} /></label>
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={ai.withPassage} onChange={(e) => setAi({ ...ai, withPassage: e.target.checked })} /> {t("With a new passage")}</label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {ai.withPassage && <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Kind of text")}<select value={ai.kind} onChange={(e) => setAi({ ...ai, kind: e.target.value as "" | "LIT" | "INFO" })} className={INPUT}><option value="">{t("Any kind")}</option><option value="LIT">{t("Literary")}</option><option value="INFO">{t("Informational")}</option></select></label>}
              <label className="grid flex-1 gap-1 text-xs font-semibold text-ink-2">{t("Passage topic (optional)")}<input value={ai.topic} maxLength={120} onChange={(e) => setAi({ ...ai, topic: e.target.value })} className={INPUT} /></label>
              <button type="button" disabled={busy} onClick={writeAi} className={`${BTN} min-h-11 bg-brand-navy px-5 text-white disabled:opacity-50`}>{busy ? t("Writing…") : `✨ ${t("Write the questions")}`}</button>
            </div>
            {drafts.length > 0 && (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{t("{n} draft(s) ready for review.", { n: drafts.length })}</p><button type="button" disabled={busy} onClick={() => approve(drafts.map((d) => d.id))} className={`${BTN} bg-emerald-700 text-white`}>{t("Approve all and add")}</button></div>
                <ul className="grid gap-2">
                  {drafts.map((d) => (
                    <li key={d.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                      <p className="text-sm text-ink" lang="en" dir="ltr"><RichInline text={d.stem} /></p>
                      {d.options.length > 0 && <ol className="mt-1 grid gap-1 sm:grid-cols-2" lang="en" dir="ltr">{d.options.map((o, i) => <li key={i} className={`rounded-md px-2 py-1 text-xs ring-1 ${i === d.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-200" : "bg-surface-2 text-ink-2 ring-line"}`}><b>{"ABCD"[i]}.</b> <RichInline text={o} /></li>)}</ol>}
                      {meta(d)}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => approve([d.id])} className={`${BTN} bg-emerald-700 text-white`}>{t("Approve and add")}</button>
                        <Link href={`/teacher/nafs/question?id=${encodeURIComponent(d.id)}`} className={`${BTN} inline-flex items-center ring-1 ring-line`}>{t("Edit")}</Link>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">{t("Drafts you do not approve stay in the Question bank for review.")} <Link href="/teacher/nafs?tab=bank&src=DRAFT" className="font-semibold underline">{t("Review the drafts")}</Link></p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ save */}
      {rows.length > 0 && (
        <section className={`${CARD} grid gap-3`} aria-label={t("Save")}>
          {!isTest && (
            <div className="grid gap-3">
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={wholeBank} onChange={(e) => setWholeBank(e.target.checked)} className="h-4 w-4" /> {t("Adapt over every center question of these standards (not only this list)")}</label>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2"><span>{t("Only these students (optional)")}</span>
                  <Combo multiple label={t("Only these students (optional)")} value={sids} onChange={setSids} options={(klass?.students ?? []).map((x) => ({ value: x.id, label: x.name }))} placeholder={klass ? t("The whole class") : t("Choose the class first")} disabled={!klass} />
                </div>
                <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Questions per student")}<input type="number" min={1} max={60} value={perStudent} placeholder={String(Math.min(60, rows.length))} onChange={(e) => setPerStudent(e.target.value)} className={`${INPUT} w-24`} /></label>
                <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Due date (optional)")}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={INPUT} /></label>
              </div>
            </div>
          )}
          {needsConfirm && <label className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1 h-4 w-4" /> {t("I know these standards are not covered and want to save anyway: {list}", { list: cov.uncovered.map((c) => codeName(c, t)).join(" · ") })}</label>}
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2">{t(isTest ? "Test name" : "Name")}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={`${INPUT} min-h-11`} /></label>
            <p className="text-sm text-ink-2">{t("{n} questions", { n: rows.length })}{mOk ? ` · ${t("{n} minutes", { n: m })}` : ""}{dchoice === "ADAPTIVE" ? ` · ↕ ${t("Adaptive")}` : ""}</p>
            <button type="button" disabled={busy || !title.trim() || (needsConfirm && !confirm)} onClick={save} className="min-h-11 rounded-xl bg-brand-navy px-6 font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : t(isTest ? "Save the test" : "Give the practice")}</button>
          </div>
          {isTest && <p className="text-xs text-muted">{t(dchoice === "ADAPTIVE" ? "After saving: assign it online (it adapts to each student) or print it (Mixed)." : "After saving: assign it online, print the booklet or print bubble sheets from the test's page.")}</p>}
        </section>
      )}
    </div>
  );
}
