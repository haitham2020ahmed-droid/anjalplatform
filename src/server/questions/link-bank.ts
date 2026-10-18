/**
 * 🔗 UI reorg Phase 1 — link every question of the bank to its skill, MAP area and NAFS area.
 *
 * One pass, safe to run again (it only adds what is missing), never deletes a question:
 *   1. skill families without a MAP goal area: linked from the skill's own CCSS standard (deterministic); otherwise
 *      listed for review (kind FAMILY_MAP)
 *   2. skill families without a NAFS area: the NAFS rule (category / domain / MAP area / standards); otherwise
 *      listed for review (kind FAMILY_NAFS)
 *   3. questions on the hidden “Unclassified (Curriculum Map)” skill → their real skill, deterministic rules first:
 *        IMPORT_SKILL  the skill named in the import file, exactly (name or code; Grammar workbook skills too)
 *        TAGS          a skill named in the question's tags, exactly
 *        then the Update 39C rules (standard → skill, ReadMaster article skill, Curriculum Map place, Respond to
 *        Reading), and last the wording heuristic. A decision under LINK_CONFIDENCE is NOT applied: it is filed as
 *        “needs review” (kind QUESTION) with the best guess and the reason.
 *   4. imported questions whose skill the import picked without being sure (tags.aiNeeds has “skill”) and questions
 *      on a switched-off skill: listed for review (they keep their skill until an admin decides)
 *   5. ReadRise question kinds → skill family (RR_SKILL_MAP); a kind with no family is listed (kind READRISE)
 * Every change writes an audit row. Reads are batched (300 questions at a time) for the 512 MB server.
 */
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { isHiddenSkill } from "../skills/master";
import { applyRemap, ensureConceptVocabularySkills, planRemap, type RemapItem } from "../curriculum-map/remap-skills";
import { RR_SKILL_MAP } from "../practice/skill-evidence";
import { fileReview, LINK_CONFIDENCE, schoolFamilies, seedNafsLinks, settleReview, type NafsSeedResult } from "../nafs/nafs-links";
import { schoolSkillIndex } from "./skill-questions";

