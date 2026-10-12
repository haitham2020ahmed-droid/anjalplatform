/**
 * 👀 "Preview as student" before sending a test (Assessments → New test).
 *
 * The builder saves the test's questions as a short-lived preview (a TestTemplate row of type TEST_PREVIEW — no
 * database change; never listed among templates or drafts) and opens it in the existing preview page
 * (/teacher/preview?test=<id>), which marks it as opened. Assign is refused on the server until the teacher has
 * opened a preview of exactly these questions (same fingerprint) in the last day.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { testFingerprint } from "../../lib/test-fingerprint";
import type { LevelMode, Versions } from "./assessments";
import { assertNoDuplicateQuestions, MAX_PICKS } from "./map-source";

export const STUDENT_PREVIEW = "TEST_PREVIEW";
/** a preview counts for a day */
export const PREVIEW_VALID_MS = 24 * 3600_000;
/** previews kept per teacher (older ones are cleared) */
const KEEP = 20;
const s = (v: unknown) => String(v ?? "");
export const PREVIEW_FIRST = "Open “Preview as student” first: check the test as your students will see it, then assign it.";

interface PreviewSpec { kind: typeof STUDENT_PREVIEW; levelMode: LevelMode; questions: Versions; fingerprint: string; openedAt: string | null }
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };

function staff(actor: Actor): void {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can build tests.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
}

function cleanVersions(levelMode: LevelMode, q: Versions): Versions {
  const keys = levelMode === "LEVEL" ? (["BELOW", "ON", "ABOVE"] as const) : (["SAME"] as const);
  return Object.fromEntries(keys.map((k) => [k, (Array.isArray(q?.[k]) ? q[k]! : []).map(s).filter(Boolean).slice(0, MAX_PICKS)]));
}

/** Saves the test as a preview and returns its id (open /teacher/preview?test=<id>). */
export async function saveStudentPreview(repo: Repo, actor: Actor, input: { title: string; levelMode: LevelMode; questions: Versions }, now = new Date()): Promise<string> {
  staff(actor);
  assertCan(actor, "questions:read");
  const levelMode: LevelMode = input?.levelMode === "LEVEL" ? "LEVEL" : "SAME";
  const questions = cleanVersions(levelMode, input?.questions ?? {});
  if (!Object.values(questions).some((l) => l && l.length)) throw new ValidationError("The test has no questions yet.");
  for (const l of Object.values(questions)) await assertNoDuplicateQuestions(repo, l ?? []);
  const spec: PreviewSpec = { kind: STUDENT_PREVIEW, levelMode, questions, fingerprint: testFingerprint(questions), openedAt: null };
  const row = await repo.create("TestTemplate", { schoolId: actor.schoolId, createdById: actor.userId, title: s(input?.title).trim().slice(0, 150) || "Test", testType: STUDENT_PREVIEW, spec, createdAt: now, updatedAt: now });
  const mine = await repo.findMany("TestTemplate", { createdById: actor.userId, testType: STUDENT_PREVIEW, deletedAt: null }, { select: ["id"], orderBy: [{ field: "createdAt", dir: "desc" }] });
  if (mine.length > KEEP) await repo.updateMany("TestTemplate", { id: { in: mine.slice(KEEP).map((r) => s(r.id)) } }, { deletedAt: now });
  return s(row.id);
}

/** Opens a saved preview (the teacher's own only) and marks it as seen. */
export async function openStudentPreview(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<{ title: string; levelMode: LevelMode; questions: Versions }> {
  staff(actor);
  const t = await repo.findUnique("TestTemplate", { id: s(id) });
  if (!t || t.deletedAt || t.testType !== STUDENT_PREVIEW || s(t.createdById) !== actor.userId) throw new ForbiddenError("Preview not found.");
  const spec = json<PreviewSpec>(t.spec, { kind: STUDENT_PREVIEW, levelMode: "SAME", questions: {}, fingerprint: "", openedAt: null });
  if (!spec.openedAt) await repo.updateMany("TestTemplate", { id: t.id }, { spec: { ...spec, openedAt: now.toISOString() }, updatedAt: now });
  return { title: s(t.title), levelMode: spec.levelMode === "LEVEL" ? "LEVEL" : "SAME", questions: spec.questions ?? {} };
}

/** Assign rule: the teacher opened "Preview as student" for exactly these questions (order may change) in the last day. */
export async function assertPreviewedAsStudent(repo: Repo, actor: Actor, input: { levelMode: LevelMode; questions: Versions }, now = new Date()): Promise<void> {
  staff(actor);
  const fp = testFingerprint(cleanVersions(input?.levelMode === "LEVEL" ? "LEVEL" : "SAME", input?.questions ?? {}));
  const rows = await repo.findMany("TestTemplate", { createdById: actor.userId, testType: STUDENT_PREVIEW, deletedAt: null }, { select: ["spec"], orderBy: [{ field: "createdAt", dir: "desc" }], take: KEEP });
  const ok = rows.some((r) => {
    const sp = json<PreviewSpec>(r.spec, { kind: STUDENT_PREVIEW, levelMode: "SAME", questions: {}, fingerprint: "", openedAt: null });
    return sp.fingerprint === fp && sp.openedAt && now.getTime() - new Date(sp.openedAt).getTime() < PREVIEW_VALID_MS;
  });
  if (!fp || !ok) throw new ValidationError(PREVIEW_FIRST);
}
