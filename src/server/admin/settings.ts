/**
 * School settings (Phase 11).
 *
 *  Engine       adaptive + mastery overrides (settings:engine). Every adaptive value has
 *               a safe range; mastery values go through resolveEngineConfig (bands strictly
 *               increasing, weights sum to 1). Only overrides are stored; "reset" removes them.
 *  Branding     Arabic school name and logo for reports (settings:school). The logo is
 *               validated (real PNG/JPEG/SVG, ≤ 1 MB, no SVG scripts), saved under a
 *               content-hash name in the branding folder, and School.logoUrl points to it.
 *  Calendar     academic years and terms (settings:school): dates in order, terms inside
 *               their year and not overlapping, exactly one current year.
 *  Classes      create / rename / archive classes (classes:manage).
 * All changes are audited with before/after values.
 */
import { createHash } from "node:crypto";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY, resolveEngineConfig, type AdaptiveConfig, type MasteryThresholds } from "../../config/engine";
import { validateLogo } from "../../reports/logo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { BRANDING_KEY } from "../reports/service";
import type { Repo, Row } from "../seeding/repo";
import { cleanName, schoolOf } from "./users";

const asObj = (v: unknown): Record<string, unknown> => {
  if (typeof v === "string") {
    try { return JSON.parse(v) as Record<string, unknown>; } catch { return {}; }
  }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
};

async function getSetting(repo: Repo, schoolId: string, key: string): Promise<Record<string, unknown>> {
  return asObj((await repo.findMany("SchoolSetting", { schoolId, key }))[0]?.value);
}

async function putSetting(repo: Repo, actor: Actor, schoolId: string, key: string, value: Record<string, unknown> | null, now: Date): Promise<void> {
  const before = await getSetting(repo, schoolId, key);
  if (value === null || Object.keys(value).length === 0) await repo.deleteMany("SchoolSetting", { schoolId, key });
  else await repo.upsert("SchoolSetting", { schoolId, key }, { value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "settings.update", entityType: "SchoolSetting", entityId: `${schoolId}:${key}`, before, after: value ?? {}, at: now });
}

// ------------------------------------------------------------------ engine

/** Allowed range for every adaptive setting; values outside are refused, never clamped. */
export const ADAPTIVE_LIMITS: Record<keyof AdaptiveConfig, { min: number; max: number; int?: boolean; label: string }> = {
  model: { min: 1, max: 3, int: true, label: "IRT model (1 Rasch, 2 2PL, 3 3PL)" },
  thetaMin: { min: -6, max: -2, label: "Lowest ability" },
  thetaMax: { min: 2, max: 6, label: "Highest ability" },
  priorMean: { min: -2, max: 2, label: "Starting ability" },
  priorSD: { min: 0.3, max: 3, label: "Starting uncertainty" },
  maxThetaStep: { min: 0.05, max: 1.5, label: "Largest ability change per answer" },
  maxTargetStep: { min: 0.05, max: 1.5, label: "Largest difficulty change between questions" },
  practiceTargetP: { min: 0.5, max: 0.9, label: "Target success rate in practice" },
  diagnosticTargetP: { min: 0.4, max: 0.7, label: "Target success rate in placement" },
  prereqRouteAfterWrong: { min: 2, max: 10, int: true, label: "Wrong answers before prerequisite practice" },
  recentWindow: { min: 3, max: 30, int: true, label: "Recent answers window" },
  rapidGuessMinMs: { min: 500, max: 10_000, int: true, label: "Rapid guess: minimum time (ms)" },
  rapidGuessFraction: { min: 0.05, max: 0.5, label: "Rapid guess: fraction of expected time" },
  rapidGuessWeight: { min: 0, max: 1, label: "Weight of a rapid guess" },
  hintWeight: { min: 0, max: 1, label: "Weight of an answer after a hint" },
  noRepeatWindow: { min: 0, max: 50, int: true, label: "Questions before one may repeat" },
  topK: { min: 1, max: 10, int: true, label: "Random choice among the best questions" },
};

