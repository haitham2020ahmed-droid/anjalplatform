"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BuilderClass, BuilderSkill, LevelMode, TemplateSpec, TestPreview, TestType } from "@/server/tests/assessments";
import { assignTestAction, previewTestAction, saveTemplateAction } from "../actions";
import { useT } from "@/i18n/client";
import { EmptyState } from "@/components/ui-kit";
import { SkillQuestionPicker, dedupeSkillsByName, type PickerValue } from "@/components/skill-picker";

const TYPES: { id: TestType; label: string }[] = [
  { id: "NAFS", label: "NAFS" }, { id: "MAP", label: "MAP" }, { id: "DIAGNOSTIC", label: "Diagnostic" },
  { id: "WEEKLY_QUIZ", label: "Weekly Quiz" }, { id: "CHAPTER_TEST", label: "Chapter Test" }, { id: "CUSTOM", label: "+ Custom" },
];
const FILTERS = [{ id: "ALL", label: "All" }, { id: "READING", label: "Reading" }, { id: "GRAMMAR", label: "Grammar" }, { id: "VOCABULARY", label: "Vocabulary" }] as const;
const VERSION_NAME: Record<string, string> = { SAME: "Questions", BELOW: "Below Level version", ON: "On Level version", ABOVE: "Above Level version" };
const defaultMode = (t: TestType): LevelMode => (t === "WEEKLY_QUIZ" ? "LEVEL" : "SAME");
const btn = "inline-flex min-h-11 items-center justify-center rounded-xl px-5 font-semibold";

type Template = { id: string; title: string; type: TestType; spec: TemplateSpec } | null;

/**
 * The test builder: skills (names only, one row per skill) → for each chosen skill, the platform picks N questions
 * or the teacher picks them → type and name → More options → preview (remove questions) → assign.
 */
