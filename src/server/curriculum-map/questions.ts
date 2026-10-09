/**
 * Questions on the Curriculum Map.
 *   - A question placed on the map is linked to one attachment node (acceptsQuestions = true) and is
 *     automatically in the Question Bank (every question is). Bank-only questions have no link.
 *   - Uses: any bank question may also be marked for Placement and/or MAP tests (both allowed).
 *   - A curriculum question without a platform skill gets its grade's “Unclassified (Curriculum Map)”
 *     skill (inactive: never offered for assignments or adaptive practice until classified).
 */
import type { Repo, Row } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
export type QuestionUseKind = "PLACEMENT" | "MAP_TEST";
export const USE_KINDS: QuestionUseKind[] = ["PLACEMENT", "MAP_TEST"];
export const USE_LABELS: Record<QuestionUseKind, string> = { PLACEMENT: "Diagnostic", MAP_TEST: "MAP test" };

export interface AttachmentNode {
  id: string; code: string; grade: number; unit: number; unitTitle: string;
  setKind: "TEXT_SET" | "SELECTION"; setNumber: number; setTitle: string; heading: string; sharedRead: string | null; genre: string | null;
  category: "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "RESPOND_TO_READING"; categoryLabel: string; skills: string | null;
  level: "ABOVE" | "ON" | "BELOW" | null;
  /** “Grade 4 › Unit 1 › Text Set 1: Expository Text › 2- Analyze Craft and Structure › On Level” */
  path: string;
}

/** Every node of the school's Curriculum Map that accepts questions, with its readable path. */
/**
 * The places of the Curriculum Map change only when the map is seeded, so they are cached briefly in memory
 * (per database and school). Assigning, bridging and the map page no longer rebuild hundreds of nodes each time.
 */
const NODE_TTL_MS = 60_000;
const nodeCache = new WeakMap<object, Map<string, { at: number; value: Promise<AttachmentNode[]> }>>();
export function clearMapCache(): void { cacheEpoch++; }
/** Changes whenever the map is re-seeded (other caches built on the map use it in their keys). */
export const mapEpoch = (): number => cacheEpoch;
let cacheEpoch = 0;
export async function attachmentNodes(repo: Repo, schoolId: string): Promise<AttachmentNode[]> {
  let perRepo = nodeCache.get(repo as object);
  if (!perRepo) { perRepo = new Map(); nodeCache.set(repo as object, perRepo); }
  const key = `${schoolId}#${cacheEpoch}`;
  const hit = perRepo.get(key);
  if (hit && Date.now() - hit.at < NODE_TTL_MS) return hit.value;
  const value = loadAttachmentNodes(repo, schoolId);
  perRepo.set(key, { at: Date.now(), value });
  value.catch(() => perRepo!.delete(key));
  return value;
}

async function loadAttachmentNodes(repo: Repo, schoolId: string): Promise<AttachmentNode[]> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  if (!grades.length) return [];
  const nodes = await repo.findMany("CurriculumMapNode", { gradeId: { in: grades.map((g) => g.id) } });
  const byId = new Map(nodes.map((n) => [s(n.id), n]));
  const level = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const LEVEL_TITLE = { ABOVE: "Above Level", ON: "On Level", BELOW: "Below Level" } as const;
  const out: AttachmentNode[] = [];
  for (const n of nodes.filter((x) => Boolean(x.acceptsQuestions))) {
    const cat = n.kind === "CATEGORY" ? n : byId.get(s(n.parentId));
    const set = cat ? byId.get(s(cat.parentId)) : undefined;
    const unit = set ? byId.get(s(set.parentId)) : undefined;
    if (!cat || !set || !unit) continue;
    const g = level.get(s(n.gradeId)) ?? 0;
    const lv = n.kind === "LEVEL" ? (s(n.level) as AttachmentNode["level"]) : null;
    out.push({
      id: s(n.id), code: s(n.code), grade: g, unit: Number(unit.number), unitTitle: s(unit.title),
      setKind: s(set.kind) as AttachmentNode["setKind"], setNumber: Number(set.number), setTitle: s(set.title), heading: s(set.heading),
      sharedRead: set.sharedRead ? s(set.sharedRead) : null, genre: set.genre ? s(set.genre) : null,
      category: s(cat.categoryType) as AttachmentNode["category"], categoryLabel: s(cat.title), skills: cat.skills ? s(cat.skills) : null, level: lv,
      path: [`Grade ${g}`, s(unit.title), s(set.heading), s(cat.title), lv ? LEVEL_TITLE[lv] : null].filter(Boolean).join(" › "),
    });
  }
  const catOrder = { CONCEPT_VOCABULARY: 1, ANALYZE_CRAFT_AND_STRUCTURE: 2, RESPOND_TO_READING: 3 };
  const lvOrder = { ABOVE: 1, ON: 2, BELOW: 3 };
  return out.sort((a, b) => a.grade - b.grade || a.unit - b.unit || a.setNumber - b.setNumber || catOrder[a.category] - catOrder[b.category] || (a.level ? lvOrder[a.level] : 0) - (b.level ? lvOrder[b.level] : 0));
}

