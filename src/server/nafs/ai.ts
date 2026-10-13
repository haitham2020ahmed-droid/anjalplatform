/**
 * 🇸🇦 "Generate new questions with AI" inside the NAFS section: the teacher chooses NAFS skill(s), how many and
 * (optionally) a short passage topic; the existing AI engine writes ORIGINAL Grade 6 NAFS-style questions (MCQ A–D,
 * the PIRLS processes, plausible distractors, an original passage of NAFS length when asked) that come back as DRAFTS
 * in the NAFS bank: the teacher reviews, edits and approves them before they can be used.
 * PRIVACY: the request holds curriculum data only (skills, stems, the blueprint) — never student data
 * (callJson's assertNoStudentData guards it); AI settings come from aiEnv() and the school's AI settings and limits.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike, type Validator } from "../ai/engine";
import type { geminiProvider, anthropicProvider } from "../ai/question-generator";
import { assertNafs } from "../teacher/nafs-access";
import { isMoeCode, isNafsCode, isProcess, MOE_OPTION_STYLES, MOE_STANDARDS, PROCESS_NAME, PROCESSES, SKILL_BY_CODE, domainOf, standardFor, type NafsProcess } from "./framework";
import { saveNafsDrafts, type NafsQuestionInput } from "./bank";

const s = (v: unknown) => String(v ?? "");
export const MAX_AI_QUESTIONS = 8;

export interface AiNafsInput {
  codes: string[]; count: number; topic?: string | null; withPassage?: boolean; textType?: "LIT" | "INFO" | null;
  /** every draft measures this Ministry standard (the complete NAFS test's "Generate with AI (draft)") */
  standard?: string | null;
}
interface AiReply { passage: { title: string; text: string; type: "LIT" | "INFO" } | null; questions: { skill: string; process: NafsProcess; standard: string | null; stem: string; options: string[]; correct: number; explanation: string }[] }

export function nafsPrompt(input: { codes: string[]; count: number; topic: string; withPassage: boolean; textType: "LIT" | "INFO" | null; standard?: string | null }): { system: string; user: Record<string, unknown> } {
  const required = input.standard ? MOE_STANDARDS.find((x) => x.code === input.standard) ?? null : null;
  const system = [
    "You write ORIGINAL English reading questions that simulate the Saudi national test NAFS (Grade 6, English reading section)",
    "at real Grade 6 INTERNATIONAL level (American curriculum, Common Core Grade 6 reading rigor): Grade 6 vocabulary and sentence complexity,",
    "inference that needs evidence from more than one sentence where the standard asks for it, never easier than Grade 6.",
    "Never copy text from published books, tests or websites: every passage and question is new. Culturally appropriate and child-friendly.",
    "Every question is multiple choice with exactly four options A–D and exactly ONE correct option; the wrong options are plausible distractors",
    "(a detail from the wrong part of the text, a too-literal meaning, an opinion instead of a fact…). Each question has a one-sentence explanation.",
    "Each question assesses the given NAFS skill and ONE of the four PIRLS reading processes: P1 retrieve explicitly stated information,",
    "P2 make straightforward inferences, P3 interpret and integrate ideas and information, P4 evaluate and critique content and textual elements.",
    "Vocabulary questions ask about words as used in the passage: synonyms and antonyms in context, near-synonyms (precise word choice),",
    "word forms (singular/plural, word families) and using a word correctly in a new sentence.",
    "When a passage is asked for, write ONE original passage of 250–450 words for Grade 6 (literary = a short story; informational = a short",
    "expository text), in paragraphs separated by a blank line, and base every question on it (refer to paragraphs by number).",
    "Each question also measures ONE of the 13 Ministry of Education NAFS reading standards (S01–S13, given below with the guide's sample question types);",
    "give its code (MOE.S01 … MOE.S13). The official option styles 'All of the above', 'A and B' and 'None of the above' may be used rarely (at most one question in six).",
    "Return ONLY JSON in exactly this shape:",
    '{"passage":{"title":"…","text":"…","type":"LIT"}|null,"questions":[{"skill":"NAFS.RC.MAIN","process":"P3","standard":"MOE.S04","stem":"…","options":["…","…","…","…"],"correct":0,"explanation":"…"}]}',
  ].join(" ");
  const user = {
    task: `Write ${input.count} new NAFS-style question(s).`,
    grade: 6, level: "Grade 6 international (American curriculum)",
    passageWanted: input.withPassage, passageKind: input.withPassage ? (input.textType === "LIT" ? "literary" : input.textType === "INFO" ? "informational" : "literary or informational") : null,
    passageTopic: input.topic || null,
    skills: input.codes.map((c) => { const k = SKILL_BY_CODE.get(c)!; return { code: c, skillName: k.name, meaning: k.about, typicalStems: k.stems, usualProcess: k.process }; }),
    processes: PROCESSES.map((p) => ({ code: p, processName: PROCESS_NAME[p] })),
    blueprint: "Spread the questions over the given skills; mix the processes (PIRLS: about 20% P1, 30% P2, 30% P3, 20% P4); options A–D; one correct.",
    sampleOfficialStyle: { stem: "What is a synonym for the word 'fleeting'?", options: ["Fixed", "Transitory", "Disturbed", "Authentic"], correct: 1 },
    ministryStandards: MOE_STANDARDS.map((x) => ({ code: x.code, standard: x.text, sampleQuestionTypes: x.samples, nafsSkills: x.nafs, processes: x.pirls })),
    officialOptionStyles: [...MOE_OPTION_STYLES],
    ministryBlueprint: "In the guide's booklet each text has 35 questions grouped under the 13 standards (3 each; S11 and S12 one each). Prefer the standards that fit the chosen skills.",
    ...(required ? { requiredStandard: { code: required.code, standard: required.text, sampleQuestionTypes: required.samples, rule: "EVERY question must measure this standard; give this code as its standard." } } : {}),
  };
  return { system, user };
}

