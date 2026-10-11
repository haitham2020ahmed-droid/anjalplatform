"use client";
/**
 * 🏁 Live Challenge setup: several skills of ANY grade (search + Reading / Grammar / Vocabulary filters), the game
 * mode (from the game registry — Part 2 games appear here by themselves), number of questions, time per question,
 * question level (same for all / each student's level), for one of the teacher's own classes. Start · Save as template.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { GAMES } from "@/games/registry";
import type { ChallengeSkill, ChallengeTemplate, SkillFilter } from "@/server/game/live-challenge";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { deleteChallengeTemplateAction, saveChallengeTemplateAction, searchChallengeSkillsAction, startChallengeAction } from "@/app/games/live-actions";

const FILTERS: { key: SkillFilter; label: string }[] = [{ key: "ALL", label: "All" }, { key: "READING", label: "Reading" }, { key: "GRAMMAR", label: "Grammar" }, { key: "VOCABULARY", label: "Vocabulary" }];
const box = "min-h-11 rounded-xl border border-slate-300 bg-white px-3";

export function ChallengeSetup({ classes, initialClassId, initialSkills, templates: initialTemplates, grades }: {
  classes: { id: string; name: string; grade: number }[]; initialClassId: string | null; initialSkills: ChallengeSkill[]; templates: ChallengeTemplate[]; grades: number[];
}) {
  const t = useT();
  const router = useRouter();
  const [classId, setClassId] = useState(initialClassId ?? classes[0]?.id ?? "");
  const [mode, setMode] = useState("quiz-race");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("ALL");
  const [grade, setGrade] = useState(0);
  const [skills, setSkills] = useState(initialSkills);
  const [picked, setPicked] = useState<Map<string, ChallengeSkill>>(new Map());
  const [count, setCount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [levelMode, setLevelMode] = useState<"SAME" | "LEVEL">("SAME");
  const [title, setTitle] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(async () => {
      const r = await searchChallengeSkillsAction({ q, filter, grade: grade || undefined, mode });
      if (r.skills) setSkills(r.skills);
    }, 250);
    return () => clearTimeout(id);
  }, [q, filter, grade, mode]);

  const toggle = (k: ChallengeSkill) => setPicked((m) => { const n = new Map(m); if (n.has(k.id)) n.delete(k.id); else if (n.size < 10) n.set(k.id, k); return n; });
  const spec = useMemo(() => ({ skillIds: [...picked.keys()], mode: mode as never, count, seconds, levelMode }), [picked, mode, count, seconds, levelMode]);

  const go = () => start(async () => {
    setMsg(null);
    const r = await startChallengeAction({ ...spec, classId, title });
    if (r.error) setMsg({ ok: false, text: r.error }); else router.push(`/teacher/live/${r.id}`);
  });
  const save = () => start(async () => {
    setMsg(null);
    const r = await saveChallengeTemplateAction({ id: templateId, title: title || t("Live Challenge"), spec });
    if (r.error) { setMsg({ ok: false, text: r.error }); return; }
    setTemplateId(r.id!);
    setTemplates((l) => [{ id: r.id!, title: title || t("Live Challenge"), spec: spec as ChallengeTemplate["spec"], updatedAt: new Date().toISOString() }, ...l.filter((x) => x.id !== r.id)]);
    setMsg({ ok: true, text: t("Template saved.") });
  });
  const open = (tp: ChallengeTemplate) => start(async () => {
    setTemplateId(tp.id); setTitle(tp.title); setMode(tp.spec.mode); setCount(tp.spec.count); setSeconds(tp.spec.seconds); setLevelMode(tp.spec.levelMode);
    const all = await searchChallengeSkillsAction({ mode: tp.spec.mode });
    const byId = new Map((all.skills ?? []).map((k) => [k.id, k]));
    setPicked(new Map(tp.spec.skillIds.filter((id) => byId.has(id)).map((id) => [id, byId.get(id)!])));
    setMsg({ ok: true, text: t("Template opened.") });
  });
  const remove = (id: string) => start(async () => { await deleteChallengeTemplateAction(id); setTemplates((l) => l.filter((x) => x.id !== id)); if (templateId === id) setTemplateId(null); });

  const canStart = !!classId && picked.size > 0 && !pending;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="space-y-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Class")}
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={box}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Name (optional)")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={box} />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">{t("Game mode")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {GAMES.map((g) => {
              const can = g.ready && g.live;
              return (
                <label key={g.id} className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 ring-1 ${mode === g.id ? "bg-sky-50 ring-2 ring-brand-teal" : "bg-white ring-slate-200"} ${can ? "cursor-pointer" : "opacity-55"}`}>
                  <input type="radio" name="mode" value={g.id} checked={mode === g.id} disabled={!can} onChange={() => setMode(g.id)} className="sr-only" />
                  <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl ${g.color}`}>{g.icon}</span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-brand-navy">{t(g.name)}</span><span className="block text-xs text-slate-600">{t(g.line)}</span></span>
                  {!can && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{t("Soon")}</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">{t("Skills (any grade) — choose one or more")}</legend>
          {picked.size > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("Chosen skills")}>
              {[...picked.values()].map((k) => (
                <li key={k.id}><button type="button" onClick={() => toggle(k)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-brand-navy px-3 text-sm font-semibold text-white" aria-label={t("Remove {name}", { name: k.name })}><bdi dir="ltr">{k.name}</bdi> <span className="text-white/70">G{k.grade}</span> ✕</button></li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search skills…")} aria-label={t("Search skills…")} className={`${box} min-w-0 flex-1`} />
            <select value={grade} onChange={(e) => setGrade(Number(e.target.value))} aria-label={t("Grade")} className={box}>
              <option value={0}>{t("Any grade")}</option>
              {grades.map((g) => <option key={g} value={g}>{t("Grade {n}", { n: g })}</option>)}
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("Filter")}>
            {FILTERS.map((f) => <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ${filter === f.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{t(f.label)}</button>)}
          </div>
          <ul className="mt-3 grid max-h-80 gap-1 overflow-y-auto rounded-2xl p-2 ring-1 ring-slate-200 sm:grid-cols-2" data-testid="challenge-skills">
            {skills.length === 0 && <li className="p-3 text-slate-600">{t("No skills found.")}</li>}
            {skills.map((k) => (
              <li key={k.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(k.id)} onChange={() => toggle(k)} className="h-5 w-5" />
                  <bdi dir="ltr" className="min-w-0 flex-1">{k.name}</bdi>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 text-xs text-slate-600">G{k.grade}</span>
                  <span className="shrink-0 text-xs text-slate-400" dir="ltr">{k.fitting} Q</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Number of questions")}
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={box}>{[5, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Time per question")}
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className={box}>{[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{t("{n} seconds", { n })}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Question level")}
            <select value={levelMode} onChange={(e) => setLevelMode(e.target.value === "LEVEL" ? "LEVEL" : "SAME")} className={box}>
              <option value="SAME">{t("Same for all")}</option>
              <option value="LEVEL">{t("Each student's level")}</option>
            </select>
          </label>
        </div>

        {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-red-50 text-red-800 ring-red-200"}`}>{msg.text}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={go} disabled={!canStart} className={`${BTN_PRIMARY} min-h-12 px-8 text-lg disabled:opacity-50`} data-testid="start-challenge">▶ {t("Start")}</button>
          <button type="button" onClick={save} disabled={!picked.size || pending} className={`${BTN_SECONDARY} min-h-12 disabled:opacity-50`}>{t("Save as template")}</button>
        </div>
      </section>

      <aside className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-brand-navy">{t("My templates")}</h2>
        {templates.length === 0 ? <p className="text-sm text-slate-600">{t("Save a setup to use it again.")}</p> : (
          <ul className="space-y-2">
            {templates.map((tp) => (
              <li key={tp.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
                <button type="button" onClick={() => open(tp)} className="min-h-11 min-w-0 flex-1 truncate text-start font-semibold text-brand-navy">{tp.title}<span className="block text-xs font-normal text-slate-500">{t("{n} skills · {q} questions", { n: tp.spec.skillIds.length, q: tp.spec.count })}</span></button>
                <button type="button" onClick={() => remove(tp.id)} aria-label={t("Delete")} className="grid h-11 w-11 place-items-center rounded-full text-slate-500 hover:bg-white">✕</button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
