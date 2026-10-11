/**
 * 🪞 Findings & Discussion: the five reflection questions of the school's analysis workbook, drafted from the class
 * analysis for the teacher to edit. The platform writes a draft from the numbers itself; with the school's AI
 * provider the wording is improved — only class-level numbers are sent (no names, no student rows).
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike } from "../ai/engine";
import { classDiagnosticReport } from "./report";

export const REFLECTION_QUESTIONS = [
  "What are the most noticeable trends in your class performance?",
  "Which assessment areas or skills show the weakest performance?",
  "What instructional or assessment-related factors may have contributed to these results?",
  "Which strategies or practices appeared to have a positive impact on students' learning?",
  "What specific instructional adjustments will you implement next term based on these results?",
] as const;
export interface Reflection { answers: { question: string; answer: string }[]; source: "AI" | "PLATFORM" }

export async function draftReflection(repo: Repo, actor: Actor, testId: string, classId: string | null, env: EnvLike, now = new Date()): Promise<Reflection> {
  const r = await classDiagnosticReport(repo, actor, testId, classId, now);
  const S = r.summary;
  const u = r.adaptive ? "" : "%";
  const weak = [...r.standards].sort((a, b) => a.pct - b.pct).slice(0, 3);
  const strong = [...r.standards].sort((a, b) => b.pct - a.pct).slice(0, 2);
  const strands = [...r.strands].sort((a, b) => a.pct - b.pct);
  const n = Math.max(1, S.levels.ABOVE + S.levels.ON + S.levels.BELOW);
  const share = (k: "ABOVE" | "ON" | "BELOW") => Math.round((100 * S.levels[k]) / n);
  const built: string[] = [
    `${S.assessed} of ${S.roster} students took the test. The class mean is ${S.mean}${u} (median ${S.median}${u}, range ${S.min}–${S.max}${u}${S.sd !== null ? `, spread ±${S.sd}` : ""}). ${share("ABOVE")}% are Above Level, ${share("ON")}% On Level and ${share("BELOW")}% Below Level. ${S.spread}`,
    weak.length ? `The weakest areas are ${weak.map((w) => `${w.label} (${w.code}, ${w.pct}${u})`).join(", ")}${strands.length ? `; by strand, ${strands[0].label} is the lowest (${strands[0].pct}${u})` : ""}. ${weak[0].below50} student(s) are under 50${u} in ${weak[0].label}.` : "Not enough results yet.",
    `${weak[0] ? `${weak[0].label} needs students to ${weak[0].objective.charAt(0).toLowerCase()}${weak[0].objective.slice(1)}` : "Some skills are new for this grade"} — skills that need more modelling and guided practice than they had. ${S.rapidFlags ? `${S.rapidFlags} student(s) answered very fast, so part of the low results may be effort rather than skill.` : "Students worked carefully (few very fast answers), so the results reflect their skills."}`,
    strong.length ? `The strongest results are in ${strong.map((w) => `${w.label} (${w.pct}${u})`).join(" and ")}: the routines used there (modelling, text evidence, discussion) are working and can be used for the weaker skills.` : "—",
    `Teach ${weak.slice(0, 2).map((w) => w.label).join(" and ") || "the weakest skills"} in small groups using the 8-week support plan (${r.supportPlan.length ? `${r.supportPlan[0].label} first` : "weakest standard first"}); ${S.levels.ABOVE ? `extend the ${S.levels.ABOVE} Above Level student(s) with harder texts; ` : ""}check progress every week with the Weekly Check and regroup after four weeks.`,
  ];
  const platform: Reflection = { source: "PLATFORM", answers: REFLECTION_QUESTIONS.map((q, i) => ({ question: q, answer: built[i] })) };
  const settings = await aiSettings(repo, String(actor.schoolId));
  const picked = pickProvider(env, settings);
  if (!picked.ok) return platform;
  if ((await rateState(repo, String(actor.schoolId), settings, now)).waitMs > 0) return platform;
  const payload = {
    grade: r.grade, assessedCount: S.assessed, rosterCount: S.roster, classMean: S.mean, classMedian: S.median, spreadSD: S.sd, scale: r.adaptive ? "0-100 against the grade (72.5 = on grade level)" : "percent correct",
    levelShares: { above: share("ABOVE"), on: share("ON"), below: share("BELOW") },
    strandAverages: r.strands.map((x) => ({ strand: x.label, average: x.pct })),
    standardAverages: r.standards.map((x) => ({ code: x.code, skill: x.label, average: x.pct, under50Count: x.below50 })),
    fastAnswerFlags: S.rapidFlags, supportPlanFirstWeeks: r.supportPlan.slice(0, 3).map((w) => w.label),
    questions: REFLECTION_QUESTIONS, platformDraft: built,
  };
  const system = "You help an English-language-arts teacher (Grades 4–6, English learners whose first language is Arabic) write the reflection section of a class assessment analysis. Use ONLY the numbers given; do not invent data, names or events. For each of the 5 questions write 2–4 clear, professional sentences in the teacher's voice (first person), concrete and actionable. Reply JSON only: {\"answers\": [string, string, string, string, string]}.";
  const res = await callJson(repo, { schoolId: String(actor.schoolId), tool: "reflection", picked, items: 1 }, system, payload, (data) => {
    const a = (data as { answers?: unknown })?.answers;
    if (!Array.isArray(a) || a.length !== 5 || a.some((x) => typeof x !== "string" || x.trim().length < 20)) return { ok: false, error: "answers must be 5 paragraphs" };
    return { ok: true, value: a.map((x) => String(x).trim()) };
  }, 1).catch(() => ({ ok: false as const, error: "", stop: true }));
  if (!res.ok) return platform;
  return { source: "AI", answers: REFLECTION_QUESTIONS.map((q, i) => ({ question: q, answer: res.value[i] })) };
}
