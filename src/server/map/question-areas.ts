/**
 * 🧭 The whole question bank on NWEA MAP Growth: every question (Question Bank, Grammar, Curriculum Map, ReadMaster,
 * Diagnostic — they are all bank questions) gets its MAP test and instructional area (see nwea-area.ts).
 *
 *   preview   what the classification would do, nothing saved: counts per grade and area, the standards it
 *             fixes, the standards it only suggests (read from the wording), the questions it cannot classify;
 *   backup    every question's current values (CSV) before anything changes;
 *   apply     saves the areas, fixes the clearly wrong standards (the old one kept in QuestionStandardFix) and
 *             records the suggestions for an admin. No question is ever deleted. An area an admin set by hand,
 *             or one an import file gave, is kept.
 *   new questions are classified the moment they are saved (autoClassify).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { bumpBankVersion } from "../cache/bank-version";
import { areaByKey, classifyQuestion, MAP_AREAS, parseCcss, ccssCode, type AreaKey, type Classified } from "./nwea-area";
import { BANK_MODELS, keptWhileUnchanged } from "../cache/kept";

const s = (v: unknown) => String(v ?? "");
const short = (code: unknown) => s(code).replace(/^CCSS\.ELA-LITERACY\./i, "");
const KEEP: ReadonlySet<string> = new Set(["ADMIN", "IMPORT", "AI"]);
export const areaKeyOfName = (name: unknown): AreaKey | null => MAP_AREAS.find((a) => a.name === s(name))?.key ?? null;

function isAdmin(actor: Actor) {
  assertCan(actor, "questions:read");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins classify the bank.");
}

// ------------------------------------------------------------------ the school's questions with what decides their area

interface QCtx { q: Row; grade: number | null; skill: Row | null; skillStds: string[]; standard: string | null; options: string[]; passage: string | null; genre: string | null }
async function context(repo: Repo, schoolId: string, onlyIds?: string[]): Promise<{ list: QCtx[]; stdByShort: Map<string, Row> }> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id", "name", "code", "category", "curriculumId"] }) : [];
  const skillById = new Map(skills.map((k) => [s(k.id), k]));
  const where: Record<string, unknown> = onlyIds ? { id: { in: onlyIds }, deletedAt: null } : { skillId: { in: skills.map((k) => k.id) }, deletedAt: null };
  const qs = (onlyIds?.length || skills.length) ? (await repo.findMany("Question", where, { select: ["id", "skillId", "standardId", "stem", "passageId", "status", "externalRef", "mapTest", "mapInstructionalArea", "mapAreaSource", "tags"] })).filter((q) => skillById.has(s(q.skillId))) : [];
  const ids = qs.map((q) => s(q.id));
  const chunk = <T,>(a: T[], n = 800) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const opts: Row[] = [], links: Row[] = [];
  for (const part of chunk(ids)) {
    opts.push(...await repo.findMany("QuestionOption", { questionId: { in: part } }, { select: ["questionId", "text"] }));
    links.push(...await repo.findMany("QuestionMapLink", { questionId: { in: part } }, { select: ["questionId", "nodeId"] }));
  }
  const skStd = skills.length ? await repo.findMany("SkillStandard", { skillId: { in: skills.map((k) => k.id) } }, { select: ["skillId", "standardId", "isPrimary"] }) : [];
  const stds = await repo.findMany("Standard", { framework: "CCSS_ELA" }, { select: ["id", "code"] });
  const codeOf = new Map(stds.map((x) => [s(x.id), short(x.code)]));
  const pIds = [...new Set(qs.map((q) => s(q.passageId)).filter(Boolean))];
  const passages = pIds.length ? await repo.findMany("ReadingPassage", { id: { in: pIds } }, { select: ["id", "body", "genre"] }) : [];
  const nodeIds = [...new Set(links.map((l) => s(l.nodeId)))];
  const nodes = nodeIds.length ? await repo.findMany("CurriculumMapNode", { id: { in: nodeIds } }) : [];
  const optsOf = new Map<string, string[]>(); for (const o of opts) { const k = s(o.questionId); optsOf.set(k, [...(optsOf.get(k) ?? []), s(o.text)]); }
  const list = qs.map((q) => {
    const skill = skillById.get(s(q.skillId)) ?? null;
    const p = passages.find((x) => x.id === q.passageId);
    const node = nodes.find((n) => n.id === links.find((l) => l.questionId === q.id)?.nodeId);
    const skillStds = skStd.filter((x) => x.skillId === q.skillId).sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary))).map((x) => codeOf.get(s(x.standardId)) ?? "").filter(Boolean);
    return {
      q, grade: skill ? gradeOfCur.get(s(skill.curriculumId)) ?? null : null, skill, skillStds, standard: q.standardId ? codeOf.get(s(q.standardId)) ?? null : null,
      options: optsOf.get(s(q.id)) ?? [], passage: p ? s(p.body) : null, genre: p?.genre ? s(p.genre) : node?.genre ? s(node.genre) : null,
    };
  });
  return { list, stdByShort: new Map(stds.map((x) => [short(x.code).toLowerCase(), x])) };
}

const classify = (c: QCtx): Classified => classifyQuestion({
  grade: c.grade, standard: c.standard, skillName: c.skill ? s(c.skill.name) : null, skillCategory: c.skill ? s(c.skill.category) : null,
  skillStandards: c.skillStds, stem: s(c.q.stem), options: c.options, passage: c.passage, genre: c.genre,
});

// ------------------------------------------------------------------ preview

export interface AreaRow { id: string; grade: number | null; stem: string; skill: string; standard: string | null; area: AreaKey | null; source: string | null; kept: boolean; fix: Classified["standard"]; note: string | null; before: string | null }
export interface Preview {
  total: number; grades: number[];
  counts: Record<string, Record<string, number>>;   // grade → area key | NONE → n
  changed: number; kept: number; fixes: AreaRow[]; suggestions: AreaRow[]; unclassified: AreaRow[]; byText: number;
}
function rowOf(c: QCtx, r: Classified): AreaRow {
  const kept = KEEP.has(s(c.q.mapAreaSource)) && Boolean(c.q.mapInstructionalArea);
  return {
    id: s(c.q.id), grade: c.grade, stem: s(c.q.stem).replace(/\s+/g, " ").slice(0, 160), skill: c.skill ? s(c.skill.name) : "", standard: c.standard,
    area: kept ? areaKeyOfName(c.q.mapInstructionalArea) : r.area, source: kept ? s(c.q.mapAreaSource) : r.source, kept, fix: kept ? null : r.standard, note: r.note, before: c.q.mapInstructionalArea ? s(c.q.mapInstructionalArea) : null,
  };
}

export async function classificationPreview(repo: Repo, actor: Actor): Promise<{ preview: Preview; rows: AreaRow[] }> {
  isAdmin(actor);
  // ⚡ built from every question of the school with its options: kept while the bank is unchanged
  return keptWhileUnchanged(repo, `mapcls.preview|${s(actor.schoolId)}`, BANK_MODELS, 5 * 60_000, () => buildPreview(repo, actor));
}
async function buildPreview(repo: Repo, actor: Actor): Promise<{ preview: Preview; rows: AreaRow[] }> {
  const { list } = await context(repo, s(actor.schoolId));
  const rows = list.map((c) => rowOf(c, classify(c)));
  const counts: Preview["counts"] = {};
  for (const r of rows) { const g = String(r.grade ?? "?"); counts[g] ??= {}; const k = r.area ?? "NONE"; counts[g][k] = (counts[g][k] ?? 0) + 1; }
  return {
    rows,
    preview: {
      total: rows.length, grades: [...new Set(rows.map((r) => r.grade).filter((g): g is number => g !== null))].sort((a, b) => a - b), counts,
      changed: rows.filter((r) => r.area && areaByKey(r.area).name !== r.before).length, kept: rows.filter((r) => r.kept).length,
      fixes: rows.filter((r) => r.fix?.sure), suggestions: rows.filter((r) => r.fix && !r.fix.sure), unclassified: rows.filter((r) => !r.area), byText: rows.filter((r) => r.source === "TEXT").length,
    },
  };
}

// ------------------------------------------------------------------ apply (and the same for new questions)

async function standardRow(repo: Repo, stdByShort: Map<string, Row>, code: string): Promise<Row> {
  const hit = stdByShort.get(code.toLowerCase());
  if (hit) return hit;
  const c = parseCcss(code)!;
  const row = await repo.upsert("Standard", { framework: "CCSS_ELA", code: `CCSS.ELA-LITERACY.${ccssCode(c)}` }, { gradeLevel: c.grade, strand: c.strand, description: null }, {});
  stdByShort.set(code.toLowerCase(), row);
  return row;
}

async function applyRows(repo: Repo, schoolId: string, list: QCtx[], stdByShort: Map<string, Row>, now: Date): Promise<{ classified: number; fixed: number; suggested: number; unclassified: number; kept: number }> {
  const open = list.length ? await repo.findMany("QuestionStandardFix", { questionId: { in: list.map((c) => s(c.q.id)) } }, { select: ["questionId", "toCode", "status"] }) : [];
  let classified = 0, fixed = 0, suggested = 0, unclassified = 0, kept = 0;
  for (const c of list) {
    if (KEEP.has(s(c.q.mapAreaSource)) && c.q.mapInstructionalArea) { kept++; continue; }
    const r = classify(c);
    const patch: Record<string, unknown> = {};
    if (r.standard?.sure) {
      const std = await standardRow(repo, stdByShort, r.standard.to);
      if (s(std.id) !== s(c.q.standardId)) {
        patch.standardId = std.id;
        await repo.create("QuestionStandardFix", { schoolId, questionId: c.q.id, fromCode: r.standard.from ? short(r.standard.from).slice(0, 40) : null, toCode: r.standard.to, reason: r.standard.reason.slice(0, 255), status: "APPLIED", createdAt: now });
        fixed++;
      }
    } else if (r.standard && !open.some((o) => o.questionId === c.q.id && s(o.toCode).toLowerCase() === r.standard!.to.toLowerCase())) {
      await repo.create("QuestionStandardFix", { schoolId, questionId: c.q.id, fromCode: r.standard.from ? short(r.standard.from).slice(0, 40) : null, toCode: r.standard.to, reason: r.standard.reason.slice(0, 255), status: "SUGGESTED", createdAt: now });
      suggested++;
    }
    if (r.area) { Object.assign(patch, { mapTest: r.test, mapInstructionalArea: r.name, mapAreaSource: r.source }); classified++; }
    else unclassified++;
    if (Object.keys(patch).length) await repo.updateMany("Question", { id: c.q.id }, patch);
  }
  if (classified || fixed) bumpBankVersion();
  return { classified, fixed, suggested, unclassified, kept };
}

export async function applyClassification(repo: Repo, actor: Actor, now = new Date()): Promise<{ classified: number; fixed: number; suggested: number; unclassified: number; kept: number }> {
  isAdmin(actor);
  const { list, stdByShort } = await context(repo, s(actor.schoolId));
  const r = await applyRows(repo, s(actor.schoolId), list, stdByShort, now);
  await audit(repo, { actorId: actor.userId, action: "map.classification.apply", entityType: "Question", entityId: null, after: r, at: now });
  return r;
}

/** New or edited questions: classified as soon as they are saved (an area set by hand or by the file stays). */
export async function autoClassify(repo: Repo, schoolId: string, questionIds: string[], now = new Date()): Promise<void> {
  if (!questionIds.length || !schoolId) return;
  try {
    const { list, stdByShort } = await context(repo, schoolId, questionIds);
    await applyRows(repo, schoolId, list, stdByShort, now);
  } catch { /* classifying must never stop a question from being saved */ }
}

