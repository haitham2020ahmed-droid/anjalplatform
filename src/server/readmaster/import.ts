/**
 * ReadMaster import: one table, one row per question; the first row of each article/level also carries the
 * text (Passage) and its Lexile. Articles are matched by Article Code (new code = new article).
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { readRow, GENERIC_WRONG_FEEDBACK, type ColumnKey } from "../../imports/questions/template";
import { toCsv } from "../../imports/csv";
import { workbookXlsx } from "../../imports/questions/template-files";
import { addVersionQuestion, gradeSkills, saveArticle, saveVersion } from "./service";
import type { Level } from "../curriculum-map/lexile";

export const RM_HEADERS = ["Article Code", "Title", "Grade", "Skill", "Topic", "Level", "Lexile", "Passage", "Question Text", "Question Type", "Option A", "Option B", "Option C", "Option D", "Correct Answer", "Explanation"] as const;

const EX = (code: string, title: string, level: string, lexile: string, passage: string, q: string, a: string, b: string, c: string, d: string, why: string) =>
  [code, title, "4", "Central Idea and Relevant Details", "Science · Space", level, lexile, passage, q, "Multiple Choice", a, b, c, d, "A", why];
export function rmTemplateRows(): string[][] {
  return [
    [...RM_HEADERS],
    EX("SOLAR-01", "Our Solar System", "Below", "650", "The Sun is a star. It is at the center of our solar system. Eight planets move around the Sun. Earth is one of them. The planets close to the Sun are hot. The planets far away are very cold.", "What is this text mostly about?", "the Sun and the planets around it", "how to build a rocket", "why Earth has oceans", "the life of an astronaut", "The text tells about the Sun and the planets that move around it."),
    ["SOLAR-01", "", "", "", "", "Below", "", "", "Which planets are very cold?", "Multiple Choice", "the planets far from the Sun", "the planets close to the Sun", "only Earth", "the Sun", "A", "The text says the planets far away are very cold."],
    EX("SOLAR-01", "Our Solar System", "On", "820", "At the center of our solar system is the Sun, a medium-sized star. Eight planets travel around it in paths called orbits. The four inner planets, including Earth, are rocky and warm, while the four outer planets are giant worlds made mostly of gas and ice, far colder than anything on Earth.", "What is the central idea of the text?", "The Sun is at the center, with eight very different planets orbiting it.", "Gas giants are made of rock.", "Earth is the largest planet.", "Stars never move.", "Every detail supports the idea of the Sun and its eight orbiting planets."),
    EX("SOLAR-01", "Our Solar System", "Above", "960", "Our solar system is organized around the Sun, a medium-sized star whose gravity holds eight planets in elliptical orbits. Astronomers group the planets into two families: the terrestrial planets, compact rocky worlds near the Sun, and the gas and ice giants, enormous planets whose distance from the Sun leaves them in perpetual cold.", "Which statement best expresses the central idea?", "The Sun's gravity organizes eight planets that form two distinct families.", "Astronomers disagree about the Sun.", "Terrestrial planets are made of gas.", "The giants orbit closest to the Sun.", "The text explains how the Sun's gravity holds two groups of planets."),
  ];
}
export const rmTemplateCsv = () => "\ufeff" + toCsv(rmTemplateRows());
export const rmTemplateXlsx = () => workbookXlsx([
  { name: "ReadMaster", rows: rmTemplateRows(), widths: [12, 22, 6, 26, 16, 8, 8, 60, 40, 16, 22, 22, 22, 22, 9, 40], headerStyle: true, freeze: true },
  { name: "Instructions", widths: [110], rows: [["⭐ ReadMaster import"], ["One article = one Article Code, written at up to three levels (Below / On / Above): same topic and skill, different words and length."], ["The FIRST row of each level has the Passage and its Lexile; the next rows of that level only need the question columns."], ["Grade: 4, 5 or 6. Skill: a skill of that grade (or leave empty). Lexile: e.g. 650, 820, 960 (Below / On / Above for the grade)."], ["Question Type: Multiple Choice, Multi Select, True/False, Dropdown or Fill in the Blank. Correct Answer: the letter (A–D), True/False, or the word(s)."], ["Every question also goes to the Question Bank. Publish the article on the ReadMaster page when it is ready."]] },
]);

export interface RmImportResult { articles: number; versions: number; questions: number; errors: { row: number; message: string }[] }

export async function importReadMaster(repo: Repo, actor: Actor, table: string[][]): Promise<RmImportResult> {
  const at = table.findIndex((r) => r.some((c) => String(c ?? "").trim()));
  const head = (table[at] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  const col = (name: string) => head.indexOf(name.toLowerCase());
  if (col("article code") < 0 || col("level") < 0) return { articles: 0, versions: 0, questions: 0, errors: [{ row: 1, message: "The first row must be the template's header (Article Code, Title, Grade, …, Level, Lexile, Passage, …). Download the template." }] };
  const get = (r: string[], name: string) => (col(name) >= 0 ? String(r[col(name)] ?? "").trim() : "");
  const LV: Record<string, Level> = { below: "BELOW", on: "ON", above: "ABOVE" };
  const articleOf = new Map<string, string>(), versionOf = new Map<string, string>();
  const out: RmImportResult = { articles: 0, versions: 0, questions: 0, errors: [] };
  for (const a of await repo.findMany("ReadMasterArticle", { schoolId: actor.schoolId })) articleOf.set(String(a.code).toUpperCase(), String(a.id));
  for (let i = at + 1; i < table.length; i++) {
    const r = table[i].map((c) => String(c ?? "")); const row = i + 1;
    if (!r.some((c) => c.trim())) continue;
    try {
      const code = get(r, "Article Code").toUpperCase();
      if (!code) throw new Error("Article Code is empty.");
      const level = LV[get(r, "Level").toLowerCase().replace(/\s*level$/, "")];
      if (!level) throw new Error(`Level “${get(r, "Level")}” must be Below, On or Above.`);
      let articleId = articleOf.get(code);
      const grade = Number(get(r, "Grade"));
      if (!articleId || get(r, "Title")) {
        if (!articleId && !get(r, "Title")) throw new Error(`Article ${code} is new: write its Title and Grade on its first row.`);
        const skill = get(r, "Skill") && grade ? (await gradeSkills(repo, actor.schoolId!, grade)).find((k) => k.name.toLowerCase() === get(r, "Skill").toLowerCase()) : undefined;
        const id = await saveArticle(repo, actor, { id: articleId, code, title: get(r, "Title") || code, topic: get(r, "Topic") || null, grade: grade || 4, skillId: skill?.id ?? null, skillName: skill ? null : get(r, "Skill") || null });
        if (!articleId) out.articles++;
        articleId = id; articleOf.set(code, id);
      }
      const vKey = `${code}|${level}`;
      if (get(r, "Passage")) {
        versionOf.set(vKey, await saveVersion(repo, actor, articleId, level, { lexile: Number(get(r, "Lexile").replace(/l$/i, "")), body: get(r, "Passage") }));
        out.versions++;
      }
      if (!get(r, "Question Text")) continue;
      let versionId = versionOf.get(vKey);
      if (!versionId) { const v = (await repo.findMany("ReadMasterVersion", { articleId, level }))[0]; if (v) { versionId = String(v.id); versionOf.set(vKey, versionId); } }
      if (!versionId) throw new Error(`${code} has no ${level.toLowerCase()} text yet: put the Passage and Lexile on the first row of that level.`);
      const cells: Partial<Record<ColumnKey, string>> = { stem: get(r, "Question Text"), type: get(r, "Question Type") || "Multiple Choice", optA: get(r, "Option A"), optB: get(r, "Option B"), optC: get(r, "Option C"), optD: get(r, "Option D"), answer: get(r, "Correct Answer"), explanation: get(r, "Explanation"), grade: String(grade || 4) };
      const rr = readRow(cells, "CURRICULUM");
      if (rr.errors.length || !rr.question) throw new Error(rr.errors.join(" "));
      const q = rr.question;
      await addVersionQuestion(repo, actor, versionId, { type: q.type, stem: q.stem, whyCorrect: q.explanation, answer: q.answer, answers: q.answers, options: q.options?.map((o) => ({ ...o, rationale: o.correct ? null : o.rationale ?? GENERIC_WRONG_FEEDBACK })) });
      out.questions++;
    } catch (e) { out.errors.push({ row, message: (e as Error).message }); }
  }
  return out;
}
