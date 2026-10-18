/**
 * 🧾 NAFS → Reports → Compare: the "In one line" sentence at the top and the SUMMARY + ACTION PLAN at the end of each
 * mode (Tests & Booklets · Practice · All). PURE: they read the comparison the page already loaded (no database).
 * Rules (owner r75):
 *   - students who went down → a small group + follow up (their names);
 *   - a standard that went down for the class → re-teach it to the class;
 *   - students who went up → give them a bigger challenge;
 *   - students who took only one of the two assessments → a make-up test.
 * Sentences and button labels are interface strings (English keys + {vars}: src/i18n/en.ts + ar.ts).
 */
import type { AllCompare, PracticeCompare, TestsCompare } from "../server/nafs/compare";
import { act, fit, hrefs, line, nameList, type Line, type PlanAction, type Summary } from "./report-summary";

/** Sentences (interface strings). */
export const C = {
  // in one line
  oneNone: "Not enough results yet to compare.",
  oneUp: "More students went up than down: {up} up, {down} down.",
  oneDown: "More students went down than up: {down} down, {up} up.",
  oneEven: "As many students went up as down: {up} up, {down} down.",
  oneAll: "{excellent} excellent, {support} need support, {other} in between or too early to judge.",
  // tests & practice
  counts: "{up} went up, {same} stayed the same and {down} went down (of {n} compared).",
  none: "No student has results in both yet.",
  avg: "The class average went from {a}% to {b}%.",
  avgPractice: "Practice accuracy went from {a}% to {b}% (careful answers only).",
  few: "Careful: the two share only {n} of {total} standards, so the change uses those {n} only.",
  noShared: "Careful: the two share no standard, so the whole-test scores are compared.",
  down: "Went down: {names}.",
  down0: "Nobody went down by 5 points or more.",
  stdDown: "Biggest drop: {std} ({a}% → {b}%).",
  stdUp: "Biggest rise: {std} ({a}% → {b}%).",
  only: "Took only one of the two: {names}.",
  tooFew: "Not enough practice to compare yet: {names}.",
  guesses: "{n} answers were left out (quick guesses).",
  nextDown: "Next step: meet the {n} students who went down in a small group and follow up with them.",
  nextStd: "Next step: re-teach {std} to the whole class.",
  nextOnly: "Next step: give a make-up test to the {n} students who took only one.",
  nextUp: "Next step: give the {n} students who went up a bigger challenge.",
  nextKeep: "Next step: keep going and compare again after the next test.",
  nextNone: "Next step: give a second test or practice, then compare again.",
  nextPracticeMore: "Next step: ask the students to practise more so there is enough to compare.",
  // all
  allExcellent: "Excellent: {names}.",
  allSupport: "Needs support: {names}.",
  allSupport0: "Nobody went down in both tests and practice.",
  allNotUsed: "Understands, but not used to the test yet: {names}.",
  allLess: "Practising less: {names}.",
  allEarly: "{n} students are too early to judge (not enough results).",
  nextAllSupport: "Next step: meet {names} in a small group and contact their parents.",
  nextAllNotUsed: "Next step: practise the test format and timing with {names}.",
  nextAllLess: "Next step: encourage {names} to practise more.",
  nextAllExcellent: "Next step: give {names} a bigger challenge.",
} as const;

/** Button labels (interface strings). */
export const CA = {
  group: "Small group for those who went down ({n})",
  parent: "Contact {name}'s parent",
  reteach: "Re-teach {std} to the class",
  challenge: "Give a bigger challenge ({n})",
  makeup: "Make-up test ({n})",
  practise: "Practise the test format ({n})",
  encourage: "Encourage more practice ({n})",
  followup: "Follow up with the teacher",
} as const;

