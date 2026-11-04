/**
 * 📂 My Work tab + the 3-section My Work page (Oct 2026 restructure): a teacher can file an assigned skill under
 * "Extra Practice" so it leaves the normal grouping and shows under its own section instead. The student's My Work
 * page is exactly 3 sections — This week / Needs Catch-up / Extra Practice — plus a minimal Done footer.
 * Pure (no DB): mergeWorkItems/groupMyWork/tabGroups all take plain objects.
 *
 * The one rule that mattered most while designing the ORIGINAL tab feature with the user, and preserved exactly
 * through this restructure: a tab is never a dead end. My Work merges every assignment of the SAME skill into one
 * row, keeping the fields of the "leading" (most active) one — the tab (and, new in this round, the assigned date
 * used for Needs Catch-up) follow that same leading row, so a fresh, active, untagged reassignment of a tabbed OR
 * stale skill clears its old tab / catch-up aging and brings it back to a FRESH "This week" row, with no teacher
 * action needed.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mergeWorkItems } from "../src/server/plans/wizard";
import { groupMyWork, tabGroups, sectionOf, CATCHUP_DAYS, type WorkRowLike } from "../src/lib/my-work-groups";
import { isWorkTab, parseWorkTab, WORK_TABS, WORK_TAB_LABEL } from "../src/lib/work-tab";

const now = new Date("2026-10-27T00:00:00.000Z");
const DAY = 86_400_000;
const base = {
  kind: "skill" as const, skillId: "k", skill: "K", standard: null, assignedAt: now.toISOString(), note: null, startsLater: false, completedAt: null, progress: 0,
};

describe("📂 My Work tab (now a single value: EXTRA_PRACTICE)", () => {
  test("parseWorkTab / isWorkTab: EXTRA_PRACTICE only; old REVIEW/PREVIOUS_TERM rows still already in the database read back as EXTRA_PRACTICE; everything else is null/false", () => {
    assert.deepEqual([...WORK_TABS], ["EXTRA_PRACTICE"]);
    assert.ok(isWorkTab("EXTRA_PRACTICE"));
    assert.equal(parseWorkTab("extra_practice"), "EXTRA_PRACTICE");
    assert.ok(WORK_TAB_LABEL.EXTRA_PRACTICE);
    // legacy values a sibling fork's data may still carry on the Assignment.tab column — tolerant, not an error
    assert.equal(parseWorkTab("REVIEW"), "EXTRA_PRACTICE");
    assert.equal(parseWorkTab("review"), "EXTRA_PRACTICE");
    assert.equal(parseWorkTab("PREVIOUS_TERM"), "EXTRA_PRACTICE");
    assert.equal(isWorkTab("REVIEW"), false, "no longer a tab of its own, just a legacy string parseWorkTab maps forward");
    for (const bad of [null, undefined, "", "NONE", "extra-practice", "CUSTOM_TAB", 42]) { assert.equal(isWorkTab(bad), false); assert.equal(parseWorkTab(bad), null); }
  });

  test("a single tabbed assignment: the merged row carries the tab", () => {
    const merged = mergeWorkItems([
      { ...base, assignmentId: "a1", track: "GRAMMAR", source: "GRAMMAR", tab: "EXTRA_PRACTICE", startAt: null, dueAt: null, status: "NOT_STARTED" },
    ], now);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].tab, "EXTRA_PRACTICE");
  });

  test("an untagged assignment: the merged row's tab is null", () => {
    const merged = mergeWorkItems([
      { ...base, assignmentId: "a1", track: "CURRICULUM", source: "CURRICULUM", tab: null, startAt: null, dueAt: null, status: "IN_PROGRESS" },
    ], now);
    assert.equal(merged[0].tab, null);
  });

  test("auto-clear (the exact scenario asked about): an old COMPLETED Extra-Practice row + a new ACTIVE untagged reassignment of the SAME skill → the merged row's tab clears, it is NOT stuck under Extra Practice, AND it carries the fresh row's own assignedAt (not the old one's) — it lands back in This week, not Needs Catch-up", () => {
    const merged = mergeWorkItems([
      { ...base, assignmentId: "old", track: "CURRICULUM", source: "CURRICULUM", tab: "EXTRA_PRACTICE", startAt: null, dueAt: null, status: "COMPLETED", assignedAt: new Date(now.getTime() - 60 * DAY).toISOString() },
      { ...base, assignmentId: "new", track: "CURRICULUM", source: "CURRICULUM", tab: null, startAt: null, dueAt: new Date(now.getTime() + 5 * DAY).toISOString(), status: "IN_PROGRESS", assignedAt: now.toISOString() },
    ], now);
    assert.equal(merged.length, 1, "one row (same skillId)");
    assert.equal(merged[0].tab, null, "the active untagged reassignment leads → tab clears");
    assert.equal(merged[0].assignmentId, "new", "the leading row's own fields are kept too");
    assert.equal(merged[0].status, "In progress");
    assert.equal(merged[0].assignedAt, now.toISOString(), "assignedAt follows the leading row, not the earliest of the group");
    assert.equal(sectionOf(merged[0], now), "THIS_WEEK", "fresh — not immediately re-aged into Needs Catch-up");
  });

  test("the reverse: the old tabbed row is still the leading (active) one, the other is COMPLETED → the tab stays", () => {
    const merged = mergeWorkItems([
      { ...base, assignmentId: "old", track: "CURRICULUM", source: "CURRICULUM", tab: "EXTRA_PRACTICE", startAt: null, dueAt: null, status: "OVERDUE" },
      { ...base, assignmentId: "done", track: "CURRICULUM", source: "CURRICULUM", tab: null, startAt: null, dueAt: null, status: "COMPLETED" },
    ], now);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].tab, "EXTRA_PRACTICE", "the overdue tabbed row still leads → tab stays");
  });

  test("order doesn't matter: the leading row wins whichever side of the array it's on", () => {
    const a = mergeWorkItems([
      { ...base, assignmentId: "new", track: "CURRICULUM", source: "CURRICULUM", tab: null, startAt: null, dueAt: null, status: "IN_PROGRESS" },
      { ...base, assignmentId: "old", track: "CURRICULUM", source: "CURRICULUM", tab: "EXTRA_PRACTICE", startAt: null, dueAt: null, status: "COMPLETED" },
    ], now);
    assert.equal(a[0].tab, null);
  });
});

describe("📋 My Work, 3 sections (This week / Needs Catch-up / Done) + Extra Practice", () => {
  const row = (o: Partial<WorkRowLike>): WorkRowLike => ({ assignmentId: "x", status: "In progress", overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "W", tab: null, ...o });

  test("This week: every untagged, not-done row, regardless of due date — no more Later split", () => {
    const rows = [
      row({ assignmentId: "a", dueAt: null }), // no due date at all
      row({ assignmentId: "b", dueAt: new Date(now.getTime() + 60 * DAY).toISOString() }), // due far in the future (old "Later")
      row({ assignmentId: "c", overdue: true, dueAt: new Date(now.getTime() - 2 * DAY).toISOString() }), // overdue, but freshly assigned
    ];
    const [thisWeek, catchup] = groupMyWork(rows, now);
    const ids = thisWeek.types.flatMap((g) => g.rows.map((r) => r.assignmentId));
    assert.deepEqual(new Set(ids), new Set(["a", "b", "c"]), "all 3 land in This week together — no time-based split");
    assert.equal(catchup.total, 0);
  });

  test("Needs Catch-up: an untagged, not-done row assigned CATCHUP_DAYS (10) or more days ago, using assignedAt", () => {
    assert.equal(CATCHUP_DAYS, 10);
    const fresh = row({ assignmentId: "fresh", assignedAt: new Date(now.getTime() - 9 * DAY).toISOString() });
    const stale = row({ assignmentId: "stale", assignedAt: new Date(now.getTime() - 10 * DAY).toISOString() });
    const veryStale = row({ assignmentId: "very-stale", assignedAt: new Date(now.getTime() - 40 * DAY).toISOString() });
    assert.equal(sectionOf(fresh, now), "THIS_WEEK", "9 days — not yet");
    assert.equal(sectionOf(stale, now), "CATCHUP", "exactly 10 days — catches up");
    assert.equal(sectionOf(veryStale, now), "CATCHUP");
    const [thisWeek, catchup] = groupMyWork([fresh, stale, veryStale], now);
    assert.deepEqual(thisWeek.types.flatMap((g) => g.rows.map((r) => r.assignmentId)), ["fresh"]);
    assert.deepEqual(new Set(catchup.types.flatMap((g) => g.rows.map((r) => r.assignmentId))), new Set(["stale", "very-stale"]));
  });

  test("Needs Catch-up prefers startAt over assignedAt when both are present (a scheduled-start assignment)", () => {
    const r = row({ assignedAt: new Date(now.getTime() - 40 * DAY).toISOString(), startAt: new Date(now.getTime() - 1 * DAY).toISOString() });
    assert.equal(sectionOf(r, now), "THIS_WEEK", "startAt (1 day ago) wins over the much older assignedAt");
  });

  test("a row with neither assignedAt nor startAt never ages into Needs Catch-up (most non-skill work: tests, writing, …)", () => {
    const r = row({ assignedAt: null, startAt: null });
    assert.equal(sectionOf(r, now), "THIS_WEEK");
  });

  test("Done beats everything, including a very old assignedAt — a finished row is just Done", () => {
    const r = row({ status: "Done", assignedAt: new Date(now.getTime() - 100 * DAY).toISOString() });
    assert.equal(sectionOf(r, now), "DONE");
  });

  test("groupMyWork leaves a tabbed row out of This week / Needs Catch-up / Done entirely; an untagged row shows as usual", () => {
    const rows = [
      row({ assignmentId: "x1", skill: "Tagged", tab: "EXTRA_PRACTICE" as const }),
      row({ assignmentId: "x2", skill: "Untagged", tab: null }),
      row({ assignmentId: "x3", status: "Done", skill: "Tagged done", tab: "EXTRA_PRACTICE" as const }),
    ];
    const [thisWeek, catchup, done] = groupMyWork(rows, now);
    const everyShownId = [...thisWeek.types, ...catchup.types, ...done.types].flatMap((g) => g.rows.map((r) => r.assignmentId));
    assert.ok(!everyShownId.includes("x1"), "the tagged row is not in This week/Needs Catch-up");
    assert.ok(!everyShownId.includes("x3"), "the tagged done row is not in the Done footer either — it lives only in Extra Practice");
    assert.ok(everyShownId.includes("x2"), "the untagged row shows normally");
  });

  test("tabGroups: always one 'Extra Practice' section (owner: tabs stay visible with a 0 count rather than disappearing)", () => {
    const rows = [
      row({ assignmentId: "x1", skill: "A", tab: "EXTRA_PRACTICE" as const }),
      row({ assignmentId: "x2", skill: "B", tab: "EXTRA_PRACTICE" as const }),
      row({ assignmentId: "x3", skill: "C", tab: null }),
    ];
    const g = tabGroups(rows);
    assert.deepEqual(g.map((x) => x.tab), ["EXTRA_PRACTICE"]);
    assert.equal(g[0].rows.length, 2);
    const empty = tabGroups(rows.filter((r) => !r.tab));
    assert.deepEqual(empty.map((x) => x.tab), ["EXTRA_PRACTICE"], "no tagged rows → section is still present");
    assert.equal(empty[0].rows.length, 0, "…but with a 0 count");
  });

  test("the Done footer still surfaces completed work (via groupMyWork's DONE section)", () => {
    const rows = [row({ assignmentId: "d1", status: "Done" }), row({ assignmentId: "d2", status: "Done" }), row({ assignmentId: "a1" })];
    const [, , done] = groupMyWork(rows, now);
    assert.equal(done.total, 2);
    assert.deepEqual(new Set(done.types.flatMap((g) => g.rows.map((r) => r.assignmentId))), new Set(["d1", "d2"]));
  });
});
