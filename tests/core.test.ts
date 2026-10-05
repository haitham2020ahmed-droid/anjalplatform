import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY, LEVEL_TO_B, resolveEngineConfig } from "../src/config/engine";
import { computeMastery } from "../src/mastery/mastery";
import { estimateAbilityEAP } from "../src/adaptive/irt";
import { toWeighted } from "../src/adaptive/evidence";
import { canAccessStudent, can, type Actor } from "../src/server/auth/rbac";
import { analyzeText, platformReadingLevel, studentReadingRange } from "../src/reading/prl";
import { recommendSkills } from "../src/recommendations/recommend";
import { crossGradePrerequisites, planCurriculum, type GradeFile, type Taxonomy } from "../src/imports/curriculum/plan";
import type { ResponseEvidence } from "../src/types/domain";

const NOW = new Date("2026-10-03T10:00:00Z");
function resp(level: number, correct: boolean, i: number, extra: Partial<ResponseEvidence> = {}): ResponseEvidence {
  return {
    itemId: `q${i}`, correct, level, a: 1, b: LEVEL_TO_B[level], c: 0,
    responseMs: 30_000, estimatedSeconds: 40, usedHint: false,
    at: new Date(NOW.getTime() - (100 - i) * 60_000).toISOString(), ...extra,
  };
}
function abilityOf(h: ResponseEvidence[]) {
  return estimateAbilityEAP(h.map((r) => toWeighted(r, DEFAULT_ADAPTIVE)), { priorMean: 0, priorSD: 1, thetaMin: -3, thetaMax: 3, model: 2 });
}
const mastery = (h: ResponseEvidence[], now = NOW) => {
  const a = abilityOf(h);
  return computeMastery(h, a.theta, DEFAULT_MASTERY, DEFAULT_ADAPTIVE, now, a.se);
};

// ---------------- mastery
test("two easy correct answers do not produce mastery", () => {
  const m = mastery([resp(1, true, 1), resp(2, true, 2)]);
  assert.equal(m.band, "BEGINNING");
  assert.ok(m.score < 40);
});

test("many easy correct answers stay below MASTERED (difficulty gate)", () => {
  const h = Array.from({ length: 25 }, (_, i) => resp(3, true, i));
  const m = mastery(h);
  assert.ok(!m.isMastered, `score ${m.score}`);
});

test("sustained correct work up to level 6 reaches MASTERED", () => {
  const levels = [4, 4, 5, 4, 5, 5, 6, 5, 6, 6, 5, 6, 6, 6, 7, 6, 6, 7];
  const h = levels.map((l, i) => resp(l, true, i));
  const m = mastery(h);
  assert.equal(m.band, "MASTERED", JSON.stringify(m.components));
});

test("rapid guesses cannot manufacture evidence", () => {
  const levels = [4, 4, 5, 4, 5, 5, 6, 5, 6, 6, 5, 6, 6, 6, 7, 6, 6, 7];
  const h = levels.map((l, i) => resp(l, true, i, { responseMs: 900 }));
  const m = mastery(h);
  assert.ok(m.score < 75, `rapid-guess score ${m.score}`);
});

test("inconsistent performance scores lower than consistent performance at equal accuracy", () => {
  const steady = [true, true, true, false, true, true, true, false, true, true, true, false].map((c, i) => resp(5, c, i));
  const streaky = [true, true, true, true, true, true, true, true, true, false, false, false].map((c, i) => resp(5, c, i));
  assert.ok(mastery(steady).score > mastery(streaky).score);
});

test("mastery decays slowly after 30 idle days, with a floor", () => {
  const h = [4, 5, 5, 6, 6, 6, 5, 6, 7, 6, 6, 6, 7, 6, 6, 7].map((l, i) => resp(l, true, i));
  const fresh = mastery(h).score;
  const later = mastery(h, new Date(NOW.getTime() + 120 * 86_400_000)).score;
  assert.ok(later < fresh);
  assert.ok(later >= fresh * DEFAULT_MASTERY.decayFloor - 0.2);
});

test("engine config rejects invalid thresholds", () => {
  assert.throws(() => resolveEngineConfig({}, { weights: { ability: 0.5, recentAccuracy: 0.5, consistency: 0.5 } }));
  assert.throws(() => resolveEngineConfig({}, { bands: { beginning: 0, developing: 70, approaching: 60, proficient: 75, mastered: 90 } }));
});

// ---------------- RBAC / data isolation
const teacher: Actor = { userId: "t", role: "TEACHER", schoolId: "sch1", teacherStudentIds: new Set(["s1", "s2"]) };
const student: Actor = { userId: "u1", role: "STUDENT", schoolId: "sch1", studentId: "s1" };
const parent: Actor = { userId: "p", role: "PARENT", schoolId: null, parentChildIds: new Set(["s2"]) };
const admin: Actor = { userId: "a", role: "SCHOOL_ADMIN", schoolId: "sch1" };

