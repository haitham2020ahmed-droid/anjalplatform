/**
 * ⚡ ReadRise answer keys: per article, every question's band, number, correct letter and skill. Article questions
 * only change on an import, so the rows are kept in memory per data source while no write to RRQuestion has happened
 * in this process (and for at most a minute: another process may import). Only the articles not in memory yet are
 * read (batched with `in`). Rows are shared: callers never change them.
 */
import type { Repo } from "../seeding/repo";
import { modelVersion } from "../cache/bank-version";
import { sweptWeakValue } from "../cache/idle";

export interface KeyRow { band: string; number: number; answer: string; skill: string }

const TTL = 60_000, MAX_ARTICLES = 5000, CHUNK = 500;
const cache = sweptWeakValue<{ v: string; at: number; rows: Map<string, KeyRow[]> }>("readrise.question-key.cache", 15 * 60_000);

export async function questionKeys(repo: Repo, articleIds: string[]): Promise<Map<string, KeyRow[]>> {
  const ids = [...new Set(articleIds.map(String))];
  const v = modelVersion("RRQuestion");
  let c = cache.get(repo);
  if (!c || c.v !== v || Date.now() - c.at > TTL || c.rows.size > MAX_ARTICLES) cache.set(repo, (c = { v, at: Date.now(), rows: new Map() }));
  const store = c.rows;
  const need = ids.filter((id) => !store.has(id));
  for (let i = 0; i < need.length; i += CHUNK) {
    const part = need.slice(i, i + CHUNK);
    const got = new Map<string, KeyRow[]>(part.map((id) => [id, []]));
    for (const q of await repo.findMany("RRQuestion", { articleId: { in: part } }, { select: ["articleId", "band", "number", "answer", "skill"] }))
      got.get(String(q.articleId))?.push({ band: String(q.band ?? ""), number: Number(q.number), answer: String(q.answer ?? ""), skill: String(q.skill ?? "") });
    for (const [id, rows] of got) store.set(id, rows);
  }
  return new Map(ids.map((id) => [id, store.get(id) ?? []]));
}
