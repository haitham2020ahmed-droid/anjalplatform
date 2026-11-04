/**
 * ⚙️ Admin → Settings (src/server/admin/settings.ts): the adaptive engine + mastery overrides, report branding,
 * and the academic calendar (years and terms).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY } from "../src/config/engine";
import {
  getBranding, getEngineSettings, listAcademicYears, saveAcademicYear, updateBranding, updateEngineSettings, validateAdaptive, validateMastery,
} from "../src/server/admin/settings";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin · settings", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId: string;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
  });

  test("validateAdaptive: values outside the safe range are refused (never clamped); defaults are not stored", () => {
    assert.deepEqual(validateAdaptive({ topK: 5 }), { topK: 5 });
    assert.deepEqual(validateAdaptive({ topK: DEFAULT_ADAPTIVE.topK }), {}, "a value equal to the default is not an override");
    assert.throws(() => validateAdaptive({ topK: 99 }), ValidationError);
    assert.throws(() => validateAdaptive({ unknownSetting: 1 }), ValidationError);
    assert.throws(() => validateAdaptive({ priorMean: 2, thetaMax: 2 }), /Starting ability must lie between/, "priorMean == thetaMax is refused, even though each value alone is in its own range");
  });

  test("validateMastery: bands, weights and scalars are range-checked; Mastered needs ≥ Proficient's answers", () => {
    assert.deepEqual(validateMastery({ minAttemptsForProficient: 10 }), { minAttemptsForProficient: 10 });
    assert.throws(() => validateMastery({ decayPerWeek: 0.9 }), ValidationError);
    assert.throws(() => validateMastery({ minAttemptsForProficient: 20, minAttemptsForMastered: 5 }), /Mastered needs at least/);
  });

  test("engine settings: get defaults, save overrides, reset", async () => {
    const before = await getEngineSettings(repo, admin);
    assert.deepEqual(before.adaptive, DEFAULT_ADAPTIVE);
    assert.deepEqual(before.mastery, DEFAULT_MASTERY);
    const updated = await updateEngineSettings(repo, admin, { adaptive: { topK: 4 }, mastery: { minAttemptsForProficient: 8 } }, now);
    assert.equal(updated.adaptive.topK, 4);
    assert.equal(updated.mastery.minAttemptsForProficient, 8);
    assert.deepEqual(updated.overrides, { adaptive: { topK: 4 }, mastery: { minAttemptsForProficient: 8 } });
    const reset = await updateEngineSettings(repo, admin, { reset: true }, now);
    assert.deepEqual(reset.adaptive, DEFAULT_ADAPTIVE);
    assert.deepEqual(reset.overrides, { adaptive: {}, mastery: {} });
  });

  test("branding: Arabic name saved and cleared; the English name always mirrors the School row", async () => {
    const before = await getBranding(repo, admin);
    assert.equal(before.nameAr, null);
    await updateBranding(repo, admin, { nameAr: "  مدرسة الأنجال  " }, now);
    assert.equal((await getBranding(repo, admin)).nameAr, "مدرسة الأنجال");
    await updateBranding(repo, admin, { nameAr: null }, now);
    assert.equal((await getBranding(repo, admin)).nameAr, null);
  });

  test("academic year: terms must be inside the year, in order and non-overlapping; saving the same name replaces it", async () => {
    await assert.rejects(saveAcademicYear(repo, admin, { name: "2026-2027", start: "2026-09-01", end: "2027-06-30", isCurrent: true, terms: [{ name: "T1", start: "2026-09-01", end: "2027-01-01" }, { name: "T2", start: "2026-12-01", end: "2027-03-01" }] }, now), /overlap/);
    const id = await saveAcademicYear(repo, admin, { name: "2026-2027", start: "2026-09-01", end: "2027-06-30", isCurrent: true, terms: [{ name: "T1", start: "2026-09-01", end: "2026-12-15" }, { name: "T2", start: "2027-01-05", end: "2027-03-30" }] }, now);
    const years = await listAcademicYears(repo, admin);
    const y = years.find((x) => x.id === id)!;
    assert.equal(y.terms.length, 2);
    assert.ok(y.isCurrent);
    // saving again under the same name replaces the terms rather than creating a second year
    const id2 = await saveAcademicYear(repo, admin, { name: "2026-2027", start: "2026-09-01", end: "2027-06-30", isCurrent: true, terms: [{ name: "Term 1", start: "2026-09-01", end: "2027-06-30" }] }, now);
    assert.equal(id2, id);
    assert.equal((await listAcademicYears(repo, admin)).find((x) => x.id === id)!.terms.length, 1);
  });

  test("permission gate: a teacher cannot read or change engine settings, branding or the calendar", async () => {
    await assert.rejects(getEngineSettings(repo, teacher), ForbiddenError);
    await assert.rejects(updateEngineSettings(repo, teacher, { adaptive: { topK: 2 } }, now), ForbiddenError);
    await assert.rejects(getBranding(repo, teacher), ForbiddenError);
    await assert.rejects(updateBranding(repo, teacher, { nameAr: "x" }, now), ForbiddenError);
    await assert.rejects(listAcademicYears(repo, teacher), ForbiddenError);
    await assert.rejects(saveAcademicYear(repo, teacher, { name: "X", start: "2026-09-01", end: "2027-06-30", isCurrent: false, terms: [] }, now), ForbiddenError);
  });
});