/**
 * Finds the node from the import columns (Unit / Text Set or Selection / Category / Map Level) or from a
 * Curriculum Map ID (e.g. G4.U1.TS1.ACS.ON). Accepts “1”, “Unit 1”, “Text Set 1”, the text set's title,
 * “Concept Vocabulary” / “CV”, “Analyze Craft and Structure” / “ACS”, “Respond to Reading” / “RTR”,
 * “Above” / “On” / “Below” (with or without “Level”).
 */
export function resolveMapLocation(nodes: AttachmentNode[], grade: number | null, raw: { code?: string; unit?: string; set?: string; category?: string; level?: string }): { node: AttachmentNode | null; errors: string[] } {
  const code = s(raw.code).trim().toUpperCase();
  if (code && (s(raw.unit).trim() || s(raw.set).trim() || s(raw.category).trim())) {
    // both given: they must agree (a copied row with a changed unit but an old ID is an error, not a guess)
    const byId = resolveMapLocation(nodes, grade, { code: raw.code });
    const byCols = resolveMapLocation(nodes, grade, { unit: raw.unit, set: raw.set, category: raw.category, level: raw.level });
    if (byId.node && byCols.node && byId.node.code !== byCols.node.code) return { node: null, errors: [`Curriculum Map ID ${byId.node.code} and the place columns (${byCols.node.code}) do not match. Fix one of them, or clear the ID.`] };
    if (byId.node) return byId;
    return byCols.node ? byCols : { node: null, errors: [...byId.errors, ...byCols.errors] };
  }
  if (code) {
    const n = nodes.find((x) => x.code.toUpperCase() === code);
    if (!n) return { node: null, errors: [`Curriculum Map ID “${raw.code}” was not found (example: G4.U1.TS1.ACS.ON).`] };
    if (grade && n.grade !== grade) return { node: null, errors: [`Curriculum Map ID ${raw.code} is in Grade ${n.grade}, but the row says Grade ${grade}.`] };
    return { node: n, errors: [] };
  }
  const errors: string[] = [];
  if (!grade) errors.push("Grade is required to place the question on the Curriculum Map.");
  const num = (v: string) => { const m = s(v).match(/(\d+)/); return m ? Number(m[1]) : null; };
  const unit = num(s(raw.unit));
  if (!s(raw.unit).trim()) errors.push("Unit is required (e.g. 1 or Unit 1).");
  else if (!unit) errors.push(`Unit “${raw.unit}” is not a unit number.`);
  const setRaw = s(raw.set).trim();
  if (!setRaw) errors.push("Text Set / Selection is required (e.g. 2, Text Set 2 or the title).");
  const catRaw = s(raw.category).trim().toLowerCase().replace(/^\d+\s*-\s*/, "");
  const category = /^(cv|concept vocabulary)/.test(catRaw) ? "CONCEPT_VOCABULARY" : /^(acs|analy[sz]e craft)/.test(catRaw) ? "ANALYZE_CRAFT_AND_STRUCTURE" : /^(rtr|respond to reading)/.test(catRaw) ? "RESPOND_TO_READING" : null;
  if (!catRaw) errors.push("Category is required: Concept Vocabulary, Analyze Craft and Structure or Respond to Reading.");
  else if (!category) errors.push(`Category “${raw.category}” is not one of: Concept Vocabulary, Analyze Craft and Structure, Respond to Reading.`);
  const lvRaw = s(raw.level).trim().toLowerCase().replace(/\s*level$/, "");
  const level = lvRaw === "above" ? "ABOVE" : lvRaw === "on" ? "ON" : lvRaw === "below" ? "BELOW" : null;
  if (category === "CONCEPT_VOCABULARY" && lvRaw) errors.push("Concept Vocabulary has no levels: leave Map Level empty.");
  if (category && category !== "CONCEPT_VOCABULARY" && !level) errors.push(lvRaw ? `Map Level “${raw.level}” must be Above, On or Below.` : "Map Level is required for this category: Above, On or Below.");
  if (errors.length) return { node: null, errors };
  const inUnit = nodes.filter((n) => n.grade === grade && n.unit === unit);
  if (!inUnit.length) return { node: null, errors: [`Grade ${grade} has no Unit ${unit} on the Curriculum Map.`] };
  const setNum = /^\d+$/.test(setRaw) || /^(text set|selection)\s*\d+/i.test(setRaw) ? num(setRaw) : null;
  const norm = (v: string) => v.toLowerCase().replace(/[“”"’']/g, "").replace(/\s+/g, " ").trim();
  const sets = inUnit.filter((n) => (setNum ? n.setNumber === setNum : norm(n.setTitle) === norm(setRaw) || norm(n.heading) === norm(setRaw)));
  if (!sets.length) return { node: null, errors: [`Unit ${unit} of Grade ${grade} has no “${setRaw}”. Use the number (e.g. 2) or the exact title.`] };
  if (category === "RESPOND_TO_READING" && grade === 6) return { node: null, errors: ["Grade 6 has no Respond to Reading."] };
  const node = sets.find((n) => n.category === category && n.level === (category === "CONCEPT_VOCABULARY" ? null : level)) ?? null;
  return node ? { node, errors: [] } : { node: null, errors: [`That place does not exist on the Curriculum Map (Grade ${grade}, Unit ${unit}, ${setRaw}, ${raw.category}${level ? `, ${raw.level}` : ""}).`] };
}

/** The grade's “Unclassified (Curriculum Map)” skill (created once, inactive). */
export async function unclassifiedSkillId(repo: Repo, schoolId: string, gradeLevel: number): Promise<string> {
  const grade = (await repo.findMany("Grade", { schoolId, level: gradeLevel }))[0];
  if (!grade) throw new Error(`Grade ${gradeLevel} does not exist.`);
  const cur = (await repo.findMany("Curriculum", { gradeId: grade.id }))[0];
  if (!cur) throw new Error(`Grade ${gradeLevel} has no curriculum yet.`);
  const code = `G${gradeLevel}.curriculum-map-unclassified`;
  const found = (await repo.findMany("Skill", { curriculumId: cur.id, code }))[0];
  if (found) return s(found.id);
  const family = await repo.upsert("SkillFamily", { code: "school.reading.comprehension" }, { name: "reading · comprehension", domain: "READING", category: "COMPREHENSION" });
  const sk = await repo.create("Skill", {
    curriculumId: cur.id, familyId: family.id, code, name: "Unclassified (Curriculum Map)",
    description: "Questions placed on the Curriculum Map without a platform skill. Not used for assignments or adaptive practice until classified.",
    domain: "READING", category: "COMPREHENSION", sequence: 9999, isActive: false,
  });
  return s(sk.id);
}

/** Places a question on one map node (replaces any previous place). null removes it from the map. */
export async function setQuestionMapNode(repo: Repo, questionId: string, nodeId: string | null, actorId: string | null): Promise<void> {
  await repo.deleteMany("QuestionMapLink", { questionId });
  if (nodeId) await repo.create("QuestionMapLink", { questionId, nodeId, createdById: actorId, createdAt: new Date() });
}

/** Sets the question's Placement / MAP test uses (exactly the list given). */
export async function setQuestionUses(repo: Repo, questionId: string, uses: QuestionUseKind[]): Promise<void> {
  await repo.deleteMany("QuestionUse", { questionId });
  const list = [...new Set(uses.filter((u) => USE_KINDS.includes(u)))];
  if (list.length) await repo.createMany("QuestionUse", list.map((use) => ({ questionId, use, createdAt: new Date() })));
}

/** Reads uses from text like “Placement, MAP” / “Both” / “MAP test”. */
export function usesFrom(raw: string): { uses: QuestionUseKind[]; error?: string } {
  const t = s(raw).trim().toLowerCase();
  if (!t || t === "none" || t === "bank" || t === "-") return { uses: [] };
  if (t === "both" || t === "all") return { uses: ["PLACEMENT", "MAP_TEST"] };
  const uses: QuestionUseKind[] = [];
  for (const part of t.split(/[,;/+&]|\band\b/).map((x) => x.trim()).filter(Boolean)) {
    if (/^placement/.test(part)) uses.push("PLACEMENT");
    else if (/^map/.test(part)) uses.push("MAP_TEST");
    else return { uses: [], error: `Use “${raw}” is not understood: write Placement, MAP, or both (e.g. Placement, MAP).` };
  }
  return { uses: [...new Set(uses)] };
}

/** Map place and uses for a list of questions (one query each). */
export async function placesOf(repo: Repo, questionIds: string[]): Promise<Map<string, { code: string | null; uses: QuestionUseKind[] }>> {
  const out = new Map<string, { code: string | null; uses: QuestionUseKind[] }>();
  if (!questionIds.length) return out;
  const [links, uses] = await Promise.all([
    repo.findMany("QuestionMapLink", { questionId: { in: questionIds } }), repo.findMany("QuestionUse", { questionId: { in: questionIds } }),
  ]);
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "code"] }) : [];
  const codeOf = new Map(nodes.map((n) => [s(n.id), s(n.code)]));
  for (const id of questionIds) out.set(id, { code: null, uses: [] });
  for (const l of links) out.get(s(l.questionId))!.code = codeOf.get(s(l.nodeId)) ?? null;
  for (const u of uses) out.get(s(u.questionId))!.uses.push(s(u.use) as QuestionUseKind);
  return out;
}
export type { Row };