export interface EngineSettings {
  adaptive: AdaptiveConfig;
  mastery: MasteryThresholds;
  overrides: { adaptive: Partial<AdaptiveConfig>; mastery: Partial<MasteryThresholds> };
}

export async function getEngineSettings(repo: Repo, actor: Actor): Promise<EngineSettings> {
  assertCan(actor, "settings:engine");
  const schoolId = schoolOf(actor);
  const a = (await getSetting(repo, schoolId, "adaptive.engine")) as Partial<AdaptiveConfig>;
  const m = (await getSetting(repo, schoolId, "mastery.thresholds")) as Partial<MasteryThresholds>;
  return { ...resolveEngineConfig(a, m), overrides: { adaptive: a, mastery: m } };
}

export function validateAdaptive(input: Record<string, unknown>): Partial<AdaptiveConfig> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const lim = ADAPTIVE_LIMITS[k as keyof AdaptiveConfig];
    if (!lim) throw new ValidationError(`Unknown setting "${k}".`);
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < lim.min || n > lim.max || (lim.int && !Number.isInteger(n))) throw new ValidationError(`${lim.label} must be ${lim.int ? "a whole number " : ""}between ${lim.min} and ${lim.max}.`);
    if (n !== DEFAULT_ADAPTIVE[k as keyof AdaptiveConfig]) out[k] = n; // store only real overrides
  }
  const merged = { ...DEFAULT_ADAPTIVE, ...out };
  if (merged.thetaMin >= merged.priorMean || merged.priorMean >= merged.thetaMax) throw new ValidationError("Starting ability must lie between the lowest and highest ability.");
  return out as Partial<AdaptiveConfig>;
}

export function validateMastery(input: Partial<MasteryThresholds>): Partial<MasteryThresholds> {
  const num = (v: unknown, lo: number, hi: number, label: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new ValidationError(`${label} must be between ${lo} and ${hi}.`);
    return n;
  };
  const out: Partial<MasteryThresholds> = {};
  if (input.bands) out.bands = Object.fromEntries(Object.entries({ ...DEFAULT_MASTERY.bands, ...input.bands }).map(([k, v]) => [k, num(v, 0, 100, `Band "${k}"`)])) as MasteryThresholds["bands"];
  if (input.weights) out.weights = Object.fromEntries(Object.entries({ ...DEFAULT_MASTERY.weights, ...input.weights }).map(([k, v]) => [k, num(v, 0, 1, `Weight "${k}"`)])) as MasteryThresholds["weights"];
  const scalars: [keyof MasteryThresholds, number, number][] = [
    ["minAttemptsForProficient", 1, 50], ["minAttemptsForMastered", 1, 100], ["minLevelReachedForMastered", 1, 7], ["minRecentAccuracyForMastered", 0.5, 1],
    ["evidenceScale", 1, 50], ["decayAfterDays", 1, 365], ["decayPerWeek", 0, 20], ["decayFloor", 0, 1],
  ];
  for (const [k, lo, hi] of scalars) if (input[k] !== undefined && input[k] !== null && (input[k] as unknown) !== "") (out as Record<string, unknown>)[k] = num(input[k], lo, hi, k);
  try {
    resolveEngineConfig({}, out);
  } catch (e) {
    throw new ValidationError((e as Error).message);
  }
  if ((out.minAttemptsForMastered ?? DEFAULT_MASTERY.minAttemptsForMastered) < (out.minAttemptsForProficient ?? DEFAULT_MASTERY.minAttemptsForProficient)) throw new ValidationError("Mastered needs at least as many answers as Proficient.");
  return out;
}

export async function updateEngineSettings(repo: Repo, actor: Actor, input: { adaptive?: Record<string, unknown>; mastery?: Partial<MasteryThresholds>; reset?: boolean }, now = new Date()): Promise<EngineSettings> {
  assertCan(actor, "settings:engine");
  const schoolId = schoolOf(actor);
  if (input.reset) {
    await putSetting(repo, actor, schoolId, "adaptive.engine", null, now);
    await putSetting(repo, actor, schoolId, "mastery.thresholds", null, now);
  } else {
    if (input.adaptive) await putSetting(repo, actor, schoolId, "adaptive.engine", validateAdaptive(input.adaptive) as Record<string, unknown>, now);
    if (input.mastery) await putSetting(repo, actor, schoolId, "mastery.thresholds", validateMastery(input.mastery) as Record<string, unknown>, now);
  }
  return getEngineSettings(repo, actor);
}