// ------------------------------------------------------------------ review and hand-setting

export interface FixRow { id: string; questionId: string; stem: string; grade: number | null; skill: string; from: string | null; to: string; reason: string; status: string; area: string | null }
export async function standardFixes(repo: Repo, actor: Actor, status: "SUGGESTED" | "APPLIED" | "APPROVED" | "REJECTED", limit = 300): Promise<{ rows: FixRow[]; total: number }> {
  isAdmin(actor);
  const all = await repo.findMany("QuestionStandardFix", { schoolId: actor.schoolId, status });
  const pick = all.sort((a, b) => s(a.questionId).localeCompare(s(b.questionId))).slice(0, limit);
  const { list } = pick.length ? await context(repo, s(actor.schoolId), [...new Set(pick.map((f) => s(f.questionId)))]) : { list: [] as QCtx[] };
  return {
    total: all.length,
    rows: pick.map((f) => { const c = list.find((x) => x.q.id === f.questionId); return { id: s(f.id), questionId: s(f.questionId), stem: c ? s(c.q.stem).replace(/\s+/g, " ").slice(0, 200) : "(archived)", grade: c?.grade ?? null, skill: c?.skill ? s(c.skill.name) : "", from: f.fromCode ? s(f.fromCode) : null, to: s(f.toCode), reason: s(f.reason), status: s(f.status), area: c?.q.mapInstructionalArea ? s(c.q.mapInstructionalArea) : null }; }),
  };
}

