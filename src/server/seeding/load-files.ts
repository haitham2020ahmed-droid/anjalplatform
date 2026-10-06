/** Reads the committed seed data files (used by the Prisma seeds and the offline verification). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GradeFile, Taxonomy } from "../../imports/curriculum/plan";
import type { BankItem, BankPassage } from "../../imports/questions/validate";
import type { CurriculumInput } from "./curriculum";

const read = <T>(root: string, rel: string): T => JSON.parse(readFileSync(join(root, rel), "utf8")) as T;

export function loadCurriculumInput(root: string, schoolCode: string, schoolName: string): CurriculumInput {
  return {
    schoolCode,
    schoolName,
    taxonomy: read<Taxonomy>(root, "data/curriculum/taxonomy.json"),
    grades: [4, 5, 6].map((g) => read<GradeFile>(root, `data/curriculum/grade-${g}.json`)),
    officialStandards: read<Record<string, string>>(root, "data/curriculum/ccss-standards.json"),
    ixlRefs: read(root, "data/curriculum/ixl-reference.json"),
  };
}

export function loadBank(root: string): { passages: BankPassage[]; items: BankItem[] } {
  return read(root, "data/questions/bank.json");
}