// ---------------------------------------------------------------- branding

export async function getBranding(repo: Repo, actor: Actor): Promise<{ name: string; nameAr: string | null; logoUrl: string | null }> {
  assertCan(actor, "settings:school");
  const schoolId = schoolOf(actor);
  const school = (await repo.findUnique("School", { id: schoolId }))!;
  const b = await getSetting(repo, schoolId, BRANDING_KEY);
  return { name: String(school.name), nameAr: typeof b.nameAr === "string" ? b.nameAr : null, logoUrl: school.logoUrl ? String(school.logoUrl) : null };
}

export async function updateBranding(repo: Repo, actor: Actor, input: { nameAr: string | null }, now = new Date()): Promise<void> {
  assertCan(actor, "settings:school");
  const schoolId = schoolOf(actor);
  const nameAr = input.nameAr && input.nameAr.trim() ? cleanName(input.nameAr, "Arabic school name", 120) : null;
  const current = await getSetting(repo, schoolId, BRANDING_KEY);
  const next = { ...current };
  if (nameAr) next.nameAr = nameAr;
  else delete next.nameAr;
  await putSetting(repo, actor, schoolId, BRANDING_KEY, next, now);
}

/** Validate and store a logo; returns the stored file name (School.logoUrl). */
export async function uploadLogo(repo: Repo, actor: Actor, bytes: Uint8Array, brandingDir: string, now = new Date()): Promise<string> {
  assertCan(actor, "settings:school");
  const schoolId = schoolOf(actor);
  const v = validateLogo(bytes);
  if (!v.ok) throw new ValidationError(v.reason);
  void brandingDir; // kept for callers: the logo is stored in the database (the server disk is wiped on every deploy)
  const sha = createHash("sha256").update(bytes).digest("hex");
  await repo.deleteMany("SchoolAsset", { schoolId, kind: "LOGO" });
  const asset = await repo.create("SchoolAsset", { schoolId, kind: "LOGO", mime: v.logo.mime, bytes: Buffer.from(bytes), sha256: sha, createdAt: now });
  const name = `db:${String(asset.id)}`;
  const before = (await repo.findUnique("School", { id: schoolId }))!.logoUrl ?? null;
  await repo.updateMany("School", { id: schoolId }, { logoUrl: name });
  await audit(repo, { actorId: actor.userId, action: "school.logo.update", entityType: "School", entityId: schoolId, before: { logoUrl: before }, after: { logoUrl: name, bytes: bytes.length, mime: v.logo.mime }, at: now });
  return name;
}

export async function removeLogo(repo: Repo, actor: Actor, now = new Date()): Promise<void> {
  assertCan(actor, "settings:school");
  const schoolId = schoolOf(actor);
  const before = (await repo.findUnique("School", { id: schoolId }))!.logoUrl ?? null;
  await repo.updateMany("School", { id: schoolId }, { logoUrl: null });
  await repo.deleteMany("SchoolAsset", { schoolId, kind: "LOGO" });
  await audit(repo, { actorId: actor.userId, action: "school.logo.remove", entityType: "School", entityId: schoolId, before: { logoUrl: before }, at: now });
}

// ---------------------------------------------------------------- calendar

const day = (s: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new ValidationError(`${label} must be a date (YYYY-MM-DD).`);
  return new Date(`${s}T00:00:00Z`);
};
const endOfDay = (d: Date) => new Date(d.getTime() + 86_400_000 - 1);

export interface YearInput {
  name: string;
  start: string;
  end: string;
  isCurrent: boolean;
  terms: { name: string; start: string; end: string }[];
}

