/**
 * 🔎 One search for staff: skills (with their standards), grammar lessons, Curriculum Map places, ReadMaster
 * articles, questions, students and the platform's own pages. Every result opens what it found; skills,
 * grammar lessons and map places can be ⭐ assigned straight from the result.
 *
 * Matching: every word of the search must be found (in the name, code, standard, lesson …); a word may also be
 * found with a small typo (“nown” → Nouns). Standard codes work with or without the CCSS prefix (RL.4.2).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { isGrammarCode } from "../grammar/grammar";
import { attachmentNodes } from "../curriculum-map/questions";
import { studentNames } from "../insights/student-data";
import { navItemsFor } from "../../components/nav-items";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { countQuestionsOfSkills, SKILL_SYNONYMS } from "../questions/skill-questions";

const s = (v: unknown) => String(v ?? "");
export type HitKind = "SKILL" | "GRAMMAR" | "PLACE" | "ARTICLE" | "QUESTION" | "STUDENT" | "PAGE";
export interface SearchHit { kind: HitKind; id: string; title: string; sub: string; href: string; assignHref: string | null; score: number }
export interface SearchResult { q: string; total: number; groups: { kind: HitKind; label: string; icon: string; hits: SearchHit[] }[] }
const GROUPS: { kind: HitKind; label: string; icon: string; max: number }[] = [
  { kind: "SKILL", label: "Skills", icon: "🧩", max: 12 }, { kind: "GRAMMAR", label: "Grammar Lessons", icon: "🔤", max: 12 },
  { kind: "PLACE", label: "Curriculum Map", icon: "🧭", max: 10 }, { kind: "ARTICLE", label: "ReadMaster Articles", icon: "📰", max: 8 },
  { kind: "STUDENT", label: "Students", icon: "🧑‍🎓", max: 10 }, { kind: "QUESTION", label: "Questions", icon: "❓", max: 10 }, { kind: "PAGE", label: "Pages", icon: "📄", max: 6 },
];

const norm = (x: string) => x.toLowerCase().replace(/ccss\.ela-literacy\./g, "").replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
/** edit distance with an early stop (small words only) */
function close(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}
/** 0 = no match; higher = better (title hits beat other text; exact beats typo) */
export function matchScore(words: string[], title: string, more = ""): number {
  const t = norm(title), all = `${t} ${norm(more)}`;
  const tw = all.split(" ");
  let score = 0;
  for (const w of words) {
    if (t.includes(w)) score += t.startsWith(w) || t.includes(` ${w}`) ? 6 : 4;
    else if (all.includes(w)) score += 2;
    else if (w.length >= 4 && tw.some((x) => x.length >= 3 && (close(w, x.slice(0, w.length + 1), w.length >= 7 ? 2 : 1) || close(w, x, w.length >= 7 ? 2 : 1)))) score += 1;
    else return 0;
  }
  return score;
}

/** Published questions' stems per school (cached a minute; the bank changes rarely during a search). */
const stemCache = new WeakMap<object, Map<string, { at: number; v: string; rows: Promise<Row[]> }>>();
function questionStems(repo: Repo, skillIds: string[], key: string): Promise<Row[]> {
  let m = stemCache.get(repo); if (!m) stemCache.set(repo, (m = new Map()));
  const v = modelVersion("Question"), hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.rows;
  const rows = skillIds.length ? repo.findMany("Question", { skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "stem", "skillId"] }) : Promise.resolve([] as Row[]);
  remember(m, key, { at: Date.now(), v, rows }, 16);
  return rows;
}

/** Teachers' words for the same skill (“main idea” is “central idea” in CCSS) — searched as well. */
const SYNONYMS: [string, string][] = SKILL_SYNONYMS;
export async function searchEverything(repo: Repo, actor: Actor, raw: string): Promise<SearchResult> {
  const q = s(raw).trim().slice(0, 80);
  const base = await searchOnce(repo, actor, q);
  const syn = SYNONYMS.find(([a]) => norm(q).includes(a));
  if (!syn) return base;
  const more = await searchOnce(repo, actor, norm(q).replace(syn[0], syn[1]));
  const groups = base.groups.map((g) => ({ ...g }));
  for (const g of more.groups) {
    const at = groups.find((x) => x.kind === g.kind);
    if (!at) groups.push(g); else for (const h of g.hits) if (!at.hits.some((x) => x.id === h.id)) at.hits.push(h);
  }
  const order = GROUPS.map((g) => g.kind);
  groups.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { q, total: groups.reduce((t, g) => t + g.hits.length, 0), groups };
}

