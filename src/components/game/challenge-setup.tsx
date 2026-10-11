"use client";
/**
 * 🏁 Live Challenge setup: several skills (names only, one row per skill; search + Reading / Grammar / Vocabulary
 * filters; for each chosen skill the platform picks the questions or the teacher does), the game
 * mode (from the game registry — Part 2 games appear here by themselves), number of questions, time per question,
 * question level (same for all / each student's level), for one of the teacher's own classes. Start · Save as template.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { GameModePicker } from "./mode-picker";
import type { ChallengeSkill, ChallengeTemplate, SkillFilter } from "@/server/game/live-challenge";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { SkillQuestionPicker, dedupeSkillsByName, type PickerValue } from "@/components/skill-picker";
import { deleteChallengeTemplateAction, saveChallengeTemplateAction, searchChallengeSkillsAction, startChallengeAction } from "@/app/games/live-actions";

const FILTERS: { key: SkillFilter; label: string }[] = [{ key: "ALL", label: "All" }, { key: "READING", label: "Reading" }, { key: "GRAMMAR", label: "Grammar" }, { key: "VOCABULARY", label: "Vocabulary" }];
const box = "min-h-11 rounded-xl border border-slate-300 bg-white px-3";

export function ChallengeSetup({ classes, initialClassId, initialSkills, templates: initialTemplates }: {
  classes: { id: string; name: string; grade: number }[]; initialClassId: string | null; initialSkills: ChallengeSkill[]; templates: ChallengeTemplate[];
  /** no longer used (skill names only, no grade filter); kept so older callers still compile */
  grades?: number[];
}) {
  const t = useT();
  const router = useRouter();
  const [classId, setClassId] = useState(initialClassId ?? classes[0]?.id ?? "");
  const [mode, setMode] = useState("quiz-race");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("ALL");
  const [skills, setSkills] = useState(initialSkills);
  const [picked, setPicked] = useState<Map<string, ChallengeSkill>>(new Map());
  const [picks, setPicks] = useState<Record<string, string[]>>({});   // "I'll pick the questions", per skill
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
      const r = await searchChallengeSkillsAction({ q, filter, mode });
      if (r.skills) setSkills(r.skills);
    }, 250);
    return () => clearTimeout(id);
  }, [q, filter, mode]);
  // one row per skill name (+ kind): the copy with the most fitting questions stands for the skill
  const rows = useMemo(() => dedupeSkillsByName(skills, (k) => k.filter, (a, b) => a.fitting > b.fitting), [skills]);

  const choose = (id: string, v: PickerValue) => setPicks((p) => { const n = { ...p }; if (v.auto || !v.questionIds.length) delete n[id]; else n[id] = v.questionIds; return n; });
  const toggle = (k: ChallengeSkill) => {
    if (picked.has(k.id)) choose(k.id, { auto: true });
    setPicked((m) => { const n = new Map(m); if (n.has(k.id)) n.delete(k.id); else if (n.size < 10) n.set(k.id, k); return n; });
  };
  const spec = useMemo(() => {
    const own = Object.fromEntries(Object.entries(picks).filter(([id]) => picked.has(id)));
    return { skillIds: [...picked.keys()], mode: mode as never, count, seconds, levelMode, ...(Object.keys(own).length ? { picks: own } : {}) };
  }, [picked, picks, mode, count, seconds, levelMode]);

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
    setPicks(tp.spec.picks ?? {});
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

        <GameModePicker skillIds={spec.skillIds} mode={mode} onMode={setMode} />

        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">{t("Skills — choose one or more")}</legend>
          {picked.size > 0 && (
            <ul className="mt-2 grid gap-2" aria-label={t("Chosen skills")}>
              {[...picked.values()].map((k) => (
                <li key={k.id} className="grid gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <bdi dir="ltr" className="min-w-0 font-semibold text-brand-navy">{k.name}</bdi>
                    <button type="button" onClick={() => toggle(k)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white" aria-label={t("Remove {name}", { name: k.name })}>✕</button>
                  </div>
                  <SkillQuestionPicker key={k.id} skillId={k.id} name={null} max={30} defaultValue={picks[k.id] ? { auto: false, questionIds: picks[k.id] } : undefined} onChange={(v) => choose(k.id, v)} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search skills…")} aria-label={t("Search skills…")} className={`${box} min-w-0 flex-1`} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("Filter")}>
            {FILTERS.map((f) => <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ${filter === f.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{t(f.label)}</button>)}
          </div>
          <ul className="mt-3 grid max-h-80 gap-1 overflow-y-auto rounded-2xl p-2 ring-1 ring-slate-200 sm:grid-cols-2" data-testid="challenge-skills">
            {rows.length === 0 && <li className="p-3 text-slate-600">{t("No skills found.")}</li>}
            {rows.map((k) => (
              <li key={k.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(k.id)} onChange={() => toggle(k)} className="h-5 w-5" />
                  <bdi dir="ltr" className="min-w-0 flex-1">{k.name}</bdi>
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
