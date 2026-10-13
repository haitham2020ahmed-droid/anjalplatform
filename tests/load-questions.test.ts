/**
 * 📥 Load new questions from the platform (Admin → Questions): chunked loading with progress, stop and resume, one
 * load at a time (lock with expiry), a second run adds nothing, school admin only, Question Check at the end.
 * Demo school in memory (never a real database); small pack files made from the real ones in a temp folder.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { loadMapSetsFile } from "../src/server/questions/map-sets";
import { loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { PACKS, packOf, runPackChunk, usePackDir } from "../src/server/questions/load-packs";
import { checkChunk, finishLoad, LOCK_TTL_MS, loadChunk, loadStatus, packCount, startLoad, stopLoad } from "../src/server/admin/load-questions";

const s = (v: unknown) => String(v ?? "");

describe("📥 Load new questions (chunked)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = ""; let dir = "";
  const GAP_SETS = 4, PER_SET = 3;
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
    dir = mkdtempSync(join(tmpdir(), "packs-"));
    const gap = (await loadSkillSetsFile("gap-skill-sets.json")).slice(0, GAP_SETS).map((x) => ({ ...x, questions: x.questions.slice(0, PER_SET) }));
    writeFileSync(join(dir, "gap-skill-sets.json"), JSON.stringify({ sets: gap }));
    const topup = (await loadSkillSetsFile("topup-skill-sets.json")).filter((x) => x.skill === "Theme").map((x) => ({ ...x, questions: x.questions.slice(0, 3) }));
    writeFileSync(join(dir, "topup-skill-sets.json"), JSON.stringify({ sets: topup }));
    // all-grades bank: a skill the gap pack creates + one this school does not have
    const span = (await loadSkillSetsFile("span-skill-sets.json")).filter((x) => x.skill === gap[0].skill).map((x) => ({ ...x, questions: x.questions.slice(0, 2) }));
    span.push({ skill: "A Skill Nobody Has", questions: span[0]?.questions ?? [] });
    writeFileSync(join(dir, "span-skill-sets.json"), JSON.stringify({ sets: span }));
    const nodes = (await loadMapSetsFile()).slice(0, 2).map((n) => ({ ...n, questions: n.questions.slice(0, 2) }));
    writeFileSync(join(dir, "map-vocab-review-sets.json"), JSON.stringify({ nodes }));
    // grammar-extra-sets.json: not there yet (added later) → the pack is skipped
    usePackDir(dir);
  });
  after(() => { usePackDir(null); rmSync(dir, { recursive: true, force: true }); });

  test("school admin only: a teacher can neither see nor run a load", async () => {
    await assert.rejects(() => loadStatus(repo, teacher), /school admin/i);
    await assert.rejects(() => startLoad(repo, teacher), /school admin/i);
    await assert.rejects(() => loadChunk(repo, teacher, { token: "x".repeat(10), pack: "gap" }), /school admin/i);
    const page = readFileSync(join(ROOT, "src/app/admin/questions/load/page.tsx"), "utf8");
    assert.match(page, /requireActor\(\{ roles: \["SCHOOL_ADMIN"\] \}\)/);
    const actions = readFileSync(join(ROOT, "src/app/admin/questions/load/actions.ts"), "utf8");
    assert.match(actions, /roles: \["SCHOOL_ADMIN"\]/);
  });

  test("the page lists every pack with what is in and what is left; a missing file is skipped", async () => {
    const st = await loadStatus(repo, admin);
    assert.deepEqual(st.packs.map((p) => p.key), PACKS.map((p) => p.key));
    const gap = st.packs.find((p) => p.key === "gap")!;
    assert.equal(gap.present, true);
    // the counts come after the page has opened, one request per pack
    const gc = await packCount(repo, admin, "gap");
    assert.ok(gc.ok);
    assert.equal(gc.count!.questions, GAP_SETS * PER_SET);
    assert.equal(gc.count!.inBank, 0);
    assert.equal(gc.count!.left, GAP_SETS * PER_SET);
    const grammar = st.packs.find((p) => p.key === "grammar")!;
    assert.equal(grammar.present, false);
    const g = await packCount(repo, admin, "grammar");
    assert.ok(g.ok); assert.equal(g.count, null);
    assert.equal(st.running, null);
  });

  test("chunks: progress per chunk, Stop keeps it, Resume goes on from there; one load at a time", async () => {
    const { token } = await startLoad(repo, admin);
    await assert.rejects(() => startLoad(repo, admin), /already running/, "never two loads at once");
    assert.ok((await loadStatus(repo, admin)).running, "the page shows a load is running");
    await assert.rejects(() => loadChunk(repo, admin, { token: "not-the-token", pack: "gap" }), /stopped or another load/);
    const r1 = await loadChunk(repo, admin, { token, pack: "gap", restart: true });
    assert.equal(r1.total, GAP_SETS);
    assert.equal(r1.done, packOf("gap")!.perChunk, "one chunk = a few skill sets");
    assert.equal(r1.finished, false);
    assert.equal(r1.added, r1.done * PER_SET);
    assert.ok(r1.created >= r1.done, "the gap skills are created");
    // ⏹ Stop: the lock is given back, the progress stays
    await stopLoad(repo, admin, token);
    await assert.rejects(() => loadChunk(repo, admin, { token, pack: "gap" }), /stopped/);
    const mid = (await loadStatus(repo, admin)).packs.find((p) => p.key === "gap")!;
    assert.equal(mid.progress!.done, r1.done); assert.equal(mid.progress!.finishedAt, null);
    // ▶ Resume
    const t2 = (await startLoad(repo, admin)).token;
    const r2 = await loadChunk(repo, admin, { token: t2, pack: "gap", restart: true });
    assert.equal(r2.done, GAP_SETS, "goes on from where it stopped (restart only restarts a finished pack)");
    assert.equal(r2.finished, true);
    assert.equal(r2.added, GAP_SETS * PER_SET);
    // the other packs; the missing grammar file is skipped
    for (const key of ["topup", "span", "map", "grammar"]) {
      let r = await loadChunk(repo, admin, { token: t2, pack: key, restart: true });
      while (!r.finished) r = await loadChunk(repo, admin, { token: t2, pack: key });
      if (key === "grammar") assert.equal(r.missingFile, true);
      if (key === "span") { assert.equal(r.added, 2, "only the skill the school has"); assert.deepEqual(r.errors, []); }
      if (key === "map") { assert.equal(r.total, 3, "the map seed + 2 places"); assert.equal(r.added, 4); }
    }
    let c = await checkChunk(repo, admin, t2);
    while (!c.finished) c = await checkChunk(repo, admin, t2);
    assert.ok(c.checked > 0);
    const sum = await finishLoad(repo, admin, { token: t2, packs: ["gap", "topup", "span", "map"] });
    assert.equal(sum.checked, c.checked);
    assert.ok(sum.added >= GAP_SETS * PER_SET + 2 + 4);
    const st = await loadStatus(repo, admin);
    assert.equal(st.running, null, "the lock is given back at the end");
    assert.equal(st.last?.added, sum.added);
    const gap = await packCount(repo, admin, "gap");
    assert.ok(gap.ok);
    assert.equal(gap.count!.inBank, GAP_SETS * PER_SET); assert.equal(gap.count!.left, 0);
  });

  test("a second run adds nothing (every loader skips what is there)", async () => {
    const before = await repo.count("Question", {});
    const { token } = await startLoad(repo, admin);
    for (const key of ["gap", "topup", "span", "map"]) {
      let r = await loadChunk(repo, admin, { token, pack: key, restart: true });
      assert.equal(r.done <= r.total, true);
      while (!r.finished) r = await loadChunk(repo, admin, { token, pack: key });
      assert.equal(r.added, 0, `${key}: nothing added twice`);
    }
    await stopLoad(repo, admin, token);
    assert.equal(await repo.count("Question", {}), before);
  });

  test("the lock expires: a closed page never blocks the next load for long", async () => {
    const t0 = new Date();
    const { token } = await startLoad(repo, admin, t0);
    await assert.rejects(() => startLoad(repo, admin, new Date(t0.getTime() + 30_000)), /already running/);
    const later = new Date(t0.getTime() + LOCK_TTL_MS + 1000);
    const t2 = (await startLoad(repo, admin, later)).token;
    assert.notEqual(t2, token);
    await assert.rejects(() => loadChunk(repo, admin, { token, pack: "gap" }, later), /stopped or another load/, "the old page cannot go on");
    await stopLoad(repo, admin, t2);
  });

  test("runPackChunk stops at its size (the terminal script runs the same chunks)", async () => {
    const w = await runPackChunk(repo, schoolId, packOf("gap")!, 0, { maxUnits: 1 });
    assert.equal(w.from, 0); assert.equal(w.next, 1); assert.equal(w.total, GAP_SETS); assert.equal(w.added, 0);
    const script = readFileSync(join(ROOT, "scripts/skills/top-up-skills.ts"), "utf8");
    assert.match(script, /loadChunk/); assert.match(script, /runPackChunk/); assert.match(script, /checkChunk/);
    assert.ok(s(script).includes("grammar-extra-sets.json"));
  });
});
