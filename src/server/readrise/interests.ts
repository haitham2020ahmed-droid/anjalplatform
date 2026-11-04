/**
 * ❤️ ReadRise interests: up to 3 article topics a student likes (asked once on the ReadRise page, changeable later).
 * The recommendations (recommend.ts) pick "❤️ You like: <topic>" articles from them.
 *
 * Storage (no schema change): one SchoolSetting row per student, key `readrise.interests:<studentId>`, value
 * { topics: string[], at: ISO } — the same per-entity key pattern the platform already uses in SchoolSetting
 * (per skill, per class). Read with the unique (schoolId, key) index; the Student row gives the school.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { visibleArticles } from "./student";

const s = (v: unknown) => String(v ?? "");
export const MAX_INTERESTS = 3;
export const interestsKey = (studentId: string) => `readrise.interests:${studentId}`;

/** The stored topics of a stored value ({ topics } or a bare array). */
function topicsOf(v: unknown): string[] {
  let o = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { o = null; } }
  const list = Array.isArray(o) ? o : o && typeof o === "object" && Array.isArray((o as { topics?: unknown }).topics) ? (o as { topics: unknown[] }).topics : [];
  return [...new Set(list.map((x) => s(x).trim()).filter(Boolean))].slice(0, MAX_INTERESTS);
}

async function schoolOf(repo: Repo, studentId: string): Promise<string | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  return st && !st.deletedAt ? s(st.schoolId) || null : null;
}

/** The student's chosen topics ([] = not chosen yet). */
export async function getInterests(repo: Repo, studentId: string): Promise<string[]> {
  const schoolId = await schoolOf(repo, studentId);
  if (!schoolId) return [];
  const row = await repo.findUnique("SchoolSetting", { schoolId, key: interestsKey(studentId) });
  return row ? topicsOf(row.value) : [];
}

/** A student saves their topics (max 3, each one an existing topic of the articles they can read). */
export async function setInterests(repo: Repo, actor: Actor, topics: string[]): Promise<void> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Only students choose their topics.");
  const want = [...new Set((topics ?? []).map((x) => s(x).trim()).filter(Boolean))];
  if (want.length > MAX_INTERESTS) throw new ValidationError("Pick up to 3 topics.");
  const known = new Map((await visibleArticles(repo, actor.schoolId)).map((a) => [s(a.topic).trim().toLowerCase(), s(a.topic).trim()]));
  const clean = want.map((x) => known.get(x.toLowerCase()));
  if (clean.some((x) => !x)) throw new ValidationError("Pick topics from the list.");
  const value = { topics: clean as string[], at: new Date().toISOString() };
  const key = interestsKey(actor.studentId);
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key }, { schoolId: actor.schoolId, key, value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
}
