/**
 * 📰 Round 7 (owner, live test): a student reads a VERSION of an article, and a version may have its own title
 * (600: "Honeybees: Busy Helpers") while the article's title is another ("Honeybees: Tiny Workers"). Teacher and
 * admin pages show the article title, plus "(read as: <version title> · 600L)" when the run's version title differs,
 * so a teacher can match what the student says they read. Student pages show the version title only.
 */
import type { Repo } from "../seeding/repo";
import { formatLevel } from "./level";

const s = (v: unknown) => String(v ?? "");
const keyOf = (articleId: string, level: number) => `${articleId}|${level}`;

/** The article title, with "(read as: <version title> · 600L)" when the version's own title differs (pure). */
export function readAsTitle(articleTitle: string, versionTitle: string | null | undefined, versionLevel: number | null | undefined): string {
  const a = s(articleTitle).trim(), v = s(versionTitle).trim();
  if (!v || v === a || versionLevel === null || versionLevel === undefined || !Number.isFinite(Number(versionLevel))) return a;
  return `${a} (read as: ${v} · ${formatLevel(Number(versionLevel))})`;
}

/** The version titles of the given articles (one read): `${articleId}|${level}` → title. */
export async function versionTitles(repo: Repo, articleIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(articleIds.map(String))];
  if (!ids.length) return new Map();
  const rows = await repo.findMany("RRVersion", { articleId: { in: ids } }, { select: ["articleId", "level", "title"] });
  return new Map(rows.map((r) => [keyOf(s(r.articleId), Number(r.level)), s(r.title)]));
}

/** The teacher-facing title of a run: the article title + "(read as …)" from the version titles map. */
export function runTitle(articleTitle: string, titles: ReadonlyMap<string, string>, articleId: string, versionLevel: unknown): string {
  const vl = versionLevel === null || versionLevel === undefined || versionLevel === "" ? null : Number(versionLevel);
  return readAsTitle(articleTitle, vl === null || !Number.isFinite(vl) ? null : titles.get(keyOf(articleId, vl)), vl);
}