/** Create or replace an academic year (by name) and its terms. */
export async function saveAcademicYear(repo: Repo, actor: Actor, input: YearInput, now = new Date()): Promise<string> {
  assertCan(actor, "settings:school");
  const schoolId = schoolOf(actor);
  const name = cleanName(input.name, "Year name", 40);
  const start = day(input.start, "Year start"), end = endOfDay(day(input.end, "Year end"));
  if (start >= end) throw new ValidationError("The year must start before it ends.");
  if (end.getTime() - start.getTime() > 400 * 86_400_000) throw new ValidationError("An academic year cannot be longer than 13 months.");
  const terms = input.terms.map((t, i) => ({ name: cleanName(t.name, `Term ${i + 1} name`, 40), start: day(t.start, `Term ${i + 1} start`), end: endOfDay(day(t.end, `Term ${i + 1} end`)) })).sort((a, b) => a.start.getTime() - b.start.getTime());
  if (new Set(terms.map((t) => t.name.toLowerCase())).size !== terms.length) throw new ValidationError("Term names must be different.");
  terms.forEach((t, i) => {
    if (t.start >= t.end) throw new ValidationError(`${t.name} must start before it ends.`);
    if (t.start < start || t.end > end) throw new ValidationError(`${t.name} must lie inside the academic year.`);
    if (i > 0 && t.start <= terms[i - 1].end) throw new ValidationError(`${terms[i - 1].name} and ${t.name} overlap.`);
  });
  const existing = (await repo.findMany("AcademicYear", { schoolId, name }))[0];
  const id = await repo.transaction(async (tx) => {
    if (input.isCurrent) await tx.updateMany("AcademicYear", { schoolId }, { isCurrent: false });
    const y = existing
      ? (await tx.updateMany("AcademicYear", { id: existing.id }, { startDate: start, endDate: end, isCurrent: input.isCurrent }), existing)
      : await tx.create("AcademicYear", { schoolId, name, startDate: start, endDate: end, isCurrent: input.isCurrent });
    await tx.deleteMany("Term", { academicYearId: y.id });
    for (const t of terms) await tx.create("Term", { academicYearId: y.id, name: t.name, startDate: t.start, endDate: t.end });
    return String(y.id);
  });
  await audit(repo, {
    actorId: actor.userId, action: existing ? "calendar.year.update" : "calendar.year.create", entityType: "AcademicYear", entityId: id,
    before: existing ? { start: existing.startDate, end: existing.endDate, isCurrent: existing.isCurrent } : null,
    after: { name, start: input.start, end: input.end, isCurrent: input.isCurrent, terms: input.terms }, at: now,
  });
  return id;
}