async function searchOnce(repo: Repo, actor: Actor, raw: string): Promise<SearchResult> {
  assertCan(actor, "questions:read");
  const q = s(raw).trim().slice(0, 80);
  const words = norm(q).split(" ").filter((w) => w.length >= 2 || /\d/.test(w));
  if (!words.length || !actor.schoolId) return { q, total: 0, groups: [] };
  const schoolId = actor.schoolId;
  const teacher = actor.role === "TEACHER";
  const hits: SearchHit[] = [];

  // skills and grammar lessons (with their standards and how many questions they have)
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const skills = curs.length ? (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code", "name", "description", "curriculumId", "isActive"] })).filter((k) => k.isActive !== false) : [];
  const ids = skills.map((k) => s(k.id));
  const [links, stems] = await Promise.all([
    ids.length ? repo.findMany("SkillStandard", { skillId: { in: ids } }, { select: ["skillId", "standardId"] }) : Promise.resolve([] as Row[]),
    questionStems(repo, ids, schoolId),
  ]);
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : [];
  const codeOf = new Map(stds.map((x) => [s(x.id), s(x.code).replace(/^CCSS\.ELA-LITERACY\./i, "")]));
  // UI reorg Phase 1: the skill's count is the ONE shared count (= the MAP and NAFS sections), not the stems read here
  const qCount = await countQuestionsOfSkills(repo, schoolId, ids);
  for (const k of skills) {
    if (s(k.code).endsWith(".curriculum-map-unclassified")) continue;
    const std = links.filter((l) => l.skillId === k.id).map((l) => codeOf.get(s(l.standardId)) ?? "").filter(Boolean);
    const grammar = isGrammarCode(k.code);
    const sc = matchScore(words, s(k.name), `${std.join(" ")} ${s(k.code)} ${s(k.description).slice(0, 200)}`);
    if (!sc) continue;
    const n = qCount.get(s(k.id)) ?? 0;
    hits.push({ kind: grammar ? "GRAMMAR" : "SKILL", id: s(k.id), title: s(k.name), sub: `${grammar ? "Grammar" : `Grade ${gradeOfCur.get(s(k.curriculumId)) ?? ""}`}${std.length ? ` · ${std.slice(0, 3).join(", ")}` : ""} · ${n} questions`, href: n ? `/teacher/preview?skillId=${s(k.id)}` : `/admin/skills`, assignHref: teacher && n ? `/teacher/skill-assign?skillId=${s(k.id)}` : null, score: sc + (n ? 1 : 0) });
  }

  // Curriculum Map places (Unit › Text Set › category › level)
  for (const n of await attachmentNodes(repo, schoolId)) {
    if (n.level) continue;   // the place itself (its levels open from it)
    const sc = matchScore(words, `${n.heading} ${n.setTitle}`, `${n.code} ${n.unitTitle} ${n.categoryLabel} ${n.skills ?? ""} ${n.genre ?? ""} ${n.sharedRead ?? ""}`);
    if (sc) hits.push({ kind: "PLACE", id: n.id, title: `${n.setTitle} · ${n.categoryLabel}`, sub: n.path, href: `/admin/curriculum-map?grade=${n.grade}&unit=${n.unit}`, assignHref: teacher ? `/admin/curriculum-map?grade=${n.grade}&unit=${n.unit}#${encodeURIComponent(n.code)}` : null, score: sc });
  }

  // ReadMaster articles
  for (const a of await repo.findMany("ReadMasterArticle", { schoolId }, { select: ["id", "code", "title", "topic", "gradeLevel"] })) {
    const sc = matchScore(words, s(a.title), `${s(a.code)} ${s(a.topic)}`);
    if (sc) hits.push({ kind: "ARTICLE", id: s(a.id), title: s(a.title), sub: `Grade ${s(a.gradeLevel)} · ${s(a.code)}${a.topic ? ` · ${s(a.topic)}` : ""}`, href: `/admin/readmaster?grade=${s(a.gradeLevel)}`, assignHref: null, score: sc });
  }

  // students: a teacher's own students; staff: the school's
  const studentIds = teacher ? [...(actor.teacherStudentIds ?? [])] : (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => s(x.id));
  if (studentIds.length) {
    const names = await studentNames(repo, studentIds);
    for (const [id, x] of names) { const sc = matchScore(words, x.name, x.number); if (sc) hits.push({ kind: "STUDENT", id, title: x.name, sub: x.number ? `Student ${x.number}` : "Student", href: `/teacher/level-story/${id}`, assignHref: null, score: sc }); }
  }

  // questions (their stem)
  const skillName = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  for (const r of stems) {
    const sc = matchScore(words, s(r.stem).slice(0, 300));
    if (sc) hits.push({ kind: "QUESTION", id: s(r.id), title: s(r.stem).replace(/\s+/g, " ").slice(0, 120), sub: skillName.get(s(r.skillId)) ?? "", href: `/teacher/preview?skillId=${s(r.skillId)}`, assignHref: teacher ? `/teacher/skill-assign?skillId=${s(r.skillId)}` : null, score: sc });
  }

  // the platform's own pages
  for (const p of navItemsFor(s(actor.role))) { const sc = matchScore(words, p.label, p.href.replace(/[/-]/g, " ")); if (sc) hits.push({ kind: "PAGE", id: p.href, title: `${p.icon ?? ""} ${p.label}`.trim(), sub: p.href, href: p.href, assignHref: null, score: sc }); }

  const groups = GROUPS.map((g) => ({ kind: g.kind, label: g.label, icon: g.icon, hits: hits.filter((h) => h.kind === g.kind).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, g.max) })).filter((g) => g.hits.length);
  return { q, total: groups.reduce((t, g) => t + g.hits.length, 0), groups };
}
