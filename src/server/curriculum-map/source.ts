/**
 * Reads data/curriculum-map/source.txt: the Curriculum Map exactly as the school wrote it.
 * Every name (units, text sets, selections, shared reads, genres, skills) is taken from that file
 * character for character (curly quotes ’ “ ” and unusual spellings included); nothing is retyped.
 * Any line the reader does not understand stops it with the line number (it never guesses).
 */
export type CategoryType = "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "RESPOND_TO_READING";
export type LevelName = "Above Level" | "On Level" | "Below Level";

export interface MapCategory { type: CategoryType; label: string; skills: string | null; levels: LevelName[] }
export interface MapSet { kind: "TEXT_SET" | "SELECTION"; number: number; title: string; heading: string; sharedRead: string | null; genre: string; categories: MapCategory[] }
export interface MapUnit { number: number; title: string; sets: MapSet[] }
export interface MapGrade { level: number; units: MapUnit[] }

const CATEGORY_TYPES: Record<string, CategoryType> = {
  "Concept Vocabulary": "CONCEPT_VOCABULARY", "Analyze Craft and Structure": "ANALYZE_CRAFT_AND_STRUCTURE", "Respond to Reading": "RESPOND_TO_READING",
};

export function parseCurriculumMap(text: string): MapGrade[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const grades: MapGrade[] = [];
  let grade: MapGrade | null = null, unit: MapUnit | null = null, set: MapSet | null = null, cat: MapCategory | null = null;
  let awaitingSkills = false;
  const fail = (i: number, why: string): never => { throw new Error(`Curriculum map, line ${i + 1}: ${why} → “${lines[i]}”`); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (awaitingSkills) {
      awaitingSkills = false;
      const m = t.match(/^\((.+)\)$/);
      if (m) { cat!.skills = m[1]; continue; }
    }
    if (!t || /^=+$/.test(t) || /^-{5,}$/.test(t) || /^GRADE \d+ CURRICULUM MAP$/.test(t)) continue;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^Grade (\d+)$/))) { grade = { level: Number(m[1]), units: [] }; grades.push(grade); unit = set = cat = null; continue; }
    if ((m = t.match(/^Unit (\d+)$/))) { if (!grade) fail(i, "unit before a grade"); unit = { number: Number(m[1]), title: t, sets: [] }; grade!.units.push(unit); set = cat = null; continue; }
    if ((m = t.match(/^(Text Set|Selection) (\d+): (.+)$/))) {
      if (!unit) fail(i, "text set before a unit");
      set = { kind: m[1] === "Text Set" ? "TEXT_SET" : "SELECTION", number: Number(m[2]), title: m[3], heading: t, sharedRead: null, genre: "", categories: [] };
      unit!.sets.push(set); cat = null; continue;
    }
    if ((m = t.match(/^Shared Read: (.+)$/))) { if (!set) fail(i, "shared read outside a text set"); set!.sharedRead = m[1]; continue; }
    if ((m = t.match(/^Genre: (.+)$/))) { if (!set) fail(i, "genre outside a text set"); set!.genre = m[1]; continue; }
    if ((m = t.match(/^([123])- (Concept Vocabulary|Analyze Craft and Structure|Respond to Reading)(?: \((.+)\))?$/))) {
      if (!set) fail(i, "category outside a text set");
      cat = { type: CATEGORY_TYPES[m[2]], label: `${m[1]}- ${m[2]}`, skills: m[3] ?? null, levels: [] };
      set!.categories.push(cat);
      if (!m[3] && cat.type === "ANALYZE_CRAFT_AND_STRUCTURE") awaitingSkills = true;   // skills on the next line
      continue;
    }
    if ((m = t.match(/^- (Above Level|On Level|Below Level)$/))) { if (!cat) fail(i, "level outside a category"); cat!.levels.push(m[1] as LevelName); continue; }
    fail(i, "line not understood");
  }
  return grades;
}
