/**
 * Lexile bands for Below / On / Above Level, per grade.
 * Source: Common Core State Standards, Appendix A supplement “New Research on Text Complexity” (CCSSO/NGA 2012),
 * text-complexity (“stretch”) Lexile bands: Grades 4–5 740L–1010L, Grades 6–8 925L–1185L (MetaMetrics).
 * Each grade's On Level is its part of the band (4–5 split in half; 6–8 in thirds); below it = Below Level,
 * above it = Above Level. Schools can change them (Student levels page).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";

export type Level = "ABOVE" | "ON" | "BELOW";
export interface LexileBand { onMin: number; onMax: number }
export const LEXILE_SOURCE = "CCSS Appendix A (2012) text-complexity Lexile bands: Grades 4–5 740L–1010L, Grades 6–8 925L–1185L";
export const DEFAULT_LEXILE_BANDS: Record<number, LexileBand> = { 4: { onMin: 740, onMax: 875 }, 5: { onMin: 875, onMax: 1010 }, 6: { onMin: 925, onMax: 1010 } };
const KEY = "lexile.bands";

export async function lexileBands(repo: Repo, schoolId: string | null): Promise<Record<number, LexileBand>> {
  if (!schoolId) return DEFAULT_LEXILE_BANDS;
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return { ...DEFAULT_LEXILE_BANDS, ...((v && typeof v === "object" ? v : {}) as Record<number, LexileBand>) };
}

export const levelForLexile = (band: LexileBand | undefined, lexile: number | null | undefined): Level | null =>
  band && lexile !== null && lexile !== undefined && Number.isFinite(lexile) ? (lexile < band.onMin ? "BELOW" : lexile > band.onMax ? "ABOVE" : "ON") : null;

export async function setLexileBands(repo: Repo, actor: Actor, bands: Record<number, LexileBand>, now = new Date()): Promise<void> {
  assertCan(actor, "settings:school");
  for (const [g, b] of Object.entries(bands)) {
    if (!(b.onMin >= 0 && b.onMax <= 2000 && b.onMin < b.onMax)) throw new ValidationError(`Grade ${g}: the On Level range must go from a lower to a higher Lexile (0–2000).`);
  }
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: KEY }, { value: bands, updatedById: actor.userId, updatedAt: now }, { value: bands, updatedById: actor.userId, updatedAt: now });
}
