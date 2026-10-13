"use client";
/**
 * ⚡ "Make the test for me": the teacher chooses lessons (Curriculum Map selections / sections) and skills, the number
 * of questions, the level, an optional answer-type mix and passage share, and the total marks; the platform builds a
 * balanced test (src/server/tests/generate.ts) and it fills the builder's selected list, where the teacher views,
 * replaces, removes and reorders questions before the usual Preview → Preview as student → Assign.
 */
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import type { BuilderClass, BuilderSkill } from "@/server/tests/assessments";
import type { MapSourceTree } from "@/server/tests/map-source";
import type { GeneratedTest } from "@/server/tests/generate";
import { generateTestAction, mapTreeAction } from "../actions";

const LEVELS = [
  { id: "MIXED", label: "Mixed levels" }, { id: "BELOW", label: "Below" }, { id: "ON", label: "On" }, { id: "ABOVE", label: "Above" }, { id: "FIT", label: "Fit my class" },
] as const;
const TYPES = [
  ["MULTIPLE_CHOICE", "Multiple choice"], ["MULTI_SELECT", "Multiple select"], ["TRUE_FALSE", "True / False"], ["FILL_BLANK", "Fill in the blank"],
  ["TWO_PART", "Two-part"], ["GRID", "Grid"], ["HOT_TEXT", "Hot text"], ["MATCHING", "Matching"], ["SENTENCE_ORDER", "Order"], ["ERROR_CORRECTION", "Error correction"],
] as const;
const SHARES = [{ v: "", label: "Any" }, { v: "0", label: "No passages" }, { v: "25", label: "About 25%" }, { v: "50", label: "About half" }, { v: "75", label: "About 75%" }, { v: "100", label: "All with a passage" }];
const chip = (on: boolean) => `min-h-10 rounded-full px-3.5 text-sm font-semibold ring-1 ${on ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`;
const field = "min-h-11 rounded-xl px-3 ring-1 ring-slate-300";