const q = (pairs: [string, string][]) => new URLSearchParams(pairs).toString();
/** NAFS links (the pages that already do each thing). */
export const compareHrefs = {
  /** adaptive practice on standards, prefilled with the class and the students */
  practice: (classId: string, codes: string[], studentIds: string[] = []) => `/teacher/nafs?${q([["tab", "adaptive"], ["class", classId], ...codes.map((c) => ["target", c] as [string, string]), ...studentIds.map((x) => ["sid", x] as [string, string])])}#give`,
  /** a NAFS test (the format and the timing), prefilled with the class and the standards */
  test: (classId: string, codes: string[]) => `/teacher/nafs/tests/new?${q([["start", "CHOOSE"], ["class", classId], ...(codes.length ? [["codes", codes.join(",")] as [string, string]] : [])])}`,
  /** the assessment they missed (assign it again to them) */
  makeup: (testId: string) => `/teacher/nafs/tests/${encodeURIComponent(testId)}`,
};

interface Ctx { classId: string | null; admin?: boolean }
/** The class of the most people in a list (a small group needs ONE class). */
const classOfMost = (list: readonly { classId: string }[], fallback: string | null): string | null => {
  if (fallback) return fallback;
  const n = new Map<string, number>();
  for (const x of list) n.set(x.classId, (n.get(x.classId) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
};
const inClass = <T extends { classId: string }>(list: readonly T[], classId: string | null) => (classId ? list.filter((x) => x.classId === classId) : [...list]);

/** "In one line": more up than down, or the other way (tests and practice). */
export function oneLineUpDown(r: { improved: number; dropped: number; rows: readonly unknown[] }): Line {
  if (!r.rows.length) return line(C.oneNone, "info");
  const v = { up: r.improved, down: r.dropped };
  return line(r.improved > r.dropped ? C.oneUp : r.dropped > r.improved ? C.oneDown : C.oneEven, r.dropped > r.improved ? "help" : r.improved > r.dropped ? "good" : "info", v);
}

/** Tests & Booklets: the summary sentences + action plan. */
export function compareTestsSummary(r: TestsCompare, o: Ctx): Summary {
  const down = r.rows.filter((x) => x.arrow === "DOWN"), up = r.rows.filter((x) => x.arrow === "UP");
  const actions: PlanAction[] = [];
  if (!r.rows.length) {
    const lines: Line[] = [line(C.none, "info")];
    if (r.onlyOne.length) lines.push(line(C.only, "help", { names: nameList(r.onlyOne) }));
    const missing = r.onlyOne.find((x) => x.took === "A") ? r.b : r.a;
    if (r.onlyOne.length && missing) actions.push(act("open", CA.makeup, compareHrefs.makeup(missing.id), { n: r.onlyOne.length }));
    lines.push(line(r.onlyOne.length ? C.nextOnly : C.nextNone, "next", { n: r.onlyOne.length }));
    return { lines, actions };
  }
  const lines: (Line | null)[] = [
    line(C.counts, "info", { up: r.improved, same: r.same, down: r.dropped, n: r.rows.length }),
    r.avgBefore !== null && r.avgAfter !== null ? line(C.avg, "info", { a: r.avgBefore, b: r.avgAfter }) : null,
    !r.shared.length ? line(C.noShared, "help") : r.fewShared ? line(C.few, "help", { n: r.shared.length, total: r.shared.length + r.onlyA.length + r.onlyB.length }) : null,
    down.length ? line(C.down, "help", { names: nameList(down) }) : line(C.down0, "good"),
    r.mostDropped ? line(C.stdDown, "skill", { std: r.mostDropped.short, a: r.mostDropped.before ?? 0, b: r.mostDropped.after ?? 0 }) : r.mostImproved ? line(C.stdUp, "good", { std: r.mostImproved.short, a: r.mostImproved.before ?? 0, b: r.mostImproved.after ?? 0 }) : null,
    r.onlyOne.length ? line(C.only, "help", { names: nameList(r.onlyOne) }) : null,
  ];
  // the action plan, most urgent first
  if (down.length) {
    const cid = classOfMost(down, o.classId);
    const mine = inClass(down, cid);
    if (cid) actions.push(act("group", CA.group, hrefs.group(cid, mine.map((x) => x.id)), { n: mine.length }));
    actions.push(act("parent", CA.parent, hrefs.parent(down[0].id), { name: down[0].name }));
  }
  const cidAll = classOfMost(r.rows, o.classId);
  if (r.mostDropped && cidAll) actions.push(act("reteach", CA.reteach, compareHrefs.practice(cidAll, [r.mostDropped.code]), { std: r.mostDropped.short }));
  if (up.length) {
    const cid = classOfMost(up, o.classId);
    const mine = inClass(up, cid);
    if (cid) actions.push(act("practice", CA.challenge, compareHrefs.practice(cid, r.shared, mine.map((x) => x.id)), { n: mine.length }));
  }
  if (r.onlyOne.length) {
    const missing = r.onlyOne.filter((x) => x.took === "A").length >= r.onlyOne.filter((x) => x.took === "B").length ? r.b : r.a;
    if (missing) actions.push(act("open", CA.makeup, compareHrefs.makeup(missing.id), { n: r.onlyOne.length }));
  }
  if (o.admin) actions.push(act("followup", CA.followup, hrefs.followup()));
  const next = down.length ? line(C.nextDown, "next", { n: down.length })
    : r.mostDropped ? line(C.nextStd, "next", { std: r.mostDropped.short })
    : r.onlyOne.length ? line(C.nextOnly, "next", { n: r.onlyOne.length })
    : up.length ? line(C.nextUp, "next", { n: up.length })
    : line(C.nextKeep, "next");
  return { lines: fit([...lines, next]), actions: actions.slice(0, 5) };
}

/** Practice: the summary sentences + action plan. */
export function comparePracticeSummary(r: PracticeCompare, o: Ctx): Summary {
  const down = r.rows.filter((x) => x.arrow === "DOWN"), up = r.rows.filter((x) => x.arrow === "UP");
  const actions: PlanAction[] = [];
  const guessL = r.guesses + r.unreliable ? line(C.guesses, "info", { n: r.guesses + r.unreliable }) : null;
  if (!r.rows.length) {
    const lines: (Line | null)[] = [line(C.none, "info"), r.tooFew.length ? line(C.tooFew, "help", { names: nameList(r.tooFew) }) : null, guessL, line(r.tooFew.length ? C.nextPracticeMore : C.nextNone, "next")];
    return { lines: fit(lines), actions };
  }
  // the standards / skills the students who went down practised (for the re-teach / group practice)
  const lines: (Line | null)[] = [
    line(C.counts, "info", { up: r.improved, same: r.same, down: r.dropped, n: r.rows.length }),
    r.avgBefore !== null && r.avgAfter !== null ? line(C.avgPractice, "info", { a: r.avgBefore, b: r.avgAfter }) : null,
    down.length ? line(C.down, "help", { names: nameList(down) }) : line(C.down0, "good"),
    r.tooFew.length ? line(C.tooFew, "help", { names: nameList(r.tooFew) }) : null,
    guessL,
  ];
  if (down.length) {
    const cid = classOfMost(down, o.classId);
    const mine = inClass(down, cid);
    if (cid) actions.push(act("group", CA.group, hrefs.group(cid, mine.map((x) => x.id)), { n: mine.length }));
    actions.push(act("parent", CA.parent, hrefs.parent(down[0].id), { name: down[0].name }));
  }
  if (up.length) {
    const cid = classOfMost(up, o.classId);
    const mine = inClass(up, cid);
    if (cid) actions.push(act("practice", CA.challenge, compareHrefs.practice(cid, [], mine.map((x) => x.id)), { n: mine.length }));
  }
  if (r.tooFew.length) {
    const cid = classOfMost(r.tooFew, o.classId);
    const mine = inClass(r.tooFew, cid);
    if (cid) actions.push(act("practice", CA.encourage, compareHrefs.practice(cid, [], mine.map((x) => x.id)), { n: mine.length }));
  }
  if (o.admin) actions.push(act("followup", CA.followup, hrefs.followup()));
  const next = down.length ? line(C.nextDown, "next", { n: down.length }) : up.length ? line(C.nextUp, "next", { n: up.length }) : r.tooFew.length ? line(C.nextPracticeMore, "next") : line(C.nextKeep, "next");
  return { lines: fit([...lines, next]), actions: actions.slice(0, 5) };
}

/** All: "In one line". */
export function oneLineAll(r: AllCompare): Line {
  const known = r.rows.length - r.counts.TOO_EARLY;
  if (!known) return line(C.oneNone, "info");
  return line(C.oneAll, r.counts.SUPPORT > r.counts.EXCELLENT ? "help" : "info", { excellent: r.counts.EXCELLENT, support: r.counts.SUPPORT, other: r.rows.length - r.counts.EXCELLENT - r.counts.SUPPORT });
}

/** All: the summary sentences + action plan (one button per case that has students). */
export function compareAllSummary(r: AllCompare, o: Ctx): Summary {
  const of = (k: keyof AllCompare["counts"]) => r.rows.filter((x) => x.case === k);
  const ex = of("EXCELLENT"), sup = of("SUPPORT"), notUsed = of("NOT_USED"), less = of("LESS_PRACTICE"), early = of("TOO_EARLY");
  const lines: (Line | null)[] = [
    sup.length ? line(C.allSupport, "help", { names: nameList(sup) }) : line(C.allSupport0, "good"),
    notUsed.length ? line(C.allNotUsed, "skill", { names: nameList(notUsed) }) : null,
    less.length ? line(C.allLess, "help", { names: nameList(less) }) : null,
    ex.length ? line(C.allExcellent, "good", { names: nameList(ex) }) : null,
    early.length ? line(C.allEarly, "info", { n: early.length }) : null,
  ];
  const actions: PlanAction[] = [];
  if (sup.length) {
    const cid = classOfMost(sup, o.classId);
    const mine = inClass(sup, cid);
    if (cid) actions.push(act("group", CA.group, hrefs.group(cid, mine.map((x) => x.id)), { n: mine.length }));
    actions.push(act("parent", CA.parent, hrefs.parent(sup[0].id), { name: sup[0].name }));
  }
  if (notUsed.length) { const cid = classOfMost(notUsed, o.classId); if (cid) actions.push(act("practice", CA.practise, compareHrefs.test(cid, r.tests.shared), { n: inClass(notUsed, cid).length })); }
  if (less.length) { const cid = classOfMost(less, o.classId); if (cid) actions.push(act("practice", CA.encourage, compareHrefs.practice(cid, [], inClass(less, cid).map((x) => x.id)), { n: inClass(less, cid).length })); }
  if (ex.length) { const cid = classOfMost(ex, o.classId); if (cid) actions.push(act("practice", CA.challenge, compareHrefs.practice(cid, r.tests.shared, inClass(ex, cid).map((x) => x.id)), { n: inClass(ex, cid).length })); }
  if (r.tests.onlyOne.length) { const missing = r.tests.onlyOne.filter((x) => x.took === "A").length >= r.tests.onlyOne.filter((x) => x.took === "B").length ? r.tests.b : r.tests.a; if (missing) actions.push(act("open", CA.makeup, compareHrefs.makeup(missing.id), { n: r.tests.onlyOne.length })); }
  if (o.admin) actions.push(act("followup", CA.followup, hrefs.followup()));
  const next = sup.length ? line(C.nextAllSupport, "next", { names: nameList(sup) })
    : notUsed.length ? line(C.nextAllNotUsed, "next", { names: nameList(notUsed) })
    : less.length ? line(C.nextAllLess, "next", { names: nameList(less) })
    : ex.length ? line(C.nextAllExcellent, "next", { names: nameList(ex) })
    : early.length === r.rows.length ? line(C.nextNone, "next") : line(C.nextKeep, "next");
  return { lines: fit([...lines, next]), actions: actions.slice(0, 5) };
}

/** A summary as plain English text (the Excel / PDF file): {vars} filled in. */
export const plainLine = (l: Line) => l.key.replace(/\{(\w+)\}/g, (_m, k: string) => String(l.vars?.[k] ?? ""));
