/**
 * 🇸🇦 NAFS center → SUGGESTED PLAN (owner r69): a plan built FROM the reports — the weakest Ministry standards
 *   - per class (the class's own % on each standard, tests and practice together, weakest first),
 *   - per group (the students — two or more — who share a weak standard),
 *   - per student (each student's own weakest standards, and strengths to keep),
 * each with ONE-CLICK assign (adaptive practice on exactly those standards for exactly those students) and "make a
 * test on these standards". Pure: it reads the Dashboard the Reports tab already builds (no extra database work).
 */
import { MOE_BY_CODE } from "./framework";
import { MIN_STD_ITEMS, practiceHref, testHref, WEAK_BELOW, type Dashboard } from "./dashboard";

/** At most this many standards per suggestion (a practice stays focused). */
export const PLAN_CODES = 3;
/** At most this many groups per class (the most shared weak standards). */
export const MAX_GROUPS = 6;
/** A standard at or over this is a strength. */
export const STRONG_FROM = 85;

export interface PlanStudent { id: string; name: string; pct: number | null }
export interface PlanItem {
  key: string; scope: "CLASS" | "GROUP" | "STUDENT"; classId: string; className: string;
  codes: string[]; students: PlanStudent[];
  /** the evidence: each standard with its % and the number of items behind it */
  evidence: { code: string; short: string; pct: number | null; n: number }[];
  title: string; practiceHref: string; testHref: string;
}
export interface ClassPlan { classId: string; className: string; students: number; withData: number; classItem: PlanItem | null; groups: PlanItem[]; perStudent: PlanItem[]; strengths: { code: string; short: string; pct: number | null }[] }
export interface SuggestedPlan { classes: ClassPlan[]; noData: boolean }

const short = (c: string) => MOE_BY_CODE.get(c)?.short ?? c;
const titleOf = (codes: string[]) => `NAFS plan: ${codes.map(short).join(" · ")}`.slice(0, 150);

export function suggestedPlan(d: Dashboard): SuggestedPlan {
  const classOf = new Map<string, { id: string; name: string }>();
  for (const c of d.school.classes) for (const m of c.members) classOf.set(m.id, { id: c.id, name: c.name });
  const cells = new Map(d.heat.students.map((x) => [x.id, x]));
  const classes: ClassPlan[] = d.school.classes.map((c) => {
    // the class on each standard: every student's cells pooled (weighted by the items behind them)
    const acc = new Map<string, { sum: number; n: number }>();
    let withData = 0;
    for (const m of c.members) {
      const h = cells.get(m.id);
      if (!h || !Object.keys(h.cells).length) continue;
      withData++;
      for (const [code, cell] of Object.entries(h.cells)) { if (cell.pct === null || !cell.n) continue; const a = acc.get(code) ?? { sum: 0, n: 0 }; a.sum += (cell.pct * cell.n) / 100; a.n += cell.n; acc.set(code, a); }
    }
    const rows = [...acc].map(([code, a]) => ({ code, short: short(code), pct: a.n ? Math.floor((100 * a.sum) / a.n + 0.5) : null, n: a.n })).filter((x) => x.n >= MIN_STD_ITEMS);
    const weak = rows.filter((x) => (x.pct ?? 100) < WEAK_BELOW).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || a.code.localeCompare(b.code)).slice(0, PLAN_CODES);
    const strengths = rows.filter((x) => (x.pct ?? 0) >= STRONG_FROM).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, PLAN_CODES).map((x) => ({ code: x.code, short: x.short, pct: x.pct }));
    const make = (scope: PlanItem["scope"], key: string, codes: string[], students: PlanStudent[], evidence: PlanItem["evidence"]): PlanItem => ({
      key, scope, classId: c.id, className: c.name, codes, students, evidence, title: titleOf(codes),
      practiceHref: practiceHref(c.id, codes, scope === "CLASS" ? [] : students.map((x) => x.id)), testHref: testHref(c.id, codes),
    });
    const classItem = weak.length ? make("CLASS", `class:${c.id}`, weak.map((x) => x.code), [], weak) : null;
    // groups: the students (2 or more) who share a weak standard — the most shared first
    const shared = new Map<string, PlanStudent[]>();
    for (const m of c.members) {
      const h = cells.get(m.id);
      for (const [code, x] of Object.entries(h?.cells ?? {})) if (x.n >= MIN_STD_ITEMS && x.pct !== null && x.pct < WEAK_BELOW) shared.set(code, [...(shared.get(code) ?? []), { id: m.id, name: m.name, pct: x.pct }]);
    }
    const groups = [...shared].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, MAX_GROUPS)
      .map(([code, l]) => { const st = [...l].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || a.name.localeCompare(b.name)); const pct = rows.find((r) => r.code === code); return make("GROUP", `group:${c.id}:${code}`, [code], st, [{ code, short: short(code), pct: pct?.pct ?? null, n: pct?.n ?? 0 }]); });
    // each student's own weakest standards
    const perStudent = c.members.flatMap((m) => {
      const h = cells.get(m.id);
      if (!h) return [];
      const mine = Object.entries(h.cells).filter(([, x]) => x.n >= MIN_STD_ITEMS && x.pct !== null && x.pct < WEAK_BELOW).sort((a, b) => (a[1].pct ?? 0) - (b[1].pct ?? 0) || a[0].localeCompare(b[0])).slice(0, PLAN_CODES);
      if (!mine.length) return [];
      return [make("STUDENT", `student:${m.id}`, mine.map(([k]) => k), [{ id: m.id, name: m.name, pct: h.pct }], mine.map(([k, x]) => ({ code: k, short: short(k), pct: x.pct, n: x.n })))];
    });
    return { classId: c.id, className: c.name, students: c.students, withData, classItem, groups, perStudent, strengths };
  });
  return { classes, noData: !classes.some((c) => c.withData > 0) };
}

/** A student's strengths and weaknesses from the reports' cells (enough items; strongest / weakest first; 2 each). */
export function strengthsOf(cells: Record<string, { pct: number | null; n: number }>): { strong: string[]; weak: string[] } {
  const ok = Object.entries(cells).filter(([, c]) => c.n >= MIN_STD_ITEMS && c.pct !== null);
  return {
    strong: ok.filter(([, c]) => c.pct! >= STRONG_FROM).sort((a, b) => b[1].pct! - a[1].pct! || a[0].localeCompare(b[0])).slice(0, 2).map(([k]) => k),
    weak: ok.filter(([, c]) => c.pct! < WEAK_BELOW).sort((a, b) => a[1].pct! - b[1].pct! || a[0].localeCompare(b[0])).slice(0, 2).map(([k]) => k),
  };
}