const s = (v: unknown) => String(v ?? "");
const on = (v: unknown) => v !== false && v !== 0;
const BATCH = 300;
const parse = (v: unknown): Record<string, unknown> | null => { if (!v) return null; if (typeof v === "object") return v as Record<string, unknown>; try { return JSON.parse(s(v)); } catch { return null; } };
const norm = (x: string) => x.toLowerCase().replace(/[’`]/g, "'").replace(/&/g, " and ").replace(/[^a-z0-9.' ]+/g, " ").replace(/\s+/g, " ").trim();

/** Pages of rows (by id), or the given ids in chunks: never more than BATCH rows in memory at once. */
async function* pages(repo: Repo, model: string, where: Record<string, unknown>, select: string[], ids: string[] | null, size = BATCH): AsyncGenerator<Row[]> {
  if (ids) {
    for (let i = 0; i < ids.length; i += size) { const page = await repo.findMany(model, { ...where, id: { in: ids.slice(i, i + size) } }, { select }); if (page.length) yield page; }
    return;
  }
  let after = "";
  for (;;) {
    const page = await repo.findMany(model, { ...where, ...(after ? { id: { gt: after } } : {}) }, { select, orderBy: [{ field: "id", dir: "asc" }], take: size });
    if (!page.length) return;
    yield page;
    if (page.length < size) return;
    after = s(page[page.length - 1].id);
  }
}

export interface LinkDecision { questionId: string; grade: number; excerpt: string; fromSkill: string; toSkillId: string | null; toSkill: string | null; via: string | null; detail: string; confidence: number }
export interface LinkSummary {
  questions: number; onHiddenBefore: number; linked: number; byVia: Record<string, number>; needsReview: number; reviewByKind: Record<string, number>;
  familiesMapLinked: number; familiesMapReview: number; familiesNafsLinked: number; familiesNafsReview: number;
  importUnsure: number; switchedOffSkill: number; readRise: { questions: number; byKind: Record<string, { n: number; family: string | null }> };
  attemptsMoved: number; recomputed: number;
}
export interface LinkResult { apply: boolean; summary: LinkSummary; linked: LinkDecision[]; review: LinkDecision[]; mapFamilies: { family: string; area: string | null; how: string }[]; nafs: NafsSeedResult }

interface Ctx { gradeOf: Map<string, number>; skillById: Map<string, Row>; byGradeName: Map<string, Row[]> }
async function context(repo: Repo, schoolId: string): Promise<Ctx> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const ids = [...idx.ids], rows: Row[] = [];
  for (let i = 0; i < ids.length; i += 400) rows.push(...(await repo.findMany("Skill", { id: { in: ids.slice(i, i + 400) } }, { select: ["id", "code", "name", "isActive", "familyId"] })));
  const byGradeName = new Map<string, Row[]>();
  for (const k of rows) {
    if (isHiddenSkill(k.code) || !on(k.isActive)) continue;
    const g = idx.gradeOf.get(s(k.id)) ?? 0;
    for (const key of new Set([norm(s(k.name)), norm(s(k.code)), norm(s(k.code).replace(/^g\d+\./i, ""))])) { const l = byGradeName.get(`${g}|${key}`) ?? []; l.push(k); byGradeName.set(`${g}|${key}`, l); }
  }
  return { gradeOf: idx.gradeOf, skillById: new Map(rows.map((k) => [s(k.id), k])), byGradeName };
}
/** Exactly one skill of the grade with this name or code (any kind, Grammar workbook skills included). */
function exactSkill(ctx: Ctx, grade: number, text: unknown): Row | null {
  const t = norm(s(text));
  if (!t) return null;
  const l = ctx.byGradeName.get(`${grade}|${t}`) ?? [];
  const uniq = [...new Map(l.map((k) => [s(k.id), k])).values()];
  return uniq.length === 1 ? uniq[0] : null;
}

/** The skill an import file named for each question (ImportedQuestionLog → detected.meta.skillText). */
async function importSkillText(repo: Repo, questionIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!questionIds.length) return out;
  for (const l of await repo.findMany("ImportedQuestionLog", { questionId: { in: questionIds } }, { select: ["questionId", "detected"] })) {
    const d = parse(l.detected) as { meta?: { skillText?: string } } | null;
    if (d?.meta?.skillText) out.set(s(l.questionId), s(d.meta.skillText));
  }
  return out;
}

/** Skill families without a MAP goal area: from the skill's own standard (deterministic), else reviewed. */
async function linkMapFamilies(repo: Repo, schoolId: string, apply: boolean, actorId: string | null, now: Date): Promise<{ family: string; area: string | null; how: string }[]> {
  const { areaForStandard } = await import("../map/map-more");
  const out: { family: string; area: string | null; how: string }[] = [];
  const areas = await repo.findMany("MapGoalArea", {}, { select: ["id", "code", "name"] });
  for (const f of await schoolFamilies(repo, schoolId)) {
    if (f.mapArea) continue;
    const area = f.standards.map(areaForStandard).find(Boolean) ?? null;
    const row = area ? areas.find((a) => s(a.code) === area) : undefined;
    if (row) {
      out.push({ family: f.family, area, how: `the skill's standard ${f.standards[0]}` });
      if (apply) {
        await repo.updateMany("SkillFamily", { id: f.familyId }, { mapGoalAreaId: row.id });
        await audit(repo, { actorId, action: "map.link.auto", entityType: "SkillFamily", entityId: f.familyId, before: { mapGoalAreaId: null }, after: { area, via: "standard", standard: f.standards[0] }, at: now });
        await settleReview(repo, schoolId, "FAMILY_MAP", f.familyId, "APPROVED", actorId, now);
      }
    } else {
      out.push({ family: f.family, area: null, how: "no standard that names a MAP goal area" });
      if (apply) await fileReview(repo, { schoolId, kind: "FAMILY_MAP", subjectId: f.familyId, excerpt: `${f.family} (Grades ${f.grades.join(", ")})`, guessId: null, guessLabel: null, confidence: 0, reason: f.standards.length ? `its standards (${f.standards.slice(0, 3).join(", ")}) name no MAP goal area` : "the skill has no standard" }, now);
    }
  }
  return out;
}