/** Approve (the question takes the standard and its area) or reject a suggested standard. */
export async function reviewStandardFix(repo: Repo, actor: Actor, ids: string[], approve: boolean, now = new Date()): Promise<number> {
  isAdmin(actor);
  const fixes = (await repo.findMany("QuestionStandardFix", { id: { in: ids.slice(0, 1000) } })).filter((f) => s(f.schoolId) === s(actor.schoolId) && f.status === "SUGGESTED");
  const { stdByShort } = await context(repo, s(actor.schoolId), []);
  for (const f of fixes) {
    if (approve) {
      const std = await standardRow(repo, stdByShort, s(f.toCode));
      const c = parseCcss(s(f.toCode));
      const q = await repo.findUnique("Question", { id: f.questionId });
      const area = c && q ? classifyQuestion({ grade: c.grade, standard: s(f.toCode), skillName: null, stem: s(q.stem) }) : null;
      await repo.updateMany("Question", { id: f.questionId }, { standardId: std.id, ...(area?.area && !(q && s(q.mapAreaSource) === "ADMIN") ? { mapTest: area.test, mapInstructionalArea: area.name, mapAreaSource: "STANDARD" } : {}) });
    }
    await repo.updateMany("QuestionStandardFix", { id: f.id }, { status: approve ? "APPROVED" : "REJECTED", reviewedById: actor.userId, reviewedAt: now });
  }
  if (approve && fixes.length) bumpBankVersion();
  await audit(repo, { actorId: actor.userId, action: approve ? "map.standard.approve" : "map.standard.reject", entityType: "QuestionStandardFix", entityId: null, after: { n: fixes.length }, at: now });
  return fixes.length;
}

