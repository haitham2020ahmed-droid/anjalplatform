/**
 * ⭐ ReadMaster: the same article (topic + skill) in three reading levels, Achieve3000-style.
 *   - Each version (Below / On / Above Level) has its own text and Lexile; its questions are regular
 *     questions, so they are also in the Question Bank.
 *   - Every student has a reading Lexile: it starts from MAP (else the middle of their grade's On Level band)
 *     and moves after every article: 75%+ correct → +30L, under 50% → −30L (Achieve3000 uses 75% as the
 *     benchmark). The version shown is the one whose level matches the student's Lexile (grade Lexile bands);
 *     crossing a band edge moves them to the next version — real adaptivity between versions.
 */
import { runAfterResponse } from "../lib/after-response";
import { safeFeed } from "../practice/skill-evidence";
import { isRapidGuess } from "../../adaptive/evidence";
import { DEFAULT_ADAPTIVE } from "../../config/engine";
import { masterSkills } from "../skills/master";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, can, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { createDraft } from "../admin/questions";
import { attachmentNodes } from "../curriculum-map/questions";
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
  // 🧩 the master skills list
  return (await masterSkills(repo, schoolId, { grade })).map((k) => ({ id: k.id, name: k.name }));
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
export async function addVersionQuestion(repo: Repo, actor: Actor, versionId: string, q: { type?: string; stem: string; standardCode?: string | null; mapNodeCode?: string | null; options?: { label: string; text: string; correct: boolean; rationale?: string | null }[]; answer?: boolean; answers?: string[]; whyCorrect: string }): Promise<string> {
  assertCan(actor, "questions:edit"); staff(actor);
  const v = await repo.findUnique("ReadMasterVersion", { id: versionId });
  if (!v) throw new ForbiddenError("Version not found.");
  const a = await articleInSchool(repo, actor, s(v.articleId));
  const skillId = a.skillId ? s(a.skillId) : await unclassifiedSkillId(repo, actor.schoolId!, Number(a.gradeLevel));
  const id = await createDraft(repo, actor, {
    skillId, type: (q.type ?? "MULTIPLE_CHOICE") as never, stem: q.stem, level: DIFFICULTY[s(v.level) as Level], whyCorrect: q.whyCorrect,
    options: q.options?.map((o) => ({ label: o.label, text: o.text, correct: o.correct, rationale: o.correct ? null : o.rationale || "Read the text again." })),
    answer: q.answer, answers: q.answers, passageText: s(v.body), lexile: Number(v.lexile),
    // the question's own standard when given (e.g. vocabulary L.4.4.a in a reading article), else the article's
    ...(q.standardCode ? { standardCode: q.standardCode } : a.standardCode ? { standardCode: s(a.standardCode) } : {}),   // the full code (as stored in Standard)
    // its Curriculum Map place (e.g. G4.U1.TS1.ACS.ON): ReadMaster questions then serve the map's adaptive sets,
    // plans and the Diagnostic too. An article coded RM-G4-U1-TS1 is placed on its Text Set automatically.
    ...(q.mapNodeCode ? { mapNodeCode: q.mapNodeCode } : await (async () => { const code = await readMasterPlace(repo, s(actor.schoolId), s(a.code), s(v.level) as Level, q.standardCode ?? (a.standardCode ? s(a.standardCode) : null)); return code ? { mapNodeCode: code } : {}; })()),
  });
  // admins publish; a teacher's question waits for an admin's approval
  if (can(actor, "questions:publish")) await repo.updateMany("Question", { id }, { status: "PUBLISHED", publishedAt: new Date(), reviewedById: actor.userId });
  else await repo.updateMany("Question", { id }, { status: "UNDER_REVIEW" });
  const n = await repo.count("ReadMasterQuestion", { versionId });
  await repo.create("ReadMasterQuestion", { versionId, questionId: id, order: n });
  // 🧭 an article without a skill: its question gets one from the map place / the article's skill name (Update 39C)
  if (!a.skillId) { const { remapNewQuestions } = await import("../curriculum-map/remap-skills"); await remapNewQuestions(repo, actor.schoolId!, [id], actor.userId).catch(() => 0); }
  return id;
}