export interface LinkOptions { apply?: boolean; actorId?: string | null; now?: Date; /** only these questions (new imports, edits) */ questionIds?: string[]; /** also link skill families (MAP / NAFS); default true */ families?: boolean; threshold?: number; /** cap the decision lists returned (memory) */ listCap?: number }

/** The link pass (dry run unless `apply`). */
export async function linkBank(repo: Repo, schoolId: string, opts: LinkOptions = {}): Promise<LinkResult> {
  const apply = Boolean(opts.apply), actorId = opts.actorId ?? null, now = opts.now ?? new Date();
  const threshold = opts.threshold ?? LINK_CONFIDENCE, cap = opts.listCap ?? 5000;
  const summary: LinkSummary = { questions: 0, onHiddenBefore: 0, linked: 0, byVia: {}, needsReview: 0, reviewByKind: {}, familiesMapLinked: 0, familiesMapReview: 0, familiesNafsLinked: 0, familiesNafsReview: 0, importUnsure: 0, switchedOffSkill: 0, readRise: { questions: 0, byKind: {} }, attemptsMoved: 0, recomputed: 0 };
  const result: LinkResult = { apply, summary, linked: [], review: [], mapFamilies: [], nafs: { linked: [], review: [], alreadyLinked: 0 } };
  const review = (kind: string) => { summary.needsReview++; summary.reviewByKind[kind] = (summary.reviewByKind[kind] ?? 0) + 1; };

  // 1–2. families
  if (opts.families !== false) {
    result.mapFamilies = await linkMapFamilies(repo, schoolId, apply, actorId, now);
    summary.familiesMapLinked = result.mapFamilies.filter((f) => f.area).length;
    summary.familiesMapReview = result.mapFamilies.filter((f) => !f.area).length;
    for (let i = 0; i < summary.familiesMapReview; i++) review("FAMILY_MAP");
    result.nafs = await seedNafsLinks(repo, schoolId, { apply, actorId, now });
    summary.familiesNafsLinked = result.nafs.linked.length;
    summary.familiesNafsReview = result.nafs.review.length;
    for (let i = 0; i < summary.familiesNafsReview; i++) review("FAMILY_NAFS");
  }

  // 3. questions on the hidden skill
  const ctx = await context(repo, schoolId);
  const idx = await schoolSkillIndex(repo, schoolId);
  const hiddenIds = [...ctx.skillById.values()].filter((k) => isHiddenSkill(k.code)).map((k) => s(k.id));
  const allIds = [...idx.ids];
  for (let i = 0; i < allIds.length; i += 400) summary.questions += await repo.count("Question", { skillId: { in: allIds.slice(i, i + 400) }, deletedAt: null, ...(opts.questionIds ? { id: { in: opts.questionIds } } : {}) });
  const want = opts.questionIds ? [...new Set(opts.questionIds.map(s))] : null;
  for await (const page of hiddenIds.length ? pages(repo, "Question", { skillId: { in: hiddenIds }, deletedAt: null }, ["id", "skillId", "stem", "tags"], want) : pages(repo, "Question", {}, ["id"], [])) {
    summary.onHiddenBefore += page.length;
    const ids = page.map((q) => s(q.id));
    // r68: a grade with Concept Vocabulary / Review questions waiting gets its Concept Vocabulary skill first
    if (apply) await ensureConceptVocabularySkills(repo, schoolId, ids, actorId, now);
    const plan = await planRemap(repo, schoolId, { questionIds: ids });
    const fromFile = await importSkillText(repo, ids);
    const items: RemapItem[] = [];
    for (const it of plan.items) {
      const q = page.find((x) => x.id === it.questionId)!;
      // deterministic rules first: the import file's skill name, then a skill named in the tags
      const named = exactSkill(ctx, it.grade, fromFile.get(it.questionId));
      const tags = parse(q.tags);
      const tagged = named ? null : exactSkill(ctx, it.grade, tags?.skill ?? tags?.skillName);
      const pick: RemapItem = named ? { ...it, toSkillId: s(named.id), toSkill: s(named.name), via: "IMPORT_SKILL", detail: `the import file names “${fromFile.get(it.questionId)}”`, confidence: 0.95 }
        : tagged ? { ...it, toSkillId: s(tagged.id), toSkill: s(tagged.name), via: "TAGS", detail: "the skill named in the question's tags", confidence: 0.9 } : it;
      const d: LinkDecision = { questionId: pick.questionId, grade: pick.grade, excerpt: s(q.stem).replace(/\s+/g, " ").slice(0, 160), fromSkill: s(ctx.skillById.get(s(q.skillId))?.name), toSkillId: pick.toSkillId, toSkill: pick.toSkill, via: pick.via, detail: pick.detail, confidence: pick.confidence ?? 0 };
      if (pick.toSkillId && (pick.confidence ?? 0) >= threshold) {
        items.push(pick); summary.linked++; summary.byVia[s(pick.via)] = (summary.byVia[s(pick.via)] ?? 0) + 1;
        if (result.linked.length < cap) result.linked.push(d);
      } else {
        review("QUESTION");
        if (result.review.length < cap) result.review.push(d);
        if (apply) await fileReview(repo, { schoolId, kind: "QUESTION", subjectId: d.questionId, excerpt: d.excerpt, guessId: d.toSkillId, guessLabel: d.toSkill ? `${d.toSkill} (Grade ${d.grade})` : null, confidence: d.confidence, reason: d.toSkillId ? `best guess from ${d.detail}; not sure enough to link` : d.detail }, now);
      }
    }
    if (apply && items.length) {
      const r = await applyRemap(repo, schoolId, { actorId, now, questionIds: items.map((x) => x.questionId), plan: { items, mapped: items.length, left: 0, attemptsToMove: 0 } });
      summary.attemptsMoved += r.attempts; summary.recomputed += r.recomputed;
      for (const x of items) await settleReview(repo, schoolId, "QUESTION", x.questionId, "APPROVED", actorId, now);
    }
  }

  // 3b. review rows of questions that left the hidden skill another way (an admin's Classify / Auto-classify): settled
  if (apply && hiddenIds.length) {
    const open = await repo.findMany("SkillLinkReview", { schoolId, kind: "QUESTION", status: "OPEN" }, { select: ["subjectId", "reason"], take: 5000 });
    const hiddenRows = open.filter((r) => !/^(the import picked|its skill)/.test(s(r.reason)));
    for (let i = 0; i < hiddenRows.length; i += BATCH) {
      const part = hiddenRows.slice(i, i + BATCH).map((r) => s(r.subjectId));
      for (const q of await repo.findMany("Question", { id: { in: part } }, { select: ["id", "skillId", "deletedAt"] })) {
        if (!q.deletedAt && !hiddenIds.includes(s(q.skillId))) await settleReview(repo, schoolId, "QUESTION", s(q.id), "APPROVED", actorId, now);
      }
    }
  }

  // 4. imported questions whose skill the import was not sure about; questions on a switched-off skill
  const realIds = allIds.filter((id) => !hiddenIds.includes(id));
  const offIds = new Set(realIds.filter((id) => !on(ctx.skillById.get(id)?.isActive)));
  for await (const page of realIds.length ? pages(repo, "Question", { deletedAt: null, skillId: { in: realIds } }, ["id", "skillId", "stem", "tags", "origin"], want) : pages(repo, "Question", {}, ["id"], [])) {
    for (const q of page) {
      const sid = s(q.skillId);
      if (!idx.ids.has(sid) || hiddenIds.includes(sid)) continue;
      const grade = ctx.gradeOf.get(sid) ?? 0, k = ctx.skillById.get(sid);
      const t = parse(q.tags);
      const unsure = Array.isArray(t?.aiNeeds) && (t!.aiNeeds as unknown[]).includes("skill");
      const off = offIds.has(sid);
      if (!unsure && !off) continue;
      if (unsure) summary.importUnsure++; else summary.switchedOffSkill++;
      const d: LinkDecision = { questionId: s(q.id), grade, excerpt: s(q.stem).replace(/\s+/g, " ").slice(0, 160), fromSkill: s(k?.name), toSkillId: off ? null : sid, toSkill: off ? null : s(k?.name), via: null, detail: off ? `its skill “${s(k?.name)}” is switched off` : `the import picked “${s(k?.name)}” without being sure`, confidence: off ? 0 : 0.6 };
      review("QUESTION");
      if (result.review.length < cap) result.review.push(d);
      if (apply) await fileReview(repo, { schoolId, kind: "QUESTION", subjectId: d.questionId, excerpt: d.excerpt, guessId: d.toSkillId, guessLabel: d.toSkill ? `${d.toSkill} (Grade ${grade})` : null, confidence: d.confidence, reason: d.detail }, now);
    }
  }

  // 5. ReadRise question kinds → skill family (whole library only)
  if (!opts.questionIds) {
    const fams = new Set([...ctx.skillById.values()].map((k) => s(k.code).toLowerCase().match(/^g\d+\.([a-z0-9-]+)$/)?.[1]).filter(Boolean) as string[]);
    let rrAfter = "";
    for (;;) {
      const page = await repo.findMany("RRQuestion", { ...(rrAfter ? { id: { gt: rrAfter } } : {}) }, { select: ["id", "skill"], orderBy: [{ field: "id", dir: "asc" }], take: 1000 });
      if (!page.length) break;
      rrAfter = s(page[page.length - 1].id);
      for (const r of page) {
        const kind = s(r.skill).toLowerCase();
        const fam = (RR_SKILL_MAP[kind] ?? []).find((f) => fams.has(f)) ?? null;
        const e = summary.readRise.byKind[kind] ?? { n: 0, family: fam };
        e.n++; summary.readRise.byKind[kind] = e; summary.readRise.questions++;
      }
      if (page.length < 1000) break;
    }
    for (const [kind, e] of Object.entries(summary.readRise.byKind)) {
      if (e.family) continue;
      review("READRISE");
      if (apply) await fileReview(repo, { schoolId, kind: "READRISE", subjectId: kind.slice(0, 64), excerpt: `ReadRise “${kind}” questions (${e.n})`, guessId: null, guessLabel: null, confidence: 0, reason: "no skill family of this school matches this ReadRise question kind" }, now);
    }
  }
  if (apply && (summary.linked || summary.familiesMapLinked || summary.familiesNafsLinked)) {
    await audit(repo, { actorId, action: "bank.link", entityType: "School", entityId: schoolId, after: { linked: summary.linked, byVia: summary.byVia, needsReview: summary.needsReview, familiesMap: summary.familiesMapLinked, familiesNafs: summary.familiesNafsLinked }, at: now });
  }
  return result;
}

/** After an import, an edit or a ReadMaster save: the new questions get their skill the same way (confident only). */
export async function linkNewQuestions(repo: Repo, schoolId: string, questionIds: string[], actorId: string | null, now = new Date()): Promise<number> {
  if (!questionIds.length) return 0;
  const n = (await linkBank(repo, schoolId, { apply: true, actorId, now, questionIds, listCap: 0, families: false })).summary.linked;
  // a skill added since the last run gets its NAFS area too (only sure links; the rest goes to review)
  await seedNafsLinks(repo, schoolId, { apply: true, actorId, now });
  return n;
}
