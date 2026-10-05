/**
 * Reporting periods: last 7 days, last 30 days, current term, current semester,
 * school year, or a custom range. Terms and the academic year come from the school's
 * own calendar (Term / AcademicYear tables), so Saudi term dates work as entered.
 */
export type PeriodName = "LAST_7_DAYS" | "LAST_30_DAYS" | "TERM" | "SEMESTER" | "SCHOOL_YEAR" | "CUSTOM";

export interface Calendar {
  year: { name: string; start: Date; end: Date } | null;
  terms: { name: string; start: Date; end: Date }[];
}

export interface Period {
  name: PeriodName;
  label: string;
  from: Date;
  to: Date;
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function resolvePeriod(name: PeriodName, cal: Calendar, now = new Date(), custom?: { from: Date; to: Date }): Period {
  const today = startOfDay(now);
  const endOfToday = new Date(today.getTime() + DAY - 1);
  switch (name) {
    case "LAST_7_DAYS":
      return { name, label: "Last 7 days", from: new Date(today.getTime() - 6 * DAY), to: endOfToday };
    case "LAST_30_DAYS":
      return { name, label: "Last 30 days", from: new Date(today.getTime() - 29 * DAY), to: endOfToday };
    case "TERM": {
      const t = cal.terms.find((x) => x.start <= now && now <= x.end) ?? [...cal.terms].filter((x) => x.start <= now).sort((a, b) => b.start.getTime() - a.start.getTime())[0];
      if (t) return { name, label: t.name, from: t.start, to: t.end < now ? t.end : endOfToday };
      return resolvePeriod("LAST_30_DAYS", cal, now);
    }
    case "SEMESTER": {
      // first or second half of the academic year
      if (!cal.year) return resolvePeriod("TERM", cal, now);
      const mid = new Date((cal.year.start.getTime() + cal.year.end.getTime()) / 2);
      return now < mid
        ? { name, label: "First semester", from: cal.year.start, to: endOfToday }
        : { name, label: "Second semester", from: mid, to: endOfToday };
    }
    case "SCHOOL_YEAR":
      if (!cal.year) return { name, label: "Last 12 months", from: new Date(today.getTime() - 364 * DAY), to: endOfToday };
      return { name, label: cal.year.name, from: cal.year.start, to: cal.year.end < now ? cal.year.end : endOfToday };
    case "CUSTOM": {
      if (!custom || custom.from > custom.to) throw new Error("Choose a start date before the end date.");
      if (custom.to.getTime() - custom.from.getTime() > 2 * 366 * DAY) throw new Error("Choose a range of two years or less.");
      return { name, label: `${custom.from.toISOString().slice(0, 10)} to ${custom.to.toISOString().slice(0, 10)}`, from: startOfDay(custom.from), to: new Date(startOfDay(custom.to).getTime() + DAY - 1) };
    }
  }
}

/** Month buckets covering a period (for monthly growth charts). */
export function months(p: Period): { key: string; label: string; end: Date }[] {
  const out: { key: string; label: string; end: Date }[] = [];
  const d = new Date(Date.UTC(p.from.getUTCFullYear(), p.from.getUTCMonth(), 1));
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  while (d <= p.to && out.length < 36) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: `${names[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, end: new Date(Math.min(next.getTime() - 1, p.to.getTime())) });
    d.setTime(next.getTime());
  }
  return out;
}
