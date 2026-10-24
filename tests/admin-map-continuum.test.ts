/**
 * Admin MAP Continuum (/admin/map-continuum): src/server/map/continuum.ts — importContinuum() replaces the school's
 * Learning Continuum from an uploaded table (one row per statement); a row with a problem means nothing is saved.
 * Admin (settings:school) only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { CONTINUUM_HEADERS, continuumStats, groupOfGoal, hasContinuum, importContinuum } from "../src/server/map/continuum";
import { demoDatabase } from "./helpers/db";

describe("admin MAP Continuum import", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  const now = new Date("2026-10-24T08:00:00Z");
  const row = (over: Partial<Record<(typeof CONTINUUM_HEADERS)[number], string>> = {}): string[] => {
    const d: Record<(typeof CONTINUUM_HEADERS)[number], string> = {
      Subject: "Reading", "RIT Low": "191", "RIT High": "200", "Goal Area": "Literary Text",
      "Sub-topic": "Theme", Statement: "Determines the theme of a story.", Standards: "RL.4.2", ...over,
    };
    return CONTINUUM_HEADERS.map((h) => d[h]);
  };
  const table = (rows: string[][]) => [[...CONTINUUM_HEADERS], ...rows];

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin"); teacher = await a("demo.teacher.4a");
  });

  test("groupOfGoal: the continuum's goal areas map to the platform's groups", () => {
    assert.equal(groupOfGoal("Literary Text"), "LIT");
    assert.equal(groupOfGoal("Informational Text"), "INFO");
    assert.equal(groupOfGoal("Vocabulary"), "VOCAB");
    assert.equal(groupOfGoal("Grammar and Usage"), "GRAMMAR");
    assert.equal(groupOfGoal("Mechanics"), "MECH");
    assert.equal(groupOfGoal("Writing"), "WRITING");
    assert.equal(groupOfGoal("Something else"), null);
  });

  test("teachers are refused: only an admin may import the continuum", async () => {
    await assert.rejects(importContinuum(repo, teacher, table([row()]), now), ForbiddenError);
    assert.equal(await hasContinuum(repo), false, "nothing was imported");
  });

  test("a bad row: nothing is saved, every problem is reported", async () => {
    const bad = table([
      row({ Subject: "Science" }),            // not Reading/Language
      row({ "RIT Low": "400" }),               // out of range
      row({ "Goal Area": "Not a goal area" }),  // unknown goal area
      row({ Statement: "" }),                   // missing statement
      row({ Standards: "NOTACODE" }),           // unrecognised standard code
    ]);
    const r = await importContinuum(repo, admin, bad, now);
    assert.equal(r.saved, 0);
    assert.equal(r.errors.length, 5);
    assert.equal(await hasContinuum(repo), false);
  });

  test("a missing required column is refused up front", async () => {
    const headless = [[...CONTINUUM_HEADERS].filter((h) => h !== "Statement"), row().slice(0, CONTINUUM_HEADERS.length - 1)];
    await assert.rejects(importContinuum(repo, admin, headless, now), ValidationError);
  });

  test("a good file: saved, grouped by subject, replaces the previous import", async () => {
    const good = table([
      row({ Statement: "Determines the theme of a story." }),
      row({ Subject: "Language Usage", "Goal Area": "Grammar and Usage", "Sub-topic": "Pronouns", Statement: "Uses pronouns correctly.", Standards: "L.4.1" }),
    ]);
    const r = await importContinuum(repo, admin, good, now);
    assert.equal(r.saved, 2);
    assert.deepEqual(r.bySubject, { READING: 1, LANGUAGE: 1 });
    assert.equal(r.errors.length, 0);
    assert.equal(await hasContinuum(repo), true);
    const stats = await continuumStats(repo);
    assert.equal(stats.find((x) => x.subject === "READING")!.total, 1);
    assert.equal(stats.find((x) => x.subject === "LANGUAGE")!.total, 1);

    // importing again replaces the subjects present in the new file (never appends silently)
    const again = table([row({ Statement: "A second Reading statement." })]);
    const r2 = await importContinuum(repo, admin, again, now);
    assert.equal(r2.saved, 1);
    const stats2 = await continuumStats(repo);
    assert.equal(stats2.find((x) => x.subject === "READING")!.total, 1, "READING rows were replaced, not appended");
    assert.equal(stats2.find((x) => x.subject === "LANGUAGE")!.total, 1, "LANGUAGE rows (not in this file) are untouched");
  });
});