export function nafsValidator(codes: string[], count: number, withPassage: boolean): Validator<AiReply> {
  return (data) => {
    const o = (data ?? {}) as Record<string, unknown>;
    const qs = Array.isArray(o.questions) ? o.questions : null;
    if (!qs || !qs.length) return { ok: false, error: "no questions list" };
    let passage: AiReply["passage"] = null;
    if (withPassage) {
      const p = (o.passage ?? null) as Record<string, unknown> | null;
      const words = s(p?.text).split(/\s+/).filter(Boolean).length;
      if (!p || words < 150) return { ok: false, error: "a passage of 250–450 words is required" };
      passage = { title: s(p.title).slice(0, 150), text: s(p.text).slice(0, 8000), type: s(p.type) === "LIT" ? "LIT" : "INFO" };
    }
    const out: AiReply["questions"] = [];
    for (const [i, raw] of qs.slice(0, count).entries()) {
      const q = (raw ?? {}) as Record<string, unknown>;
      const opts = Array.isArray(q.options) ? q.options.map((x) => s(x).trim()) : [];
      const correct = Number(q.correct);
      if (!s(q.stem).trim()) return { ok: false, error: `question ${i + 1}: no stem` };
      if (opts.length !== 4 || opts.some((x) => !x) || new Set(opts.map((x) => x.toLowerCase())).size !== 4) return { ok: false, error: `question ${i + 1}: exactly four different options` };
      if (!Number.isInteger(correct) || correct < 0 || correct > 3) return { ok: false, error: `question ${i + 1}: correct must be 0–3` };
      const skill = codes.includes(s(q.skill)) ? s(q.skill) : codes[i % codes.length];
      out.push({ skill, process: isProcess(q.process) ? (s(q.process) as NafsProcess) : SKILL_BY_CODE.get(skill)!.process, standard: isMoeCode(q.standard) ? s(q.standard) : standardFor(null, skill, s(q.stem)), stem: s(q.stem).trim().slice(0, 1000), options: opts.map((x) => x.slice(0, 300)), correct, explanation: s(q.explanation).trim().slice(0, 1000) });
    }
    return { ok: true, value: { passage, questions: out } };
  };
}

/** Writes drafts with the AI engine; returns the new draft ids (or why nothing was made). */
export async function generateNafsDrafts(repo: Repo, actor: Actor, input: AiNafsInput, deps: { env: EnvLike; make?: { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider } }, now = new Date()): Promise<{ ids: string[]; error?: string }> {
  await assertNafs(repo, actor);
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const standard = isMoeCode(input.standard) ? s(input.standard) : null;
  let codes = [...new Set((input.codes ?? []).map(s).filter((c) => isNafsCode(c) && domainOf(c) !== "PIRLS"))];
  // drafts for one Ministry standard: its own NAFS skills when none are chosen
  if (!codes.length && standard) codes = (MOE_STANDARDS.find((x) => x.code === standard)?.nafs ?? []).filter((c) => isNafsCode(c) && domainOf(c) !== "PIRLS");
  if (!codes.length) throw new ValidationError("Choose at least one NAFS skill.");
  const count = Math.round(Number(input.count));
  if (!(count >= 1 && count <= MAX_AI_QUESTIONS)) throw new ValidationError(`Choose 1 to ${MAX_AI_QUESTIONS} questions at a time.`);
  const topic = s(input.topic).replace(/\s+/g, " ").trim().slice(0, 120);
  const settings = await aiSettings(repo, actor.schoolId);
  const picked = pickProvider(deps.env, settings, deps.make);
  if (!picked.ok) return { ids: [], error: picked.reason };
  const rate = await rateState(repo, actor.schoolId, settings, now);
  if (rate.waitMs > 0) return { ids: [], error: rate.reason ?? `The AI limit per minute is reached. Try again in ${Math.ceil(rate.waitMs / 1000)} seconds.` };
  const withPassage = Boolean(input.withPassage);
  const prompt = nafsPrompt({ codes, count, topic, withPassage, textType: input.textType ?? null, standard });
  const r = await callJson(repo, { schoolId: actor.schoolId, tool: "nafs-generate", picked, items: count }, prompt.system, prompt.user, nafsValidator(codes, count, withPassage));
  if (!r.ok) return { ids: [], error: r.error };
  const list: Omit<NafsQuestionInput, "id">[] = r.value.questions.map((q) => ({
    nafsCode: q.skill, process: q.process, standard: standard ?? q.standard, stem: q.stem, options: q.options, correct: q.correct, explanation: q.explanation,
    passageTitle: r.value.passage?.title ?? null, passageText: r.value.passage?.text ?? null, textType: r.value.passage?.type ?? null,
  }));
  return { ids: await saveNafsDrafts(repo, actor, list, now) };
}