// ------------------------------------------------------------------ classifying Unclassified questions

export interface UnclassifiedRow { id: string; stem: string; grade: number; mapCode: string | null; status: string }

/** Curriculum questions still on a grade's “Unclassified (Curriculum Map)” skill. */
export async function unclassifiedQuestions(repo: Repo, schoolId: string): Promise<{ rows: UnclassifiedRow[]; skills: { id: string; name: string; grade: number }[] }> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const levelOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const all = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code", "name", "curriculumId", "isActive"] }) : [];
  const unclassified = all.filter((k) => s(k.code).endsWith(".curriculum-map-unclassified"));
  const qs = unclassified.length ? await repo.findMany("Question", { skillId: { in: unclassified.map((k) => k.id) }, deletedAt: null }, { select: ["id", "stem", "skillId", "status"] }) : [];
  const places = await placesOf(repo, qs.map((q) => s(q.id)));
  const gradeOfSkill = new Map(all.map((k) => [s(k.id), levelOfCur.get(s(k.curriculumId)) ?? 0]));
  return {
    rows: qs.map((q) => ({ id: s(q.id), stem: s(q.stem).slice(0, 200), grade: gradeOfSkill.get(s(q.skillId)) ?? 0, mapCode: places.get(s(q.id))?.code ?? null, status: s(q.status) })).sort((a, b) => a.grade - b.grade || s(a.mapCode).localeCompare(s(b.mapCode))),
    skills: all.filter((k) => k.isActive !== false && !s(k.code).endsWith(".curriculum-map-unclassified")).map((k) => ({ id: s(k.id), name: s(k.name), grade: levelOfCur.get(s(k.curriculumId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)),
  };
}

/** Gives Unclassified questions a real skill of the same grade (their map place does not change). */
export async function classifyQuestions(repo: Repo, schoolId: string, actorId: string, items: { questionId: string; skillId: string }[], now = new Date()): Promise<number> {
  const { rows, skills } = await unclassifiedQuestions(repo, schoolId);
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  let n = 0;
  for (const it of items.filter((x) => x.skillId)) {
    const r = rowOf.get(it.questionId);
    const k = skills.find((x) => x.id === it.skillId);
    if (!r) throw new Error("That question is not waiting to be classified.");
    if (!k) throw new Error("Choose an active skill.");
    if (k.grade !== r.grade) throw new Error(`The skill is Grade ${k.grade}, the question is Grade ${r.grade}.`);
    const link = (await repo.findMany("SkillStandard", { skillId: k.id }))[0];
    const q = await repo.findUnique("Question", { id: r.id });
    await repo.updateMany("Question", { id: r.id }, { skillId: k.id, ...(q?.standardId ? {} : link ? { standardId: link.standardId } : {}), updatedAt: now });
    await repo.create("AuditLog", { actorId, action: "question.classify", entityType: "Question", entityId: r.id, after: { skillId: k.id }, createdAt: now });
    n++;
  }
  return n;
}

/**
 * 🪄 Auto-classify: an Unclassified question with a CCSS standard goes to the platform skill of its grade that is
 * linked to that standard — when exactly one skill is. Several candidates: the one whose name shares the most
 * words with the question's Curriculum Map place skills. No standard / no candidate: left for a person.
 */
export async function autoClassify(repo: Repo, schoolId: string, actorId: string, now = new Date()): Promise<{ classified: number; left: number }> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "code", "curriculumId"] }) : [];
  const gradeOf = new Map(curs.map((c) => [String(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const unclassified = skills.filter((k) => String(k.code).endsWith(".curriculum-map-unclassified"));
  const real = skills.filter((k) => !String(k.code).endsWith(".curriculum-map-unclassified"));
  if (!unclassified.length) return { classified: 0, left: 0 };
  const qs = await repo.findMany("Question", { skillId: { in: unclassified.map((k) => k.id) }, deletedAt: null }, { select: ["id", "skillId", "standardId"] });
  const links = real.length ? await repo.findMany("SkillStandard", { skillId: { in: real.map((k) => k.id) } }, { select: ["skillId", "standardId"] }) : [];
  const nodes = qs.length ? await repo.findMany("QuestionMapLink", { questionId: { in: qs.map((q) => q.id) } }, { select: ["questionId", "nodeId"] }) : [];
  const nodeRows = nodes.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(nodes.map((n) => String(n.nodeId)))] } }, { select: ["id", "skills", "parentId"] }) : [];
  const words = (t: unknown) => new Set(String(t ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
  const items: { questionId: string; skillId: string }[] = [];
  for (const q of qs) {
    const g = gradeOf.get(String(unclassified.find((k) => k.id === q.skillId)?.curriculumId)) ?? 0;
    if (!q.standardId) continue;
    const cands = real.filter((k) => gradeOf.get(String(k.curriculumId)) === g && links.some((l) => l.skillId === k.id && l.standardId === q.standardId));
    if (!cands.length) continue;
    let pick = cands[0];
    if (cands.length > 1) {
      const node = nodeRows.find((n) => n.id === nodes.find((x) => x.questionId === q.id)?.nodeId);
      const parent = node?.parentId ? nodeRows.find((n) => n.id === node.parentId) : undefined;
      const placeWords = new Set([...words(node?.skills), ...words(parent?.skills)]);
      const score = (k: (typeof cands)[number]) => [...words(k.name)].filter((w) => placeWords.has(w)).length;
      pick = [...cands].sort((a, b) => score(b) - score(a))[0];
    }
    items.push({ questionId: String(q.id), skillId: String(pick.id) });
  }
  const classified = items.length ? await classifyQuestions(repo, schoolId, actorId, items, now) : 0;
  return { classified, left: qs.length - classified };
}