export function TestBuilder({ skills, classes, names, template, preview: initialPreview }: { skills: BuilderSkill[]; classes: BuilderClass[]; names: Record<TestType, string>; template: Template; preview: TestPreview | null }) {
  const router = useRouter();
  const t = useT();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("ALL");
  const [own, setOwn] = useState<Record<string, string[]>>({});   // "I'll pick the questions", per skill
  const [picked, setPicked] = useState<Record<string, number>>(() => Object.fromEntries((template?.spec.skills ?? []).map((k) => [k.skillId, k.count])));
  const [type, setType] = useState<TestType>(template?.type ?? "WEEKLY_QUIZ");
  const [name, setName] = useState(template?.title ?? names.WEEKLY_QUIZ);
  const [nameEdited, setNameEdited] = useState(Boolean(template));
  const [more, setMore] = useState(false);
  const [levelMode, setLevelMode] = useState<LevelMode>(template?.spec.levelMode ?? "LEVEL");
  const [openAt, setOpenAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [limit, setLimit] = useState(template?.spec.timeLimitMin ? String(template.spec.timeLimitMin) : "");
  const [shuffle, setShuffle] = useState(template?.spec.shuffle ?? false);
  const [preview, setPreview] = useState<TestPreview | null>(initialPreview);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [who, setWho] = useState<"CLASS" | "SOME">("CLASS");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(template?.id ?? null);

  // one row per skill name (+ kind): the copy with the most questions stands for the skill
  const unique = useMemo(() => dedupeSkillsByName(skills, (k) => k.filter, (a, b) => a.available > b.available), [skills]);
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return unique.filter((k) => picked[k.id] !== undefined || ((filter === "ALL" || k.filter === filter) && (!w || k.name.toLowerCase().includes(w)))).slice(0, 80);
  }, [unique, q, filter, picked]);
  const pickedList = skills.filter((k) => picked[k.id] !== undefined);
  const klass = classes.find((c) => c.id === classId);

  function chooseType(tt: TestType) {
    setType(tt);
    if (!nameEdited) setName(tt === "CUSTOM" ? "" : names[tt]);
    setLevelMode(defaultMode(tt));
    setPreview(null);
  }
  function toggle(id: string) {
    setPicked((p) => { const n = { ...p }; if (n[id] !== undefined) delete n[id]; else n[id] = 5; return n; });
    setPreview(null);
  }
  const specSkills = () => Object.entries(picked).map(([skillId, count]) => (own[skillId]?.length ? { skillId, count: Math.min(20, own[skillId].length), questionIds: own[skillId] } : { skillId, count }));
  const choose = (id: string, v: PickerValue) => { setOwn((o) => { const n = { ...o }; if (v.auto) delete n[id]; else n[id] = v.questionIds; return n; }); setPreview(null); };
  const questions = () => Object.fromEntries(Object.entries(preview?.versions ?? {}).map(([k, l]) => [k, (l ?? []).map((x) => x.id)]));

  async function doPreview() {
    setBusy(true); setMsg(null);
    const r = await previewTestAction({ skills: specSkills(), levelMode, seed: String(Date.now()) });
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: t(r.error) });
    setPreview(r.preview!);
  }
  function remove(key: string, id: string) {
    if (!preview) return;
    setPreview({ ...preview, versions: { ...preview.versions, [key]: (preview.versions[key as keyof typeof preview.versions] ?? []).filter((x) => x.id !== id) } });
  }
  async function doSaveTemplate() {
    if (!preview) return setMsg({ ok: false, text: t("Press Preview first.") });
    setBusy(true); setMsg(null);
    const r = await saveTemplateAction({ id: templateId, title: name || "My test", type, spec: { skills: specSkills(), levelMode, timeLimitMin: limit ? Number(limit) : null, shuffle, questions: questions() } });
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: t(r.error) });
    setTemplateId(r.id!);
    setMsg({ ok: true, text: t("✓ Saved in My templates.") });
  }
  async function doAssign() {
    if (!preview) return setMsg({ ok: false, text: t("Press Preview first.") });
    if (who === "SOME" && !chosen.length) return setMsg({ ok: false, text: t("Choose at least one student, or choose the whole class.") });
    setBusy(true); setMsg(null);
    const r = await assignTestAction({ classId, type, title: name, levelMode, studentIds: who === "SOME" ? chosen : [], openAt, dueAt, timeLimitMin: limit ? Number(limit) : null, shuffle, questions: questions(), templateId });
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: t(r.error) });
    router.push(`/teacher/assessments/${r.testId}?msg=${encodeURIComponent(t("✓ Assigned. It is in your students' My Tests."))}`);
  }

  return (
    <div className="grid gap-6">
      {/* 1. skills */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-brand-navy">{t("1. Pick skills")}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search a skill…")} aria-label={t("Search a skill")} className="min-h-11 w-full max-w-sm rounded-xl px-4 ring-1 ring-slate-300" />
          {FILTERS.map((f) => <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={`min-h-11 rounded-full px-4 font-semibold ${filter === f.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300"}`}>{t(f.label)}</button>)}
        </div>
        {!shown.length ? <EmptyState compact icon="🔎" title="Nothing matches your search" text="Try another word or filter." className="mt-4" /> : (
          <ul className="mt-4 grid max-h-96 gap-1 overflow-y-auto">
            {shown.map((k) => (
              <li key={k.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 accent-brand-teal" checked={picked[k.id] !== undefined} onChange={() => toggle(k.id)} />
                  <span>{k.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {pickedList.length > 0 && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="font-semibold text-brand-navy">{t("Chosen skills · number of questions")}</p>
            <ul className="mt-2 grid gap-3">
              {pickedList.map((k) => (
                <li key={k.id} className="grid gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 font-semibold">{k.name}</span>
                    {!own[k.id] && <input type="number" min={1} max={20} value={picked[k.id]} aria-label={t("Number of questions for {name}", { name: k.name })} onChange={(e) => { setPicked({ ...picked, [k.id]: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }); setPreview(null); }} className="min-h-11 w-20 rounded-xl px-3 ring-1 ring-slate-300" />}
                    <button type="button" onClick={() => { toggle(k.id); choose(k.id, { auto: true }); }} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{t("Remove")}</button>
                  </div>
                  <SkillQuestionPicker skillId={k.id} name={null} max={20} defaultValue={own[k.id] ? { auto: false, questionIds: own[k.id] } : undefined} onChange={(v) => choose(k.id, v)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. type and name */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-brand-navy">{t("2. Test type and name")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TYPES.map((x) => <button key={x.id} type="button" onClick={() => chooseType(x.id)} aria-pressed={type === x.id} className={`min-h-11 rounded-xl px-4 font-semibold ${type === x.id ? "bg-teal-700 text-white" : "bg-white ring-1 ring-slate-300"}`}>{x.id === "CUSTOM" ? `+ ${t("Custom")}` : t(x.label)}</button>)}
        </div>
        <label className="mt-4 block font-semibold text-slate-700">{t("Name")}
          <input value={name} onChange={(e) => { setName(e.target.value); setNameEdited(true); }} placeholder={type === "CUSTOM" ? t("Type any name") : ""} className="mt-1 block min-h-11 w-full max-w-lg rounded-xl px-4 font-normal ring-1 ring-slate-300" />
        </label>
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="mt-4 min-h-11 rounded-xl px-4 font-semibold text-brand-navy ring-1 ring-slate-300">{more ? `${t("Fewer options")} ▲` : `${t("More options")} ▼`}</button>
        {more && (
          <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <fieldset>
              <legend className="font-semibold text-slate-700">{t("Question level")}</legend>
              <label className="mt-2 flex min-h-11 items-center gap-2"><input type="radio" name="level" checked={levelMode === "SAME"} onChange={() => { setLevelMode("SAME"); setPreview(null); }} className="h-5 w-5" /> {t("Same for all")}</label>
              <label className="mt-2 flex min-h-11 items-center gap-2"><input type="radio" name="level" checked={levelMode === "LEVEL"} onChange={() => { setLevelMode("LEVEL"); setPreview(null); }} className="h-5 w-5" /> {t("At each student's level (Below / On / Above)")}</label>
            </fieldset>
            <div className="grid gap-3">
              <label className="font-semibold text-slate-700">{t("Open date")}<input type="date" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className="mt-1 block min-h-11 rounded-xl px-3 font-normal ring-1 ring-slate-300" /></label>
              <label className="font-semibold text-slate-700">{t("Due date")}<input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-1 block min-h-11 rounded-xl px-3 font-normal ring-1 ring-slate-300" /></label>
              <label className="font-semibold text-slate-700">{t("Time limit (minutes, optional)")}<input type="number" min={1} max={240} value={limit} onChange={(e) => setLimit(e.target.value)} className="mt-1 block min-h-11 w-28 rounded-xl px-3 font-normal ring-1 ring-slate-300" /></label>
              <label className="flex min-h-11 items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="h-5 w-5" /> {t("Shuffle questions and answer choices for each student")}</label>
            </div>
          </div>
        )}
      </section>

      {/* 3. preview */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand-navy">{t("3. Preview")}</h2>
          <button type="button" disabled={busy || !pickedList.length} onClick={() => void doPreview()} className={`${btn} bg-brand-navy text-white disabled:opacity-50`}>{preview ? t("Pick new questions") : t("Preview")}</button>
        </div>
        {!preview ? <EmptyState compact icon="👀" title="Nothing to show yet" text="Choose skills, then press Preview to see the questions." className="mt-3" /> : (
          <div className="mt-4 grid gap-4">
            {preview.notes.length > 0 && <ul className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{preview.notes.map((n) => <li key={n}>{t(n)}</li>)}</ul>}
            {Object.entries(preview.versions).map(([key, list]) => (
              <div key={key}>
                <p className="font-semibold text-brand-navy">{t(VERSION_NAME[key])} · {t("{n} question(s)", { n: (list ?? []).length })}</p>
                <ol className="mt-2 grid gap-2">
                  {(list ?? []).map((x, i) => (
                    <li key={x.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                      <span className="font-semibold text-slate-500">{i + 1}.</span>
                      <span className="flex-1"><span className="block text-xs font-semibold text-slate-500">{x.skill}</span><span data-content lang="en">{x.stem}</span></span>
                      <button type="button" onClick={() => remove(key, x.id)} aria-label={t("Remove question {n}", { n: i + 1 })} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{t("Remove")}</button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <div><button type="button" disabled={busy} onClick={() => void doSaveTemplate()} className={`${btn} text-brand-navy ring-1 ring-slate-300`}>{templateId ? t("Save template changes") : t("Save as template")}</button></div>
          </div>
        )}
      </section>

      {/* 4. assign */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-brand-navy">{t("4. Assign")}</h2>
        {!classes.length ? <EmptyState compact icon="👥" title="No classes yet" text="When the admin adds you to a class, you can assign tests here." className="mt-3" /> : (
          <div className="mt-3 grid gap-3">
            {classes.length > 1 && (
              <label className="font-semibold text-slate-700">{t("Class")}
                <select value={classId} onChange={(e) => { setClassId(e.target.value); setChosen([]); }} className="mt-1 block min-h-11 rounded-xl px-3 font-normal ring-1 ring-slate-300">
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({t("Grade {n}", { n: c.grade })})</option>)}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setWho("CLASS")} aria-pressed={who === "CLASS"} className={`min-h-11 rounded-xl px-4 font-semibold ${who === "CLASS" ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>{t("Whole class ({n})", { n: klass?.students.length ?? 0 })}</button>
              <button type="button" onClick={() => setWho("SOME")} aria-pressed={who === "SOME"} className={`min-h-11 rounded-xl px-4 font-semibold ${who === "SOME" ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>{t("A student or a group")}</button>
            </div>
            {who === "SOME" && klass && (
              <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
                {klass.students.map((st) => (
                  <li key={st.id}><label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={chosen.includes(st.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, st.id] : chosen.filter((x) => x !== st.id))} /> {st.name}</label></li>
                ))}
              </ul>
            )}
            <div><button type="button" disabled={busy || !preview} onClick={() => void doAssign()} className={`${btn} bg-teal-700 text-white disabled:opacity-50`}>{busy ? t("Working…") : t("Assign")}</button></div>
          </div>
        )}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-4 rounded-xl px-4 py-3 ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      </section>
    </div>
  );
}