export function MakeTest({ tree: initialTree, skills, classes, classId, onClassId, onDone }: {
  tree: MapSourceTree; skills: BuilderSkill[]; classes: BuilderClass[]; classId: string; onClassId: (id: string) => void;
  onDone: (r: GeneratedTest) => void;
}) {
  const t = useT();
  const [tree, setTree] = useState(initialTree);
  const [lessons, setLessons] = useState<{ code: string; label: string }[]>([]);
  const [chosenSkills, setChosenSkills] = useState<BuilderSkill[]>([]);
  const [q, setQ] = useState("");
  const [count, setCount] = useState("20");
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("MIXED");
  const [mix, setMix] = useState<Record<string, string>>({});
  const [share, setShare] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Math.round(Number(count) || 0);
  const lessonCodes = new Set(lessons.map((l) => l.code));
  const found = useMemo(() => {
    const w = q.trim().toLowerCase();
    const picked = new Set(chosenSkills.map((k) => k.id));
    return skills.filter((k) => k.available > 0 && !picked.has(k.id) && (!w || k.name.toLowerCase().includes(w))).slice(0, 40);
  }, [skills, q, chosenSkills]);

  async function chooseGrade(g: number) {
    if (g === tree.grade) return;
    setBusy(true); setError(null);
    const r = await mapTreeAction(g);
    setBusy(false);
    if (r.error) return setError(t(r.error));
    setTree(r.tree!);
  }
  const toggleLesson = (code: string, label: string) => setLessons((l) => (l.some((x) => x.code === code) ? l.filter((x) => x.code !== code) : [...l.filter((x) => !x.code.startsWith(`${code}.`)), { code, label }]));

  async function make() {
    setError(null);
    if (!lessons.length && !chosenSkills.length) return setError(t("Choose at least one lesson or skill."));
    if (n < 5 || n > 60) return setError(t("The number of questions must be 5 to 60."));
    if (level === "FIT" && !classId) return setError(t("Choose a class for “Fit my class”."));
    const types = Object.fromEntries(Object.entries(mix).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    setBusy(true);
    const r = await generateTestAction({ lessons: lessons.map((l) => l.code), skillIds: chosenSkills.map((k) => k.id), count: n, level, classId: classId || null, types: Object.keys(types).length ? types : null, passageShare: share === "" ? null : Number(share), totalMarks: total === "" ? null : Number(total), seed: String(Date.now()) });
    setBusy(false);
    if (r.error) return setError(t(r.error));
    onDone(r.test!);
  }

  return (
    <div className="mt-3 grid gap-4 rounded-2xl bg-amber-50/40 p-4 ring-1 ring-amber-200" aria-busy={busy}>
      <p className="text-sm text-slate-700">{t("Choose lessons and / or skills. The platform spreads the questions across them, keeps passage questions together, avoids what your class saw recently and orders them from easy to hard. You can then view, replace, remove or reorder any question.")}</p>

      {/* lessons */}
      <fieldset className="grid gap-2">
        <legend className="font-semibold text-brand-navy">{t("Lessons")} <span className="text-sm font-normal text-slate-500">({t("Curriculum Map selections or sections")})</span></legend>
        {tree.grades.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label={t("Grade")}>{tree.grades.map((g) => <button key={g} type="button" onClick={() => void chooseGrade(g)} aria-pressed={tree.grade === g} className={chip(tree.grade === g)}>{t("Grade {n}", { n: g })}</button>)}</div>}
        {!tree.units.length ? <p className="text-sm text-slate-500">{t("No Curriculum Map questions for your grades yet. Choose skills below.")}</p> : (
          <ul className="grid max-h-72 gap-1.5 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-slate-200">
            {tree.units.map((u) => (
              <li key={`${tree.grade}-${u.unit}`}>
                <details className="group">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 font-semibold text-brand-navy hover:bg-slate-50"><span aria-hidden="true" className="text-slate-400 transition group-open:rotate-90 rtl:-scale-x-100">▸</span><span className="flex-1" lang="en" data-content>{u.title}</span><span className="text-xs text-slate-500">{t("{n} questions", { n: u.count })}</span></summary>
                  <ul className="grid gap-1 ps-6">
                    {u.sets.filter((x) => x.count > 0).map((set) => (
                      <li key={set.code}>
                        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-teal" checked={lessonCodes.has(set.code)} onChange={() => toggleLesson(set.code, set.title)} /><span className="flex-1"><span className="font-semibold" lang="en" data-content>{set.title}</span> <span className="text-xs text-slate-500" lang="en" data-content>{set.heading}</span></span><span className="text-xs text-slate-500">{set.count}</span></label>
                        {!lessonCodes.has(set.code) && (
                          <ul className="grid gap-0.5 ps-7">
                            {set.sections.filter((x) => x.count > 0).map((sec) => <li key={sec.code}><label className="flex min-h-9 items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand-teal" checked={lessonCodes.has(sec.code)} onChange={() => toggleLesson(sec.code, `${set.title} · ${sec.label}`)} /><span className="flex-1" lang="en" data-content>{sec.label}</span><span className="text-slate-500">{sec.count}</span></label></li>)}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        {lessons.length > 0 && <div className="flex flex-wrap gap-1.5">{lessons.map((l) => <button key={l.code} type="button" onClick={() => toggleLesson(l.code, l.label)} className="min-h-9 rounded-full bg-white px-3 text-sm ring-1 ring-teal-300" aria-label={t("Remove {name}", { name: l.label })}><span lang="en" data-content>{l.label}</span> ✕</button>)}</div>}
      </fieldset>

      {/* skills */}
      <fieldset className="grid gap-2">
        <legend className="font-semibold text-brand-navy">{t("Skills")}</legend>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search a skill…")} aria-label={t("Search a skill")} className={`${field} w-full max-w-sm`} />
        {(q.trim() || found.length <= 12) && (
          <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-slate-200">
            {!found.length ? <li className="px-2 py-1 text-sm text-slate-500">{t("Nothing matches your search")}</li> : found.map((k) => (
              <li key={k.id}><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-teal" checked={false} onChange={() => setChosenSkills((l) => [...l, k])} /><span className="flex-1" lang="en" data-content>{k.name}</span><span className="text-xs text-slate-500">{t("Grade {n}", { n: k.grade })} · {t("{n} questions", { n: k.available })}</span></label></li>
            ))}
          </ul>
        )}
        {chosenSkills.length > 0 && <div className="flex flex-wrap gap-1.5">{chosenSkills.map((k) => <button key={k.id} type="button" onClick={() => setChosenSkills((l) => l.filter((x) => x.id !== k.id))} className="min-h-9 rounded-full bg-white px-3 text-sm ring-1 ring-teal-300" aria-label={t("Remove {name}", { name: k.name })}><span lang="en" data-content>{k.name}</span> ✕</button>)}</div>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="font-semibold text-slate-700">{t("Number of questions (5–60)")}
          <input type="number" min={5} max={60} value={count} onChange={(e) => setCount(e.target.value)} className={`${field} mt-1 block w-28 font-normal`} />
        </label>
        <label className="font-semibold text-slate-700">{t("Total marks")}
          <input type="number" min={1} max={6000} value={total} placeholder={String(n || "")} onChange={(e) => setTotal(e.target.value)} className={`${field} mt-1 block w-28 font-normal`} />
          <span className="mt-1 block text-xs font-normal text-slate-500">{t("Each question gets total ÷ number; you can change any question's marks later.")}</span>
        </label>
      </div>

      <fieldset>
        <legend className="font-semibold text-slate-700">{t("Level")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">{LEVELS.map((l) => <button key={l.id} type="button" onClick={() => setLevel(l.id)} aria-pressed={level === l.id} className={chip(level === l.id)}>{t(l.label)}</button>)}</div>
        {level === "FIT" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>{t("From the class's recent accuracy (80%+ Above, 60–79% On, under 60% Below).")}</span>
            {classes.length > 1 && <select value={classId} onChange={(e) => onClassId(e.target.value)} aria-label={t("Class")} className={field}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          </div>
        )}
      </fieldset>

      <details className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <summary className="cursor-pointer font-semibold text-brand-navy">{t("More choices (optional): answer types and passages")}</summary>
        <div className="mt-3 grid gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">{t("Answer-type mix (%)")} <span className="font-normal text-slate-500">{t("Leave empty for any type.")}</span></p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {TYPES.map(([code, label]) => (
                <label key={code} className="flex items-center gap-2 text-sm"><input type="number" min={0} max={100} value={mix[code] ?? ""} onChange={(e) => setMix({ ...mix, [code]: e.target.value })} aria-label={t("{type} share", { type: t(label) })} className="min-h-10 w-20 rounded-xl px-2 ring-1 ring-slate-300" /> {t(label)}</label>
              ))}
            </div>
          </div>
          <label className="text-sm font-semibold text-slate-700">{t("Questions with a reading passage")}
            <select value={share} onChange={(e) => setShare(e.target.value)} className={`${field} mt-1 block font-normal`}>{SHARES.map((x) => <option key={x.v} value={x.v}>{t(x.label)}</option>)}</select>
          </label>
        </div>
      </details>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <div><button type="button" disabled={busy} onClick={() => void make()} className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white disabled:opacity-50">{busy ? t("Working…") : `⚡ ${t("Make the test")}`}</button></div>
    </div>
  );
}