/** An admin sets (or clears) a question's area by hand; it is never overwritten by the automatic classification. */
export async function setQuestionArea(repo: Repo, actor: Actor, questionIds: string[], area: AreaKey | null, now = new Date()): Promise<number> {
  isAdmin(actor);
  const { list } = await context(repo, s(actor.schoolId), questionIds.slice(0, 2000));
  for (const c of list) await repo.updateMany("Question", { id: c.q.id }, area ? { mapTest: areaByKey(area).test, mapInstructionalArea: areaByKey(area).name, mapAreaSource: "ADMIN" } : { mapTest: null, mapInstructionalArea: null, mapAreaSource: null });
  if (!area) await autoClassify(repo, s(actor.schoolId), list.map((c) => s(c.q.id)), now);
  bumpBankVersion();
  await audit(repo, { actorId: actor.userId, action: "map.area.set", entityType: "Question", entityId: null, after: { n: list.length, area }, at: now });
  return list.length;
}

// ------------------------------------------------------------------ backup and the counts report

export async function classificationBackup(repo: Repo, actor: Actor): Promise<string[][]> {
  isAdmin(actor);
  const { list } = await context(repo, s(actor.schoolId));
  return [["Question ID", "External Ref", "Grade", "Skill", "Status", "Standard", "MAP Test", "MAP Instructional Area", "Area Source", "Question"],
    ...list.map((c) => [s(c.q.id), s(c.q.externalRef), c.grade !== null ? String(c.grade) : "", c.skill ? s(c.skill.name) : "", s(c.q.status), c.standard ?? "", s(c.q.mapTest), s(c.q.mapInstructionalArea), s(c.q.mapAreaSource), s(c.q.stem).replace(/\s+/g, " ").slice(0, 500)])];
}
/** The preview as a sheet (what WOULD be saved), to check before Apply. */
export function previewSheet(rows: AreaRow[]): string[][] {
  return [["Question ID", "Grade", "Skill", "Standard now", "Standard after", "Standard change", "MAP Test", "MAP Instructional Area", "Decided by", "Note", "Question"],
    ...rows.map((r) => [r.id, r.grade !== null ? String(r.grade) : "", r.skill, r.standard ?? "", r.fix?.sure ? r.fix.to : r.standard ?? "", r.fix ? `${r.fix.sure ? "FIXED" : "SUGGESTED"}: ${r.fix.reason}${r.fix.sure ? "" : ` → ${r.fix.to}`}` : "", r.area ? areaByKey(r.area).test : "", r.area ? areaByKey(r.area).name : "", r.source ?? "", r.note ?? "", r.stem])];
}

/** The counts per grade and area as saved now (for the report and the bank page). */
export async function savedCounts(repo: Repo, actor: Actor): Promise<{ grade: number | null; area: string; n: number }[]> {
  assertCan(actor, "questions:read");
  // ⚡ every question of the school with its options: kept while the bank is unchanged
  return keptWhileUnchanged(repo, `mapcls.saved|${s(actor.schoolId)}`, BANK_MODELS, 5 * 60_000, async () => {
  const { list } = await context(repo, s(actor.schoolId));
  const m = new Map<string, number>();
  for (const c of list) { const k = `${c.grade ?? ""}|${s(c.q.mapInstructionalArea) || "Not classified"}`; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([k, n]) => { const [g, area] = k.split("|"); return { grade: g ? Number(g) : null, area, n }; }).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.area.localeCompare(b.area));
  });
}
