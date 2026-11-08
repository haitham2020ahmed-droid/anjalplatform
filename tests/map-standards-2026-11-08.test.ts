/**
 * 📐 MAP standards (8 Nov 2026) — fictional demo school only:
 *  - NWEA's "Student Proficiency by Standard" table is read (codes, Yes / No / "-", "LAST, First" names);
 *  - an upload for a class matches the class's students and the report shows the % likely proficient;
 *  - a second file (another subject) keeps the first file's standards.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { importMapStandards, mapStandardsView, matchNames, parseNweaStandards, proficientCell, standardCode } from "../src/server/map/map-standards";
import { demoDatabase } from "./helpers/db";

let repo: SqliteRepo; let admin: Actor;
before(async () => {
  ({ repo } = await demoDatabase());
  admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
});

describe("MAP standards", () => {
  test("codes and cells", () => {
    assert.equal(standardCode("CCSS.ELA-Literacy.RL.5.1"), "RL.5.1");
    assert.equal(standardCode("CCSS.ELA-LITERACY.W.5.9.A"), "W.5.9.a");
    assert.equal(standardCode("RI.4.10"), "RI.4.10");
    assert.equal(standardCode("Student Name"), null);
    assert.deepEqual(["Yes", "No", "-", "Likely Proficient", "Not Likely Proficient", ""].map(proficientCell), [true, false, null, true, false, null]);
  });

  test("NWEA's table as it comes from the page", () => {
    const p = parseNweaStandards([
      ["Class Profile"],
      ["Student Name", "CCSS.ELA-Literacy.RL.5.1", "CCSS.ELA-Literacy.RI.5.3", "CCSS.ELA-Literacy.W.5.8"],
      ["Kamel, Joury", "No", "Yes", "-"],
      ["almana, Haifa", "Yes", "No", "-"],
      ["Student Proficiency Result for This Standard"],
    ]);
    assert.deepEqual(p.codes, ["RL.5.1", "RI.5.3", "W.5.8"]);
    assert.equal(p.rows.length, 2);
    assert.deepEqual(p.rows[0].values, { "RL.5.1": false, "RI.5.3": true, "W.5.8": null });
    assert.throws(() => parseNweaStandards([["Name", "RIT"], ["A", "200"]]));
  });

  test("names: word order, commas and small spelling differences; one student per name", () => {
    const m = matchNames(["MAHMUOD, JAWAD", "Kamel, Joury", "Nobody, Here"], [{ id: "1", name: "Jawad Mahmoud" }, { id: "2", name: "Joury Kamel" }, { id: "3", name: "Sara Ali" }]);
    assert.equal(m.get("MAHMUOD, JAWAD"), "1");
    assert.equal(m.get("Kamel, Joury"), "2");
    assert.equal(m.get("Nobody, Here"), null);
  });

  test("an upload for a class: matched students, % likely proficient, a second subject kept", async () => {
    const klass = (await repo.findMany("Class", { schoolId: admin.schoolId, deletedAt: null }))[0];
    const members = await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null });
    assert.ok(members.length >= 2, "the demo class has students");
    const names: string[] = [];
    for (const m of members.slice(0, 3)) {
      const st = (await repo.findUnique("Student", { id: m.studentId }))!;
      const u = (await repo.findUnique("User", { id: st.userId }))!;
      const w = String(u.displayName).split(/\s+/);
      names.push(w.length > 1 ? `${w.slice(1).join(" ").toUpperCase()}, ${w[0]}` : String(u.displayName));
    }
    const reading = [["Student Name", "CCSS.ELA-Literacy.RL.5.1", "CCSS.ELA-Literacy.RI.5.3"], ...names.map((n, i) => [n, i === 0 ? "Yes" : "No", "Yes"]), ["Someone Else, Not Here", "Yes", "Yes"]];
    const r = await importMapStandards(repo, admin, String(klass.id), reading);
    assert.equal(r.codes, 2);
    assert.equal(r.matched, names.length);
    assert.deepEqual(r.unmatched, ["Someone Else, Not Here"]);
    const lang = [["Student Name", "CCSS.ELA-Literacy.L.5.1", "CCSS.ELA-Literacy.L.5.2"], ...names.map((n) => [n, "No", "Yes"])];
    await importMapStandards(repo, admin, String(klass.id), lang);
    const v = (await mapStandardsView(repo, admin, String(klass.id)))!;
    assert.deepEqual(v.rows.map((x) => x.code), ["L.5.1", "L.5.2", "RI.5.3", "RL.5.1"]);
    const rl = v.rows.find((x) => x.code === "RL.5.1")!;
    assert.equal(rl.yes, 2, "the matched first student + the unmatched name");
    assert.equal(rl.no, names.length - 1);
    assert.equal(rl.pct, Math.round((100 * 2) / (names.length + 1)));
    assert.equal(rl.students[0].value, false, "not yet proficient first");
    assert.deepEqual(v.unmatched, ["Someone Else, Not Here"]);
  });
});