export async function listAcademicYears(repo: Repo, actor: Actor): Promise<{ id: string; name: string; start: string; end: string; isCurrent: boolean; terms: { name: string; start: string; end: string }[] }[]> {
  assertCan(actor, "settings:school");
  const years = await repo.findMany("AcademicYear", { schoolId: schoolOf(actor) });
  const terms = years.length ? await repo.findMany("Term", { academicYearId: { in: years.map((y) => y.id) } }) : [];
  const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString().slice(0, 10);
  return years
    .map((y) => ({
      id: String(y.id), name: String(y.name), start: iso(y.startDate), end: iso(y.endDate), isCurrent: Boolean(y.isCurrent),
      terms: terms.filter((t) => t.academicYearId === y.id).map((t) => ({ name: String(t.name), start: iso(t.startDate), end: iso(t.endDate) })).sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => b.start.localeCompare(a.start));
}

// ----------------------------------------------------------------- classes

const CLASS_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,19}$/u;

export async function createClass(repo: Repo, actor: Actor, input: { name: string; gradeLevel: number; academicYearId?: string }, now = new Date()): Promise<string> {
  assertCan(actor, "classes:manage");
  const schoolId = schoolOf(actor);
  const name = String(input.name ?? "").trim();
  if (!CLASS_NAME.test(name)) throw new ValidationError("Class names are 1–20 letters, digits, spaces, dots or dashes (e.g. 4A).");
  const grade = (await repo.findMany("Grade", { schoolId, level: Number(input.gradeLevel) }))[0];
  if (!grade) throw new ValidationError("Choose a grade that exists in this school.");
  const years = await repo.findMany("AcademicYear", { schoolId });
  const year = input.academicYearId ? years.find((y) => y.id === input.academicYearId) : years.find((y) => y.isCurrent);
  if (!year) throw new ValidationError("Set up the current academic year first.");
  const same = (await repo.findMany("Class", { academicYearId: year.id, name }))[0];
  if (same && !same.deletedAt) {
    // say which grade it is in, so the admin knows where to find it
    const g = await repo.findUnique("Grade", { id: same.gradeId });
    throw new ValidationError(`Class ${name} already exists in ${String(year.name)} (${String(g?.name ?? "another grade")}). Choose that grade to see it, or use another name.`);
  }
  if (same) {
    // an archived class with this name: bring it back (in the chosen grade) instead of refusing
    await repo.updateMany("Class", { id: same.id }, { deletedAt: null, gradeId: grade.id });
    await audit(repo, { actorId: actor.userId, action: "class.restore", entityType: "Class", entityId: String(same.id), after: { name, grade: input.gradeLevel, year: year.name }, at: now });
    return String(same.id);
  }
  const c = await repo.create("Class", { schoolId, gradeId: grade.id, academicYearId: year.id, name, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "class.create", entityType: "Class", entityId: String(c.id), after: { name, grade: input.gradeLevel, year: year.name }, at: now });
  return String(c.id);
}

export async function renameClass(repo: Repo, actor: Actor, classId: string, newName: string, now = new Date()): Promise<void> {
  assertCan(actor, "classes:manage");
  const c = await repo.findUnique("Class", { id: classId });
  if (!c || c.deletedAt || c.schoolId !== schoolOf(actor)) throw new ForbiddenError("Class not found.");
  const name = String(newName ?? "").trim();
  if (!CLASS_NAME.test(name)) throw new ValidationError("Class names are 1–20 letters, digits, spaces, dots or dashes (e.g. 4A).");
  const clash = (await repo.findMany("Class", { academicYearId: c.academicYearId, name })).find((x) => x.id !== classId);
  if (clash) throw new ValidationError(`Class ${name} already exists in this year.`);
  await repo.updateMany("Class", { id: classId }, { name });
  await audit(repo, { actorId: actor.userId, action: "class.rename", entityType: "Class", entityId: classId, before: { name: c.name }, after: { name }, at: now });
}

/** Archive (soft-delete) an empty class. Classes with current students cannot be archived. */
export async function archiveClass(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<void> {
  assertCan(actor, "classes:manage");
  const c = await repo.findUnique("Class", { id: classId });
  if (!c || c.deletedAt || c.schoolId !== schoolOf(actor)) throw new ForbiddenError("Class not found.");
  if (await repo.count("ClassMembership", { classId, leftAt: null })) throw new ValidationError("Move the students to another class first.");
  await repo.updateMany("Class", { id: classId }, { deletedAt: now });
  await audit(repo, { actorId: actor.userId, action: "class.archive", entityType: "Class", entityId: classId, before: { name: c.name }, at: now });
}

export type { Row };

/**
 * The logo shown in the app (header and sign-in page): the school's uploaded logo (stored in the
 * database), or null (the app then shows the built-in default logo). Before sign-in (no school known),
 * the first real school (not a demo/test school) with an uploaded logo.
 */
export async function schoolLogoFor(repo: Repo, schoolId: string | null): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const schools = schoolId ? [await repo.findUnique("School", { id: schoolId })].filter(Boolean) : (await repo.findMany("School", {})).filter((x) => !x.isDemo);
  const school = schools.find((x) => String(x!.logoUrl ?? "").startsWith("db:"));
  if (!school) return null;
  const asset = await repo.findUnique("SchoolAsset", { id: String(school.logoUrl).slice(3) });
  return asset ? { mime: String(asset.mime), bytes: new Uint8Array(asset.bytes as Uint8Array) } : null;
}
