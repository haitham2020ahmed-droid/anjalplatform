/**
 * 📂 My Work tab (Oct 2026, "خليها تنضاف" → My Work tab request): a teacher can file an assigned skill under a tab
 * (e.g. "Extra Practice") so it leaves the normal Due this week / Later / Done grouping and shows under its own
 * tab section instead. Pure (no DB): mergeWorkItems/groupMyWork/tabGroups all take plain objects.
 *
 * The one rule that mattered most while designing this with the user: a tab is never a dead end. My Work merges
 * every assignment of the SAME skill into one row, keeping the fields of the "leading" (most active) one — the tab
 * follows that same leading row, so a fresh, active, untagged reassignment of a tabbed skill clears its old tab and
 * brings it back to the normal list by itself, with no teacher action needed.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mergeWorkItems } from "../src/server/plans/wizard";
import { groupMyWork, tabGroups } from "../src/lib/my-work-groups";
import { isWorkTab, parseWorkTab, WORK_TABS, WORK_TAB_LABEL } from "../src/lib/work-tab";

const now = new Date("2026-10-27T00:00:00.000Z");
const DAY = 86_400_000;
const base = {
  kind: "skill" as const, skillId: "k", skill: "K", standard: null, assignedAt: now.toISOString(), note: null, startsLater: false, completedAt: null, progress: 0,
};

describe("📂 My Work tab", () => {
  test("parseWorkTab / isWorkTab: the three known tabs, case-insensitive; everything else is null/false", () => {
    assert.deepEqual([...WORK_TABS], ["EXTRA_PRACTICE", "REVIEW", "PREVIOUS_TERM"]);
    for (const k of WORK_TABS) { assert.ok(isWorkTab(k)); assert.equal(parseWorkTab(k.toLowerCase()), k); assert.ok(WORK_TAB_LABEL[k]); }
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

  test("auto-clear (the exact scenario asked about): an old COMPLETED Extra-Practice row + a new ACTIVE untagged reassignment of the SAME skill → the merged row's tab clears, it is NOT stuck under Extra Practice", () => {
    const merged = mergeWorkItems([
      { ...base, assignmentId: "old", track: "CURRICULUM", source: "CURRICULUM", tab: "EXTRA_PRACTICE", startAt: null, dueAt: null, status: "COMPLETED" },
      { ...base, assignmentId: "new", track: "CURRICULUM", source: "CURRICULUM", tab: null, startAt: null, dueAt: new Date(now.getTime() + 5 * DAY).toISOString(), status: "IN_PROGRESS" },
    ], now);
    assert.equal(merged.length, 1, "one row (same skillId)");
    assert.equal(merged[0].tab, null, "the active untagged reassignment leads → tab clears");
    assert.equal(merged[0].assignmentId, "new", "the leading row's own fields are kept too");
    assert.equal(merged[0].status, "In progress");
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
      { ...base, assignmentId: "old", track: "CURRICULUM", source: "CURRICULUM", tab: "REVIEW", startAt: null, dueAt: null, status: "COMPLETED" },
    ], now);
    assert.equal(a[0].tab, null);
  });

  test("groupMyWork leaves a tabbed row out of WEEK/LATER/DONE entirely; an untagged row shows as usual", () => {
    const rows = [
      { assignmentId: "x1", status: "In progress" as const, overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "Tagged", tab: "EXTRA_PRACTICE" as const },
      { assignmentId: "x2", status: "In progress" as const, overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "Untagged", tab: null },
      { assignmentId: "x3", status: "Done" as const, overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "Tagged done", tab: "REVIEW" as const },
    ];
    const [week, later, done] = groupMyWork(rows, now);
    const everyShownId = [...week.types, ...later.types, ...done.types].flatMap((g) => g.rows.map((r) => r.assignmentId));
    assert.ok(!everyShownId.includes("x1"), "the tabbed in-progress row is not in WEEK/LATER");
    assert.ok(!everyShownId.includes("x3"), "the tabbed done row is not in DONE either — it lives only in its tab section");
    assert.ok(everyShownId.includes("x2"), "the untagged row shows normally");
  });

  test("tabGroups: one section per tab that actually has rows, in WORK_TABS order; empty tabs are left out", () => {
    const rows = [
      { assignmentId: "x1", status: "In progress" as const, overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "A", tab: "PREVIOUS_TERM" as const },
      { assignmentId: "x2", status: "Not started" as const, overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "B", tab: "EXTRA_PRACTICE" as const },
      { assignmentId: "x3", status: "Not started" as const, overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "C", tab: "EXTRA_PRACTICE" as const },
      { assignmentId: "x4", status: "Not started" as const, overdue: false, dueAt: null, sourceKey: "CURRICULUM", skill: "D", tab: null },
    ];
    const g = tabGroups(rows);
    assert.deepEqual(g.map((x) => x.tab), ["EXTRA_PRACTICE", "PREVIOUS_TERM"], "WORK_TABS order, REVIEW left out (no rows)");
    assert.equal(g.find((x) => x.tab === "EXTRA_PRACTICE")!.rows.length, 2);
    assert.equal(g.find((x) => x.tab === "PREVIOUS_TERM")!.rows.length, 1);
    assert.ok(!g.find((x) => x.tab === "REVIEW"));
  });
});