test("students see only their own records", () => {
  assert.ok(canAccessStudent(student, { studentId: "s1", schoolId: "sch1" }));
  assert.ok(!canAccessStudent(student, { studentId: "s2", schoolId: "sch1" }));
});
test("teachers see only students in their classes, within their school", () => {
  assert.ok(canAccessStudent(teacher, { studentId: "s2", schoolId: "sch1" }));
  assert.ok(!canAccessStudent(teacher, { studentId: "s9", schoolId: "sch1" }));
  assert.ok(!canAccessStudent(teacher, { studentId: "s1", schoolId: "sch2" }));
});
test("parents see only their linked children", () => {
  assert.ok(canAccessStudent(parent, { studentId: "s2", schoolId: "sch1" }));
  assert.ok(!canAccessStudent(parent, { studentId: "s1", schoolId: "sch1" }));
});
test("school admins are confined to their school", () => {
  assert.ok(canAccessStudent(admin, { studentId: "any", schoolId: "sch1" }));
  assert.ok(!canAccessStudent(admin, { studentId: "any", schoolId: "sch2" }));
});
test("permission matrix: students cannot publish questions or export reports; teachers need a grant to publish", () => {
  assert.ok(!can(student, "questions:publish"));
  assert.ok(!can(student, "reports:export"));
  assert.ok(!can(teacher, "questions:publish"));
  assert.ok(can({ ...teacher, extraPermissions: ["questions:publish"] }, "questions:publish"));
});

// ---------------- reading level
test("PRL rises with sentence length and word complexity; range is labelled PRL, not Lexile", () => {
  const easy = platformReadingLevel(analyzeText("The cat sat. The dog ran. We had fun. It was sunny."));
  const hard = platformReadingLevel(analyzeText(
    "Photosynthesis, the remarkable biochemical process through which chlorophyll-containing organisms convert electromagnetic energy into chemical energy, sustains nearly every terrestrial ecosystem.",
  ));
  assert.ok(hard > easy + 400);
  const r = studentReadingRange(4, 0.5, 0.4);
  assert.ok(r.label.startsWith("PRL "));
  assert.ok(r.low < r.high);
});

// ---------------- recommendations
test("recommendations are explained, prioritise assignments/prereq gaps and skip mastered skills", () => {
  const base = { sequence: 1, unitNumber: 1, attempts: 5, recentErrors: 0, daysSincePractice: 2, theta: 0, assignedDueInDays: null, prerequisiteGap: false, mapGoalAreaWeak: false };
  const recs = recommendSkills(
    [
      { ...base, skillId: "mastered", name: "Mastered", mastery: 95 },
      { ...base, skillId: "assigned", name: "Assigned", mastery: 70, assignedDueInDays: 1 },
      { ...base, skillId: "gap", name: "Gap", mastery: 30, prerequisiteGap: true },
      { ...base, skillId: "fine", name: "Fine", mastery: 80, unitNumber: 3 },
    ],
    1,
  );
  assert.ok(!recs.some((r) => r.skillId === "mastered"));
  assert.equal(recs[0].skillId, "gap");
  assert.ok(recs.every((r) => r.reasons.length > 0));
});

// ---------------- curriculum import (real school data)
const dataDir = join(__dirname, "..", "data", "curriculum");
const tax = JSON.parse(readFileSync(join(dataDir, "taxonomy.json"), "utf8")) as Taxonomy;
const grades = [4, 5, 6].map((g) => JSON.parse(readFileSync(join(dataDir, `grade-${g}.json`), "utf8")) as GradeFile);

test("existing curriculum data imports with zero validation errors", () => {
  for (const f of grades) {
    const plan = planCurriculum(tax, f);
    assert.deepEqual(plan.errors, [], `grade ${f.grade}`);
    assert.equal(plan.units.length, 6);
  }
});

test("skills are de-duplicated per curriculum (one 'Theme' skill, many lesson links)", () => {
  const g4 = planCurriculum(tax, grades[0]);
  assert.equal(g4.skills.filter((s) => s.familyCode === "theme").length, 1);
  assert.ok(g4.lessonSkills.filter((l) => l.skillKey === "G4.theme").length >= 3);
  assert.equal(new Set(g4.skills.map((s) => s.key)).size, g4.skills.length);
});

test("Grade 4 Unit 1 Text Set 1 maps to the expected Wonders skills and standards", () => {
  const g4 = planCurriculum(tax, grades[0]);
  const links = g4.lessonSkills.filter((l) => l.lessonCode === "G4-U1-TS1").map((l) => l.skillKey);
  for (const k of ["G4.compare-contrast", "G4.multiple-meaning", "G4.text-features", "G4.spelling", "G4.sentences"]) assert.ok(links.includes(k), k);
  const cc = g4.skills.find((s) => s.key === "G4.context-clues")!;
  assert.ok(cc.standards.includes("CCSS.ELA-LITERACY.L.4.4.a"));
});

test("planning is deterministic (re-import produces identical keys)", () => {
  const a = planCurriculum(tax, grades[1]);
  const b = planCurriculum(tax, grades[1]);
  assert.deepEqual(a.skills.map((s) => s.key), b.skills.map((s) => s.key));
  assert.deepEqual(a.lessonSkills.length, b.lessonSkills.length);
});

test("cross-grade continuum links G5 skills to their G4 foundations", () => {
  const plans = grades.map((g) => planCurriculum(tax, g));
  const links = crossGradePrerequisites(plans);
  assert.ok(links.some((l) => l.skillKey === "G5.theme" && l.prerequisiteKey === "G4.theme"));
  assert.ok(links.some((l) => l.skillKey === "G6.context-clues" && l.prerequisiteKey === "G5.context-clues"));
});
