/**
 * ⭐ ReadMaster: the same article (topic + skill) in three reading levels, Achieve3000-style.
 *   - Each version (Below / On / Above Level) has its own text and Lexile; its questions are regular
 *     questions, so they are also in the Question Bank.
 *   - Every student has a reading Lexile: it starts from MAP (else the middle of their grade's On Level band)
 *     and moves after every article: 75%+ correct → +30L, under 50% → −30L (Achieve3000 uses 75% as the
 *     benchmark). The version shown is the one whose level matches the student's Lexile (grade Lexile bands);
 *     crossing a band edge moves them to the next version — real adaptivity between versions.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, can, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { createDraft } from "../admin/questions";
import { unclassifiedSkillId } from "../curriculum-map/questions";
import { lexileBands, levelForLexile, type Level } from "../curriculum-map/lexile";
import { loadQuestionItems, toClientQuestion, correctAnswerText, type ClientQuestion } from "../practice/items";
import { normalizeResponse } from "../practice/session";
import { scoreResponse } from "../../imports/questions/validate";

const s = (v: unknown) => String(v ?? "");
export const LEVELS: Level[] = ["BELOW", "ON", "ABOVE"];
export const LEVEL_NAMES: Record<Level, string> = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" };
export const RULES = { up: 75, down: 50, step: 30, min: 100, max: 1800 } as const;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const staff = (actor: Actor) => { if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Only staff can manage ReadMaster."); };

// ------------------------------------------------------------------ staff

export interface ArticleSummary { id: string; code: string; title: string; topic: string | null; grade: number; skill: string | null; standard: string | null; status: string; versions: { level: Level; lexile: number; questions: number }[]; attempts: number }

export async function listArticles(repo: Repo, actor: Actor, grade?: number): Promise<ArticleSummary[]> {
  assertCan(actor, "questions:read"); staff(actor);
  const arts = (await repo.findMany("ReadMasterArticle", { schoolId: actor.schoolId, ...(grade ? { gradeLevel: grade } : {}) })).sort((a, b) => Number(a.gradeLevel) - Number(b.gradeLevel) || s(a.title).localeCompare(s(b.title)));
  if (!arts.length) return [];
  const vers = await repo.findMany("ReadMasterVersion", { articleId: { in: arts.map((a) => a.id) } }, { select: ["id", "articleId", "level", "lexile"] });
  const links = vers.length ? await repo.findMany("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }, { select: ["versionId"] }) : [];
  const atts = await repo.findMany("ReadMasterAttempt", { articleId: { in: arts.map((a) => a.id) } }, { select: ["articleId"] });
  return arts.map((a) => ({
    id: s(a.id), code: s(a.code), title: s(a.title), topic: a.topic ? s(a.topic) : null, grade: Number(a.gradeLevel), skill: a.skillName ? s(a.skillName) : null, standard: a.standardCode ? shortStandard(s(a.standardCode)) : null, status: s(a.status),
    versions: LEVELS.map((l) => vers.find((v) => v.articleId === a.id && v.level === l)).filter((v): v is Row => Boolean(v)).map((v) => ({ level: s(v.level) as Level, lexile: Number(v.lexile), questions: links.filter((k) => k.versionId === v.id).length })),
    attempts: atts.filter((x) => x.articleId === a.id).length,
  }));
}

async function articleInSchool(repo: Repo, actor: Actor, id: string): Promise<Row> {
  const a = await repo.findUnique("ReadMasterArticle", { id });
  if (!a || a.schoolId !== actor.schoolId) throw new ForbiddenError("Article not found.");
  return a;
}

/** Skills of a grade for the article form (name → the article's skill). */
export async function gradeSkills(repo: Repo, schoolId: string, grade: number): Promise<{ id: string; name: string }[]> {
  const gs = await repo.findMany("Grade", { schoolId, level: grade }, { select: ["id"] });
  const curs = gs.length ? await repo.findMany("Curriculum", { gradeId: { in: gs.map((g) => g.id) } }, { select: ["id"] }) : [];
  if (!curs.length) return [];
  const all = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, isActive: true, deletedAt: null }, { select: ["id", "name", "code"] });
  return all.filter((k) => !s(k.code).endsWith(".curriculum-map-unclassified")).map((k) => ({ id: s(k.id), name: s(k.name) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Common Core standards of a grade (shared by all schools), grouped by strand. */
export const shortStandard = (code: string) => code.replace(/^CCSS\.ELA-LITERACY\./, "");
const STRANDS: Record<string, string> = { RL: "Reading: Literature", RI: "Reading: Informational Text", RF: "Reading: Foundational Skills", W: "Writing", SL: "Speaking & Listening", L: "Language" };
export async function gradeStandards(repo: Repo, grade: number): Promise<{ strand: string; items: { code: string; short: string; description: string }[] }[]> {
  const rows = (await repo.findMany("Standard", { gradeLevel: grade }, { select: ["code", "description", "isActive"] })).filter((x) => x.isActive !== false);
  const byStrand = new Map<string, { code: string; short: string; description: string }[]>();
  for (const r of rows) {
    const short = shortStandard(s(r.code)), key = short.split(".")[0];
    byStrand.set(key, [...(byStrand.get(key) ?? []), { code: s(r.code), short, description: s(r.description) }]);
  }
  const num = (x: string) => x.split(".").slice(1).map((p) => (/^\d+$/.test(p) ? p.padStart(3, "0") : p)).join(".");
  return ["RL", "RI", "RF", "L", "W", "SL"].filter((k) => byStrand.has(k)).map((k) => ({ strand: STRANDS[k], items: byStrand.get(k)!.sort((a, b) => num(a.short).localeCompare(num(b.short))) }));
}

/** “RI.6.2”, “ri 6.2” or the full code → the full code (or null when unknown). */
async function resolveStandard(repo: Repo, grade: number, raw: string | null | undefined): Promise<string | null> {
  const t = s(raw).trim().toUpperCase().replace(/\s+/g, "").replace(/^CCSS\.ELA-LITERACY\./, "");
  if (!t) return null;
  const hit = (await repo.findMany("Standard", { gradeLevel: grade }, { select: ["code"] })).find((x) => shortStandard(s(x.code)).toUpperCase() === t);
  if (!hit) throw new ValidationError(`“${raw}” is not a Common Core standard of Grade ${grade} (e.g. RI.${grade}.2).`);
  return s(hit.code);
}

export async function saveArticle(repo: Repo, actor: Actor, input: { id?: string; code?: string; title: string; topic?: string | null; grade: number; skillId?: string | null; skillName?: string | null; standard?: string | null }, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit"); staff(actor);
  const title = s(input.title).replace(/\s+/g, " ").trim();
  if (!title) throw new ValidationError("Write the article's title.");
  if (![4, 5, 6].includes(Number(input.grade))) throw new ValidationError("Choose Grade 4, 5 or 6.");
  // the skill shown to students: the name written by the teacher, else the platform skill, else the standard
  let skillName = input.skillName ? s(input.skillName).trim().slice(0, 191) : null;
  if (input.skillId) {
    const k = (await gradeSkills(repo, actor.schoolId!, Number(input.grade))).find((x) => x.id === input.skillId);
    if (!k) throw new ValidationError("That skill is not in this grade.");
    skillName = skillName || k.name;
  }
  const standardCode = await resolveStandard(repo, Number(input.grade), input.standard);
  if (!skillName && standardCode) skillName = shortStandard(standardCode);
  const data = { title: title.slice(0, 255), topic: input.topic ? s(input.topic).trim().slice(0, 191) : null, gradeLevel: Number(input.grade), skillId: input.skillId || null, skillName, standardCode, updatedAt: now };
  if (input.id) { await articleInSchool(repo, actor, input.id); await repo.updateMany("ReadMasterArticle", { id: input.id }, data); return input.id; }
  const code = (s(input.code).trim() || `${title.replace(/[^A-Za-z0-9]+/g, "-").toUpperCase().slice(0, 30)}-${Date.now().toString(36).toUpperCase()}`).slice(0, 60);
  if ((await repo.findMany("ReadMasterArticle", { schoolId: actor.schoolId, code })).length) throw new ValidationError(`An article with the code ${code} already exists.`);
  const a = await repo.create("ReadMasterArticle", { schoolId: actor.schoolId, code, ...data, status: "DRAFT", createdById: actor.userId, createdAt: now });
  return s(a.id);
}

/** One reading level of the article (text + Lexile). */
export async function saveVersion(repo: Repo, actor: Actor, articleId: string, level: Level, input: { lexile: number; body: string }): Promise<string> {
  assertCan(actor, "questions:edit"); staff(actor);
  await articleInSchool(repo, actor, articleId);
  if (!LEVELS.includes(level)) throw new ValidationError("Level must be Below, On or Above.");
  const body = s(input.body).replace(/\r\n?/g, "\n").trim();
  if (words(body) < 20) throw new ValidationError("The text needs at least 20 words.");
  if (body.length > 20_000) throw new ValidationError("The text is too long (limit 20,000 characters).");
  const lexile = Number(input.lexile);
  if (!Number.isInteger(lexile) || lexile < 0 || lexile > 2000) throw new ValidationError("Lexile must be a whole number from 0 to 2000 (e.g. 820).");
  const row = { lexile, body, wordCount: words(body) };
  const v = await repo.upsert("ReadMasterVersion", { articleId, level }, row, { articleId, level, ...row });
  return s(v.id);
}

const DIFFICULTY: Record<Level, number> = { BELOW: 3, ON: 4, ABOVE: 5 };

/** A question for one version (it is created as a regular question: it is in the Question Bank too). */
export async function addVersionQuestion(repo: Repo, actor: Actor, versionId: string, q: { type?: string; stem: string; options?: { label: string; text: string; correct: boolean; rationale?: string | null }[]; answer?: boolean; answers?: string[]; whyCorrect: string }): Promise<string> {
  assertCan(actor, "questions:edit"); staff(actor);
  const v = await repo.findUnique("ReadMasterVersion", { id: versionId });
  if (!v) throw new ForbiddenError("Version not found.");
  const a = await articleInSchool(repo, actor, s(v.articleId));
  const skillId = a.skillId ? s(a.skillId) : await unclassifiedSkillId(repo, actor.schoolId!, Number(a.gradeLevel));
  const id = await createDraft(repo, actor, {
    skillId, type: (q.type ?? "MULTIPLE_CHOICE") as never, stem: q.stem, level: DIFFICULTY[s(v.level) as Level], whyCorrect: q.whyCorrect,
    options: q.options?.map((o) => ({ label: o.label, text: o.text, correct: o.correct, rationale: o.correct ? null : o.rationale || "Read the text again." })),
    answer: q.answer, answers: q.answers, passageText: s(v.body), lexile: Number(v.lexile),
    ...(a.standardCode ? { standardCode: s(a.standardCode) } : {}),   // the full code (as stored in Standard)
  });
  if (can(actor, "questions:publish")) await repo.updateMany("Question", { id }, { status: "PUBLISHED", publishedAt: new Date(), reviewedById: actor.userId });
  const n = await repo.count("ReadMasterQuestion", { versionId });
  await repo.create("ReadMasterQuestion", { versionId, questionId: id, order: n });
  return id;
}

export async function setArticleStatus(repo: Repo, actor: Actor, articleId: string, status: "DRAFT" | "PUBLISHED"): Promise<void> {
  assertCan(actor, "questions:edit"); staff(actor);
  await articleInSchool(repo, actor, articleId);
  if (status === "PUBLISHED") {
    const vers = await repo.findMany("ReadMasterVersion", { articleId });
    const withQ = vers.length ? new Set((await repo.findMany("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }, { select: ["versionId"] })).map((x) => s(x.versionId))) : new Set<string>();
    if (!vers.some((v) => withQ.has(s(v.id)))) throw new ValidationError("Add at least one version with questions before publishing.");
  }
  await repo.updateMany("ReadMasterArticle", { id: articleId }, { status, updatedAt: new Date() });
}

export interface ArticleDetail extends ArticleSummary { versionsFull: { id: string; level: Level; lexile: number; body: string; wordCount: number; questions: { id: string; stem: string; status: string }[] }[]; results: { student: string; level: Level; correct: number; total: number; lexileBefore: number; lexileAfter: number; at: string }[] }

export async function articleDetail(repo: Repo, actor: Actor, articleId: string): Promise<ArticleDetail> {
  assertCan(actor, "questions:read"); staff(actor);
  const a = await articleInSchool(repo, actor, articleId);
  const summary = (await listArticles(repo, actor, Number(a.gradeLevel))).find((x) => x.id === articleId)!;
  const vers = await repo.findMany("ReadMasterVersion", { articleId });
  const links = vers.length ? await repo.findMany("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }) : [];
  const qs = links.length ? await repo.findMany("Question", { id: { in: links.map((l) => l.questionId) } }, { select: ["id", "stem", "status"] }) : [];
  const atts = (await repo.findMany("ReadMasterAttempt", { articleId })).sort((x, y) => s(y.createdAt instanceof Date ? y.createdAt.toISOString() : y.createdAt).localeCompare(s(x.createdAt instanceof Date ? x.createdAt.toISOString() : x.createdAt)));
  const studs = atts.length ? await repo.findMany("Student", { id: { in: [...new Set(atts.map((x) => x.studentId))] } }, { select: ["id", "userId"] }) : [];
  const users = studs.length ? await repo.findMany("User", { id: { in: studs.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  return {
    ...summary,
    versionsFull: LEVELS.map((l) => vers.find((v) => v.level === l)).filter((v): v is Row => Boolean(v)).map((v) => ({
      id: s(v.id), level: s(v.level) as Level, lexile: Number(v.lexile), body: s(v.body), wordCount: Number(v.wordCount),
      questions: links.filter((k) => k.versionId === v.id).sort((x, y) => Number(x.order) - Number(y.order)).map((k) => qs.find((q) => q.id === k.questionId)).filter((q): q is Row => Boolean(q)).map((q) => ({ id: s(q.id), stem: s(q.stem), status: s(q.status) })),
    })),
    results: atts.slice(0, 200).map((x) => ({ student: s(users.find((u) => u.id === studs.find((st) => st.id === x.studentId)?.userId)?.displayName ?? "Student"), level: s(x.level) as Level, correct: Number(x.correct), total: Number(x.total), lexileBefore: Number(x.lexileBefore), lexileAfter: Number(x.lexileAfter), at: s(x.createdAt instanceof Date ? x.createdAt.toISOString() : x.createdAt).slice(0, 10) })),
  };
}

// ------------------------------------------------------------------ students

async function studentInfo(repo: Repo, studentId: string): Promise<{ grade: number; schoolId: string }> {
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  return { grade: Number(g?.level ?? 0), schoolId: s(st?.schoolId) };
}

/** The student's reading Lexile: saved one, else from MAP, else the middle of their grade's On Level band. */
export async function readingLexile(repo: Repo, studentId: string): Promise<{ lexile: number; source: string }> {
  const saved = await repo.findUnique("StudentReadingLexile", { studentId });
  if (saved) return { lexile: Number(saved.lexile), source: s(saved.source) };
  const map = (await repo.findMany("MapResult", { studentId })).filter((r) => r.lexile !== null && r.lexile !== undefined).sort((a, b) => new Date(s(b.testDate instanceof Date ? b.testDate.toISOString() : b.testDate)).getTime() - new Date(s(a.testDate instanceof Date ? a.testDate.toISOString() : a.testDate)).getTime())[0];
  if (map) return { lexile: Number(map.lexile), source: "MAP" };
  const { grade, schoolId } = await studentInfo(repo, studentId);
  const band = (await lexileBands(repo, schoolId))[grade];
  return { lexile: band ? Math.round((band.onMin + band.onMax) / 2) : 700, source: "START" };
}

export interface StudentArticle { id: string; title: string; topic: string | null; skill: string | null; done: { correct: number; total: number; level: Level } | null }
export async function studentArticles(repo: Repo, actor: Actor): Promise<{ lexile: number; level: Level | null; source: string; articles: StudentArticle[] }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students read ReadMaster articles.");
  const { grade, schoolId } = await studentInfo(repo, actor.studentId);
  const lx = await readingLexile(repo, actor.studentId);
  const level = levelForLexile((await lexileBands(repo, schoolId))[grade], lx.lexile);
  const arts = (await repo.findMany("ReadMasterArticle", { schoolId, gradeLevel: grade, status: "PUBLISHED" })).sort((a, b) => s(a.title).localeCompare(s(b.title)));
  const atts = arts.length ? await repo.findMany("ReadMasterAttempt", { studentId: actor.studentId, articleId: { in: arts.map((a) => a.id) } }) : [];
  return { lexile: lx.lexile, level, source: lx.source, articles: arts.map((a) => { const d = atts.find((x) => x.articleId === a.id); return { id: s(a.id), title: s(a.title), topic: a.topic ? s(a.topic) : null, skill: a.skillName ? s(a.skillName) : null, done: d ? { correct: Number(d.correct), total: Number(d.total), level: s(d.level) as Level } : null }; }) };
}

/** The version a student reads now: their Lexile's level; if that version is missing, the nearest one. */
async function pickVersion(repo: Repo, studentId: string, articleId: string): Promise<{ version: Row; lexile: number }> {
  const { grade, schoolId } = await studentInfo(repo, studentId);
  const lx = await readingLexile(repo, studentId);
  const want = levelForLexile((await lexileBands(repo, schoolId))[grade], lx.lexile) ?? "ON";
  const vers = await repo.findMany("ReadMasterVersion", { articleId });
  const withQ = vers.length ? new Set((await repo.findMany("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }, { select: ["versionId"] })).map((x) => s(x.versionId))) : new Set<string>();
  const usable = vers.filter((v) => withQ.has(s(v.id)));
  const order: Record<Level, Level[]> = { BELOW: ["BELOW", "ON", "ABOVE"], ON: ["ON", "BELOW", "ABOVE"], ABOVE: ["ABOVE", "ON", "BELOW"] };
  const version = order[want].map((l) => usable.find((v) => v.level === l)).find(Boolean);
  if (!version) throw new ValidationError("This article has no questions yet.");
  return { version, lexile: lx.lexile };
}

export interface OpenArticle { articleId: string; title: string; skill: string | null; versionId: string; level: Level; lexile: number; studentLexile: number; body: string; questions: ClientQuestion[]; done: boolean }
export async function openArticle(repo: Repo, actor: Actor, articleId: string): Promise<OpenArticle> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students read ReadMaster articles.");
  const a = await repo.findUnique("ReadMasterArticle", { id: articleId });
  const { grade, schoolId } = await studentInfo(repo, actor.studentId);
  if (!a || a.schoolId !== schoolId || Number(a.gradeLevel) !== grade || a.status !== "PUBLISHED") throw new ForbiddenError("This article is not available.");
  const done = (await repo.findMany("ReadMasterAttempt", { studentId: actor.studentId, articleId })).length > 0;
  const { version, lexile } = await pickVersion(repo, actor.studentId, articleId);
  const links = (await repo.findMany("ReadMasterQuestion", { versionId: version.id })).sort((x, y) => Number(x.order) - Number(y.order));
  const items = await loadQuestionItems(repo, links.map((l) => s(l.questionId)));
  return { articleId, title: s(a.title), skill: a.skillName ? s(a.skillName) : null, versionId: s(version.id), level: s(version.level) as Level, lexile: Number(version.lexile), studentLexile: lexile, body: s(version.body), questions: items.map((i) => toClientQuestion(i, `${articleId}:${i.questionId}`)), done };
}

export interface ArticleResult { correct: number; total: number; pct: number; lexileBefore: number; lexileAfter: number; levelBefore: Level | null; levelAfter: Level | null; review: { questionId: string; correct: boolean; correctAnswer: string; why: string }[] }

/** Scores the article once; moves the student's reading Lexile (75%+ up, under 50% down). */
export async function submitArticle(repo: Repo, actor: Actor, articleId: string, versionId: string, responses: Record<string, unknown>, now = new Date()): Promise<ArticleResult> {
  const open = await openArticle(repo, actor, articleId);
  if (open.done) throw new ValidationError("You already finished this article.");
  if (open.versionId !== versionId) throw new ValidationError("Your reading level changed: open the article again.");
  const ids = open.questions.map((q) => q.questionId);
  const items = await loadQuestionItems(repo, ids);
  const review = items.map((it) => {
    let ok = false;
    try { ok = scoreResponse(it as never, normalizeResponse(it, responses[it.questionId])) >= 1; } catch { ok = false; }
    return { questionId: it.questionId, correct: ok, correctAnswer: correctAnswerText(it), why: it.explanation.whyCorrect };
  });
  const correct = review.filter((r) => r.correct).length, total = review.length;
  const pct = total ? Math.round((100 * correct) / total) : 0;
  const before = open.studentLexile;
  const after = Math.max(RULES.min, Math.min(RULES.max, before + (pct >= RULES.up ? RULES.step : pct < RULES.down ? -RULES.step : 0)));
  const { grade, schoolId } = await studentInfo(repo, actor.studentId!);
  const band = (await lexileBands(repo, schoolId))[grade];
  await repo.create("ReadMasterAttempt", { studentId: actor.studentId, articleId, versionId, level: open.level, lexileBefore: before, lexileAfter: after, correct, total, createdAt: now });
  await repo.upsert("StudentReadingLexile", { studentId: actor.studentId }, { lexile: after, source: "READMASTER", updatedAt: now }, { lexile: after, source: "READMASTER", updatedAt: now });
  return { correct, total, pct, lexileBefore: before, lexileAfter: after, levelBefore: levelForLexile(band, before), levelAfter: levelForLexile(band, after), review };
}
