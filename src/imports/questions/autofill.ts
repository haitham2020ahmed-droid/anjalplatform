/**
 * ✨ Import with empty columns: the platform completes the grade, the skill and the standard by rules (pure, no
 * database); what the rules cannot decide surely is marked for the platform's AI, which completes it after the
 * import (answer, explanation, skill). See question-import.ts (analyze) and ai/complete.ts.
 */
import { areaFromCcss, areaFromName, areaFromText, parseCcss, type AreaKey } from "../../server/map/nwea-area";
import { shortStandard, type CurriculumIndex, type SkillRef } from "./template";

const words = (x: string) => new Set(x.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const STOP = new Set(["the", "and", "for", "with", "that", "this", "which", "what", "from", "word", "words", "sentence", "read", "text", "passage", "question", "best", "most", "does", "how", "why"]);
const overlap = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
const UNCLASSIFIED = /unclassified/i;
/** ⚡ the words of a skill's name and code, worked out once per skill */
const skillWordCache = new WeakMap<SkillRef, Set<string>>();
const skillWords = (k: SkillRef) => { let w = skillWordCache.get(k); if (!w) skillWordCache.set(k, (w = words(`${k.name} ${k.code}`))); return w; };

/** ⚡ lower-case skill code / name → the grades that have it, built once per index (not once per row) */
const gradeKeyCache = new WeakMap<CurriculumIndex, Map<string, Set<number>>>();
function gradesByKey(idx: CurriculumIndex): Map<string, Set<number>> {
  let m = gradeKeyCache.get(idx);
  if (m) return m;
  m = new Map();
  for (const [g, list] of idx.grades) for (const s of list) for (const key of [s.code.toLowerCase(), s.name.toLowerCase()]) { const set = m.get(key); if (set) set.add(g); else m.set(key, new Set([g])); }
  gradeKeyCache.set(idx, m);
  return m;
}

/** The grade of a row with an empty Grade: its standard (RL.5.2 → 5), else a skill of that exact name/code in one grade. */
export function gradeFromRow(idx: CurriculumIndex, cells: { standard?: string; skill?: string }): number | null {
  const c = parseCcss(cells.standard);
  if (c && idx.grades.has(c.grade)) return c.grade;
  const k = String(cells.skill ?? "").trim().toLowerCase();
  if (k) {
    const hits = gradesByKey(idx).get(k);
    if (hits?.size === 1) return [...hits][0];
  }
  return idx.grades.size === 1 ? [...idx.grades.keys()][0] : null;
}

const skillArea = (s: SkillRef): AreaKey | null => { for (const st of s.standards) { const c = parseCcss(st.code); const a = c ? areaFromCcss(c) : null; if (a) return a; } return null; };

/**
 * A skill of the grade for a row whose Skill is empty or unknown: the skills linked to its standard (or the
 * standard's parent, L.4.1.f → L.4.1), else the skills of its MAP area (from the Domain / MAP column or the
 * wording); among them the one whose name shares the most words with the row's skill text and question.
 * `sure` = chosen by the standard (else the AI is asked to check it).
 */
export function pickSkill(idx: CurriculumIndex, grade: number, row: { skill?: string; standard?: string; stem: string; domain?: string; mapArea?: string; options?: string[]; passage?: string | null }): { skill: SkillRef; how: string; sure: boolean } | null {
  const skills = (idx.grades.get(grade) ?? []).filter((s) => !UNCLASSIFIED.test(s.name));
  if (!skills.length) return null;
  const want = words(`${row.skill ?? ""} ${row.skill ?? ""} ${row.stem}`);
  const best = (list: SkillRef[]) => [...list].sort((a, b) => overlap(skillWords(b), want) - overlap(skillWords(a), want) || a.name.localeCompare(b.name))[0];
  const std = row.standard ? shortStandard(row.standard) : "";
  if (std) {
    const parent = std.replace(/^([A-Z]+\.\d+\.\d+)\..*$/, "$1");
    const linked = skills.filter((s) => s.standards.some((x) => { const c = shortStandard(x.code); return c === std || c === parent; }));
    if (linked.length) return { skill: best(linked), how: `linked to ${std}`, sure: linked.length === 1 || overlap(words(best(linked).name), want) > 0 };
  }
  const area = areaFromName(row.mapArea) ?? areaFromName(row.domain) ?? (parseCcss(row.standard) ? areaFromCcss(parseCcss(row.standard)!) : null) ?? areaFromText({ stem: row.stem, options: row.options, passage: row.passage, grade })?.area ?? null;
  const inArea = area ? skills.filter((s) => skillArea(s) === area) : [];
  if (inArea.length) return { skill: best(inArea), how: `closest skill of the ${area} area`, sure: false };
  const named = best(skills);
  return overlap(words(named.name), want) > 0 ? { skill: named, how: "closest skill name", sure: false } : null;
}