export async function setArticleStatus(repo: Repo, actor: Actor, articleId: string, status: "DRAFT" | "PUBLISHED"): Promise<void> {
  // DRAFT · REVIEW (a teacher asked an admin to publish) · PUBLISHED
  assertCan(actor, "questions:edit"); staff(actor);
  // making an article live for students is publishing: a teacher with only edit rights cannot
  if (status === "PUBLISHED") assertCan(actor, "questions:publish");
  await articleInSchool(repo, actor, articleId);
  if (status === "PUBLISHED") {
    const vers = await repo.findMany("ReadMasterVersion", { articleId });
    const withQ = vers.length ? new Set((await repo.findMany("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }, { select: ["versionId"] })).map((x) => s(x.versionId))) : new Set<string>();
    if (!vers.some((v) => withQ.has(s(v.id)))) throw new ValidationError("Add at least one version with questions before publishing.");
  }
  await repo.updateMany("ReadMasterArticle", { id: articleId }, { status, updatedAt: new Date() });
}

/** Publishes (or moves back to draft) several articles at once; an article without questions is skipped and named. */
export async function setArticlesStatus(repo: Repo, actor: Actor, articleIds: string[], status: "DRAFT" | "PUBLISHED"): Promise<{ changed: number; skipped: string[] }> {
  assertCan(actor, "questions:edit"); staff(actor);
  if (status === "PUBLISHED") assertCan(actor, "questions:publish");
  const ids = [...new Set(articleIds.filter(Boolean))];
  if (!ids.length) throw new ValidationError("Tick at least one article first.");
  let changed = 0; const skipped: string[] = [];
  for (const id of ids) {
    try { await setArticleStatus(repo, actor, id, status); changed++; }
    catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      const a = await repo.findUnique("ReadMasterArticle", { id });
      skipped.push(a ? s(a.title) : id);
    }
  }
  return { changed, skipped };
}

export const REVIEW_NOTICE = "📚 ReadMaster articles ready for review";

/**
 * 📝 A teacher (questions:edit, not questions:publish) marks articles "Ready for review": an admin publishes them.
 * Articles need questions first (as for publishing); published ones stay published. The school admins get one
 * notification, not one per click (no new one while the last is unread).
 */
export async function requestArticleReview(repo: Repo, actor: Actor, articleIds: string[], now = new Date()): Promise<{ changed: number; skipped: string[]; notified: number }> {
  assertCan(actor, "questions:edit"); staff(actor);
  const ids = [...new Set(articleIds.filter(Boolean))];
  if (!ids.length) throw new ValidationError("Tick at least one article first.");
  let changed = 0; const skipped: string[] = [], titles: string[] = []; let grade = 4;
  for (const id of ids) {
    const a = await articleInSchool(repo, actor, id);
    if (s(a.status) === "PUBLISHED" || s(a.status) === "REVIEW") continue;
    const vers = await repo.findMany("ReadMasterVersion", { articleId: id }, { select: ["id"] });
    const n = vers.length ? await repo.count("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }) : 0;
    if (!n) { skipped.push(s(a.title)); continue; }
    await repo.updateMany("ReadMasterArticle", { id }, { status: "REVIEW", updatedAt: now });
    changed++; titles.push(s(a.title)); grade = Number(a.gradeLevel) || grade;
  }
  let notified = 0;
  if (changed) {
    const who = s((await repo.findUnique("User", { id: actor.userId }))?.displayName) || "A teacher";
    const admins = await repo.findMany("User", { schoolId: actor.schoolId, role: "SCHOOL_ADMIN", isActive: true }, { select: ["id"] });
    for (const u of admins) {
      if (u.id === actor.userId) continue;
      if ((await repo.findMany("Notification", { userId: u.id, title: REVIEW_NOTICE, readAt: null }, { select: ["id"] })).length) continue;
      await repo.create("Notification", { userId: u.id, type: "REPORT_APPROVAL", title: REVIEW_NOTICE, body: `${who} marked ${changed} article${changed === 1 ? "" : "s"} ready for review: ${titles.slice(0, 5).join(", ")}${titles.length > 5 ? "…" : ""}. Open ReadMaster to read and publish them.`, link: `/admin/readmaster?grade=${grade}`, readAt: null, createdAt: now });
      notified++;
    }
  }
  return { changed, skipped, notified };
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

// ------------------------------------------------------------------ the shared ReadMaster page (students, teachers, admin)

/** Below < On < Above: a version counts toward the student's level only when read at their own level or higher. */
export const LEVEL_RANK: Record<Level, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
/** Reading time on the cards: words of the On version ÷ 120 words a minute (at least 1 minute). */
export const READ_WPM = 120;
export const readingMinutes = (wordCount: number) => Math.max(1, Math.ceil((Number(wordCount) || 0) / READ_WPM));
const isStaffActor = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
/** Unit number from the article code (RM-G4-U1-TS1 → 1); null = no unit ("Other"). */
export const unitOfCode = (code: string): number | null => { const m = s(code).toUpperCase().match(/^RM-G\d+-U(\d+)/); return m ? Number(m[1]) : null; };

/** The school of whoever opens ReadMaster (a student's own school; staff: their school). Parents cannot. */
async function readerOf(repo: Repo, actor: Actor): Promise<{ schoolId: string; student: { id: string; grade: number } | null }> {
  if (actor.role === "STUDENT" && actor.studentId) { const i = await studentInfo(repo, actor.studentId); return { schoolId: i.schoolId, student: { id: actor.studentId, grade: i.grade } }; }
  if (isStaffActor(actor) && actor.schoolId) return { schoolId: actor.schoolId, student: null };
  throw new ForbiddenError("Only students and staff read ReadMaster articles.");
}

export interface RmCard { id: string; title: string; topic: string | null; skill: string | null; minutes: number; done: { correct: number; total: number; pct: number; level: Level; practice: boolean } | null }
export interface RmUnit { unit: number | null; title: string; articles: RmCard[] }
export interface ReadMasterHome { viewer: "STUDENT" | "STAFF"; canManage: boolean; grades: number[]; grade: number | null; myGrade: number | null; lexile: number | null; level: Level | null; units: RmUnit[] }

/**
 * ⭐ The one ReadMaster page (students, teachers and admin see the same view): a tab per grade that has published
 * articles (a new grade appears by itself), the student's own grade first (staff: their class's grade, else the
 * first); the grade's articles grouped by Unit (from the code RM-G4-U1-…, else "Other"); each card with the skill,
 * the reading time and — for a student — ✓ + score when already read. Every published article of the school is open
 * to every student: no assignment needed.
 */
export async function readMasterHome(repo: Repo, actor: Actor, opts: { grade?: number | null } = {}): Promise<ReadMasterHome> {
  const { schoolId, student } = await readerOf(repo, actor);
  const published = await repo.findMany("ReadMasterArticle", { schoolId, status: "PUBLISHED" }, { select: ["id", "code", "title", "topic", "gradeLevel", "skillName"] });
  const grades = [...new Set(published.map((a) => Number(a.gradeLevel)).filter((g) => Number.isFinite(g) && g > 0))].sort((a, b) => a - b);
  let myGrade: number | null = student ? student.grade : null;
  if (!student && actor.role === "TEACHER") {
    const { readableClasses } = await import("../teacher/coordinators");
    const own = (await readableClasses(repo, actor))[0];
    const g = own?.gradeId ? await repo.findUnique("Grade", { id: own.gradeId }) : null;
    myGrade = g ? Number(g.level) : null;
  }
  const want = Number(opts.grade);
  const grade = grades.includes(want) ? want : myGrade !== null && grades.includes(myGrade) ? myGrade : grades[0] ?? null;
  const arts = published.filter((a) => Number(a.gradeLevel) === grade);
  const ids = arts.map((a) => s(a.id));
  const [vers, atts, lx, bands, gradeRow] = await Promise.all([
    ids.length ? repo.findMany("ReadMasterVersion", { articleId: { in: ids } }, { select: ["articleId", "level", "wordCount"] }) : Promise.resolve([] as Row[]),
    student && ids.length ? repo.findMany("ReadMasterAttempt", { studentId: student.id, articleId: { in: ids } }, { select: ["articleId", "level", "correct", "total", "practice", "createdAt"] }) : Promise.resolve([] as Row[]),
    student ? readingLexile(repo, student.id) : Promise.resolve(null),
    lexileBands(repo, schoolId),
    grade !== null ? repo.findMany("Grade", { schoolId, level: grade }, { select: ["id"] }).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  // unit names from the Curriculum Map (G4.U1 → its title); "Unit n" when the map has none
  const unitNodes = gradeRow ? await repo.findMany("CurriculumMapNode", { gradeId: gradeRow.id, kind: "UNIT" }, { select: ["number", "title"] }) : [];
  const cards = arts.map((a) => {
    const mine = vers.filter((v) => v.articleId === a.id);
    const on = mine.find((v) => v.level === "ON") ?? mine[0];
    const tries = atts.filter((x) => x.articleId === a.id);
    const counted = tries.filter((x) => !x.practice);
    const pick = counted.length ? counted[counted.length - 1] : tries.sort((x, y) => Number(y.correct) / Math.max(1, Number(y.total)) - Number(x.correct) / Math.max(1, Number(x.total)))[0];
    const card: RmCard = {
      id: s(a.id), title: s(a.title), topic: a.topic ? s(a.topic) : null, skill: a.skillName ? s(a.skillName) : null, minutes: readingMinutes(Number(on?.wordCount ?? 0)),
      done: pick ? { correct: Number(pick.correct), total: Number(pick.total), pct: Number(pick.total) ? Math.round((100 * Number(pick.correct)) / Number(pick.total)) : 0, level: s(pick.level) as Level, practice: !counted.length } : null,
    };
    return { unit: unitOfCode(s(a.code)), code: s(a.code), card };
  });
  const byUnit = new Map<number | null, typeof cards>();
  for (const c of cards) byUnit.set(c.unit, [...(byUnit.get(c.unit) ?? []), c]);
  const units: RmUnit[] = [...byUnit].sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b)).map(([unit, list]) => {
    const node = unit === null ? null : unitNodes.find((n) => Number(n.number) === unit);
    const t = node ? s(node.title).trim() : "";
    return { unit, title: unit === null ? "Other" : t && t.toLowerCase() !== `unit ${unit}` ? t : `Unit ${unit}`, articles: list.sort((x, y) => x.code.localeCompare(y.code) || x.card.title.localeCompare(y.card.title)).map((x) => x.card) };
  });
  return {
    viewer: student ? "STUDENT" : "STAFF", canManage: actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN", grades, grade, myGrade,
    lexile: lx ? lx.lexile : null, level: lx && grade !== null ? levelForLexile(bands[grade], lx.lexile) : null, units,
  };
}

/**
 * The versions of an article and the reader's own one: a student's own level = their reading Lexile's level in the
 * ARTICLE's grade band (so a Grade 4 reader opening a Grade 5 article starts at its Below version); a missing version
 * → the nearest one with questions. Staff open the On version.
 */
async function articleVersions(repo: Repo, articleId: string, grade: number, schoolId: string, studentId: string | null): Promise<{ usable: Row[]; own: Row; lexile: number | null }> {
  const [vers, lx, bands] = await Promise.all([repo.findMany("ReadMasterVersion", { articleId }), studentId ? readingLexile(repo, studentId) : Promise.resolve(null), lexileBands(repo, schoolId)]);
  const withQ = vers.length ? new Set((await repo.findMany("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }, { select: ["versionId"] })).map((x) => s(x.versionId))) : new Set<string>();
  const want: Level = lx ? levelForLexile(bands[grade], lx.lexile) ?? "ON" : "ON";
  const usable = LEVELS.map((l) => vers.find((v) => v.level === l && withQ.has(s(v.id)))).filter((v): v is Row => Boolean(v));
  const order: Record<Level, Level[]> = { BELOW: ["BELOW", "ON", "ABOVE"], ON: ["ON", "BELOW", "ABOVE"], ABOVE: ["ABOVE", "ON", "BELOW"] };
  const own = order[want].map((l) => usable.find((v) => v.level === l)).find(Boolean);
  if (!own) throw new ValidationError("This article has no questions yet.");
  return { usable, own, lexile: lx ? lx.lexile : null };
}

export interface OpenArticle {
  articleId: string; title: string; skill: string | null; grade: number; versionId: string; level: Level; lexile: number; studentLexile: number; body: string; questions: ClientQuestion[]; done: boolean;
  /** the reader's own level for this article (staff: On) and every version they can switch to */
  ownLevel: Level; levels: { level: Level; lexile: number; minutes: number }[];
  /** true = this version is below the student's own level: a practice read that does not change their level */
  practice: boolean; viewer: "STUDENT" | "STAFF"; minutes: number;
  /** the counted result when the student already finished the article */
  result: { correct: number; total: number; level: Level } | null;
}
export async function openArticle(repo: Repo, actor: Actor, articleId: string, opts: { level?: string | null } = {}): Promise<OpenArticle> {
  return (await openArticleItems(repo, actor, articleId, opts)).open;
}
/** The open article and its question items (the answer reuses them instead of loading them again). */
async function openArticleItems(repo: Repo, actor: Actor, articleId: string, opts: { level?: string | null } = {}): Promise<{ open: OpenArticle; items: Awaited<ReturnType<typeof loadQuestionItems>>; info: { grade: number; schoolId: string } }> {
  const { schoolId, student } = await readerOf(repo, actor);
  const [a, mine] = await Promise.all([
    repo.findUnique("ReadMasterArticle", { id: articleId }),
    student ? repo.findMany("ReadMasterAttempt", { studentId: student.id, articleId }, { select: ["id", "level", "correct", "total", "practice", "createdAt"] }) : Promise.resolve([] as Row[]),
  ]);
  // every published article of the school is open to every student of it (any grade): no assignment needed
  if (!a || a.schoolId !== schoolId || a.status !== "PUBLISHED") throw new ForbiddenError("This article is not available.");
  const grade = Number(a.gradeLevel);
  const counted = mine.filter((x) => !x.practice);
  const done = counted.length > 0;
  const { usable, own, lexile } = await articleVersions(repo, articleId, grade, schoolId, student?.id ?? null);
  const chosen = usable.find((v) => v.level === s(opts.level).toUpperCase()) ?? own;
  const links = (await repo.findMany("ReadMasterQuestion", { versionId: chosen.id })).sort((x, y) => Number(x.order) - Number(y.order));
  const items = await loadQuestionItems(repo, links.map((l) => s(l.questionId)));
  const last = counted[counted.length - 1];
  const open: OpenArticle = {
    articleId, title: s(a.title), skill: a.skillName ? s(a.skillName) : null, grade, versionId: s(chosen.id), level: s(chosen.level) as Level, lexile: Number(chosen.lexile),
    studentLexile: lexile ?? Number(chosen.lexile), body: s(chosen.body), questions: items.map((i) => toClientQuestion(i, `${articleId}:${i.questionId}`)), done,
    ownLevel: s(own.level) as Level, levels: usable.map((v) => ({ level: s(v.level) as Level, lexile: Number(v.lexile), minutes: readingMinutes(Number(v.wordCount)) })),
    practice: Boolean(student) && LEVEL_RANK[s(chosen.level) as Level] < LEVEL_RANK[s(own.level) as Level], viewer: student ? "STUDENT" : "STAFF", minutes: readingMinutes(Number(chosen.wordCount)),
    result: last ? { correct: Number(last.correct), total: Number(last.total), level: s(last.level) as Level } : null,
  };
  return { open, items, info: { grade, schoolId } };
}

export interface ArticleResult { correct: number; total: number; pct: number; lexileBefore: number; lexileAfter: number; levelBefore: Level | null; levelAfter: Level | null; practice: boolean; review: { questionId: string; correct: boolean; correctAnswer: string; why: string }[] }

/** Scores the article once; moves the student's reading Lexile (75%+ up, under 50% down). */
/** Times the page measured (Update 39C): whole article and per question (ms from the previous answer, the first one
 *  from opening the article). Untrusted input: only finite numbers are kept, each capped. */
export interface ArticleTiming { elapsedMs?: unknown; perQuestion?: unknown }
export function cleanTiming(t: ArticleTiming | null | undefined, questionIds: string[]): { seconds: number | null; perQuestion: Map<string, number> } {
  const per = new Map<string, number>();
  const raw = t && typeof t.perQuestion === "object" && t.perQuestion !== null ? (t.perQuestion as Record<string, unknown>) : {};
  for (const id of questionIds) { const v = Number(raw[id]); if (Number.isFinite(v) && v >= 0) per.set(id, Math.min(30 * 60_000, Math.round(v))); }
  const e = Number(t?.elapsedMs);
  return { seconds: Number.isFinite(e) && e > 0 ? Math.min(3 * 3600, Math.round(e / 1000)) : null, perQuestion: per };
}

/**
 * Scores one read of the version the student chose. Counting rule (ReadMaster page update): a read at the student's
 * own level or higher COUNTS — it moves the reading Lexile (75%+ up 30L, under 50% down 30L) and feeds skill mastery
 * (Update 39B). A read at a LOWER level is Practice: it is saved and shown, but nothing about the level or mastery
 * changes. An article counts once; practice reads before that are allowed.
 */
export async function submitArticle(repo: Repo, actor: Actor, articleId: string, versionId: string, responses: Record<string, unknown>, now = new Date(), timing?: ArticleTiming | null): Promise<ArticleResult> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students answer ReadMaster articles.");
  const v = await repo.findUnique("ReadMasterVersion", { id: versionId });
  const { open, items: openItems, info } = await openArticleItems(repo, actor, articleId, { level: v && s(v.articleId) === articleId ? s(v.level) : null });
  if (open.done) throw new ValidationError("You already finished this article.");
  if (open.versionId !== versionId) throw new ValidationError("This reading level is not available: open the article again.");
  const ids = open.questions.map((q) => q.questionId);
  const items = openItems;
  const review = items.map((it) => {
    let ok = false;
    try { ok = scoreResponse(it as never, normalizeResponse(it, responses[it.questionId])) >= 1; } catch { ok = false; }
    return { questionId: it.questionId, correct: ok, correctAnswer: correctAnswerText(it), why: it.explanation.whyCorrect };
  });
  const correct = review.filter((r) => r.correct).length, total = review.length;
  const pct = total ? Math.round((100 * correct) / total) : 0;
  const practice = open.practice;
  const before = open.studentLexile;
  const after = practice ? before : Math.max(RULES.min, Math.min(RULES.max, before + (pct >= RULES.up ? RULES.step : pct < RULES.down ? -RULES.step : 0)));
  const { grade, schoolId } = info;
  const band = (await lexileBands(repo, schoolId))[grade];
  // per-question time (Update 39C): a real time makes rapid-guess detection work for ReadMaster answers too
  const tm = cleanTiming(timing, ids);
  const timed = tm.perQuestion.size === items.length && items.length > 0;
  const msOf = (it: (typeof items)[number]) => tm.perQuestion.get(it.questionId) ?? Math.max(1, Number(it.estimatedSeconds) || 45) * 1000;
  const rapid = timed ? items.filter((it) => isRapidGuess({ responseMs: msOf(it), estimatedSeconds: Number(it.estimatedSeconds) || 45 }, DEFAULT_ADAPTIVE)).length : null;
  await repo.create("ReadMasterAttempt", { studentId: actor.studentId, articleId, versionId, level: open.level, lexileBefore: before, lexileAfter: after, correct, total, seconds: tm.seconds, rapid, practice, createdAt: now });
  const result: ArticleResult = { correct, total, pct, lexileBefore: before, lexileAfter: after, levelBefore: levelForLexile(band, before), levelAfter: levelForLexile(band, after), practice, review };
  // 🧪 Practice (a lower level than the student's own): saved above, no level or mastery change
  if (practice) return result;
  await repo.upsert("StudentReadingLexile", { studentId: actor.studentId }, { lexile: after, source: "READMASTER", updatedAt: now }, { lexile: after, source: "READMASTER", updatedAt: now });
  // 🔗 the article's questions are bank questions: each answer goes through the engine like practice (source
  // READMASTER), so the skills they measure learn from the article (Update 39B) — after the response (Update 42B):
  // the article's result and the new Lexile are saved above
  runAfterResponse("readmaster.skill_feed", () => safeFeed("readmaster", async () => {
    const { recordEngineAttempt } = await import("../lessons/run");
    const ses = await repo.create("PracticeSession", { studentId: actor.studentId, mode: "ADAPTIVE_PRACTICE", startedAt: now, endedAt: now, endReason: "READMASTER", questionCount: items.length, correctCount: correct });
    for (const it of items) {
      if (!it.skillKey) continue;
      let credit = 0;
      try { credit = scoreResponse(it as never, normalizeResponse(it, responses[it.questionId])); } catch { credit = 0; }
      await recordEngineAttempt(repo, { sessionId: s(ses.id), studentId: actor.studentId!, skillId: s(it.skillKey), schoolId: schoolId ?? null, item: it, response: responses[it.questionId] ?? null, credit, usedHint: false, responseMs: msOf(it), now, reasonCode: "READMASTER", reason: "ReadMaster article answer: ability and mastery updated.", source: "READMASTER" });
    }
  }));
  return result;
}

/**
 * The Curriculum Map place of a ReadMaster question: the article's Text Set (code RM-G4-U1-TS1 → G4.U1.TS1), its
 * Concept Vocabulary place for vocabulary standards (RL/RI.x.4, L.x.4–6), else Analyze Craft and Structure at the
 * version's level. Null when the article is not coded for a Text Set or the place does not exist.
 */
export async function readMasterPlace(repo: Repo, schoolId: string, articleCode: string, level: Level, standardCode: string | null): Promise<string | null> {
  const m = articleCode.toUpperCase().match(/^RM-G(\d+)-U(\d+)-(TS|SEL)(\d+)/);
  if (!m) return null;
  const section = `G${m[1]}.U${m[2]}.${m[3]}${m[4]}`;
  const std = s(standardCode).replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase();
  const vocab = /^(RL|RI)\.\d+\.4|^L\.\d+\.[456]/.test(std);
  const nodes = (await attachmentNodes(repo, schoolId)).filter((n) => n.code.startsWith(`${section}.`));
  const cv = nodes.find((n) => n.code === `${section}.CV` || (n.category === "CONCEPT_VOCABULARY" && !n.level));
  const acs = nodes.find((n) => n.code === `${section}.ACS.${level}`);
  return (vocab && cv ? cv.code : acs?.code ?? cv?.code) ?? null;
}

/** 🔗 Places every ReadMaster question that is not on the Curriculum Map yet (articles coded for a Text Set). */
export async function linkReadMasterToMap(repo: Repo, actor: Actor): Promise<{ linked: number; articles: number }> {
  assertCan(actor, "questions:edit"); staff(actor);
  const schoolId = s(actor.schoolId);
  const arts = (await repo.findMany("ReadMasterArticle", { schoolId })).filter((x) => /^RM-G\d+-U\d+-(TS|SEL)\d+/i.test(s(x.code)));
  const nodes = await attachmentNodes(repo, schoolId);
  const idOf = new Map(nodes.map((n) => [n.code, n.id]));
  let linked = 0, touched = 0;
  for (const a of arts) {
    const vers = await repo.findMany("ReadMasterVersion", { articleId: a.id });
    const links = vers.length ? await repo.findMany("ReadMasterQuestion", { versionId: { in: vers.map((v) => v.id) } }) : [];
    if (!links.length) continue;
    const already = new Set((await repo.findMany("QuestionMapLink", { questionId: { in: links.map((l) => s(l.questionId)) } }, { select: ["questionId"] })).map((x) => s(x.questionId)));
    const qs = await repo.findMany("Question", { id: { in: links.map((l) => s(l.questionId)) } }, { select: ["id", "standardId"] });
    const stds = await repo.findMany("Standard", { id: { in: [...new Set(qs.map((q) => s(q.standardId)).filter(Boolean))] } }, { select: ["id", "code"] });
    let any = false;
    for (const l of links) {
      if (already.has(s(l.questionId))) continue;
      const v = vers.find((x) => x.id === l.versionId)!;
      const q = qs.find((x) => x.id === l.questionId);
      const code = await readMasterPlace(repo, schoolId, s(a.code), s(v.level) as Level, s(stds.find((x) => x.id === q?.standardId)?.code) || (a.standardCode ? s(a.standardCode) : null));
      const nodeId = code ? idOf.get(code) : null;
      if (!nodeId) continue;
      await repo.create("QuestionMapLink", { questionId: l.questionId, nodeId, createdById: actor.userId });
      linked++; any = true;
    }
    if (any) touched++;
  }
  return { linked, articles: touched };
}
