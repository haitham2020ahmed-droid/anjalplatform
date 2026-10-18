/**
 * 🎯 ReadRise (student): the "Placement test" tab and the first-visit window (owner r68 §F) — FAKE data only.
 * Why a student saw articles and no placement card: the placement passages are read from data/readrise/placement.json
 * in the working directory; on a server that does not have that file (the standalone image carries only what the build
 * traces) there were no passages → "the test is not ready" → NO card and the articles UNLOCKED. The file is now bundled
 * with the code as a fallback, so the placement is always there. A teacher-set level still unlocks the articles, but
 * the Placement test tab stays (the test can still find the best level).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { loadPlacementPassages, parsePlacement, type PlacementPassage } from "../src/server/readrise/content-loader";
import { setLevelByTeacher } from "../src/server/readrise/engine";
import { answerPlacement, placementView, startPlacement } from "../src/server/readrise/placement";
import { readRiseHome } from "../src/server/readrise/student";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2026-10-13T08:00:00Z");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const PASSAGES: PlacementPassage[] = parsePlacement({
  passages: RR_LEVELS.flatMap((level) => [1, 2, 3].map((k) => ({ id: `P${level}-${k}`, level, title: `P ${level}/${k}`, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["a", "b", "c", "d"], answer: "A", skill: "detail" })) }))),
});

describe("🎯 ReadRise: the Placement test tab and the first-visit window", () => {
  let repo: SqliteRepo; let admin: Actor; let st: Actor[];
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    st = await Promise.all(["001", "002", "003"].map((x) => actorOf(`test.student.${x}`)));
  });

  test("the root cause: the placement is always available (the bundled copy when the server has no data file)", () => {
    assert.ok(loadPlacementPassages().length >= 5, "the app's placement passages");
    const empty = mkdtempSync(join(tmpdir(), "rr-"));
    assert.deepEqual(loadPlacementPassages(empty), [], "a test's own empty folder: nothing (as before)");
    const src = read("src/server/readrise/content-loader.ts");
    assert.match(src, /import bundledPlacement from "\.\.\/\.\.\/\.\.\/data\/readrise\/placement\.json"/, "the file is bundled with the code");
    assert.match(src, /return root === process\.cwd\(\) \? bundled\(\) : \[\]/, "a missing file falls back to the bundled copy");
  });

  test("never placed: NEED + locked (the window and the card show); the tab says Take the test", async () => {
    const h = await readRiseHome(repo, st[0], {}, NOW, PASSAGES);
    assert.equal(h.placement.state, "NEED"); assert.equal(h.locked, true); assert.equal(h.placement.doneAt ?? null, null); assert.equal(h.placement.ready, true);
  });

  test("a teacher-set level unlocks the articles, and the placement still stays offered", async () => {
    const sid = st[1].studentId!;
    await readRiseHome(repo, st[1], {}, NOW, PASSAGES); // first visit (the working start row)
    await setLevelByTeacher(repo, admin, sid, 820, "MAP", NOW);
    const h = await readRiseHome(repo, st[1], {}, NOW, PASSAGES);
    assert.equal(h.placed, true); assert.equal(h.locked, false, "the teacher's level unlocks");
    assert.equal(h.placement.state, "NEED", "the Placement test tab still offers the test");
  });

  test("finished: the tab shows done with its date (retake only when the teacher allows)", async () => {
    const s = st[2];
    const pid = await startPlacement(repo, s, NOW);
    for (let i = 0; i < 12; i++) {
      const v = await placementView(repo, s, PASSAGES);
      if (v.state !== "IN_PROGRESS") break;
      const a = await answerPlacement(repo, s, pid, v.passage!.id, i % 2 ? ["A", "B", "B"] : ["A", "A", "A"], PASSAGES, NOW);
      if (a.done) break;
    }
    const h = await readRiseHome(repo, s, {}, NOW, PASSAGES);
    assert.equal(h.placed, true);
    assert.equal(h.placement.doneAt?.slice(0, 10), "2026-10-13", "done with its date");
    assert.equal(h.placement.state, "NONE", "no retake unless the teacher allows it");
  });

  test("the page: three tabs (Articles · My report · Placement test), the window with Start / Later (remembered per student)", () => {
    const page = read("src/app/student/readrise/page.tsx");
    assert.match(page, /label: "Placement test", icon: "🎯", on: placementTab/);
    assert.match(page, /<PlacementPopup studentKey=\{actor\.studentId!\}/);
    assert.match(page, /data-testid="rr-placement-tab"/);
    assert.match(page, /t\("Placement test done on \{date\}"/);
    const pop = read("src/components/readrise/placement-popup.tsx");
    for (const x of ["Let's find your reading level first", "Later", "localStorage", "rr-placement-later:", "showModal"]) assert.ok(pop.includes(x), x);
    for (const w of ["Placement test", "Let's find your reading level first", "Later", "Placement test done on {date}", "Your teacher can let you take it again."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok(ar[w as (typeof UI_STRINGS)[number]], w);
    }
  });
});
