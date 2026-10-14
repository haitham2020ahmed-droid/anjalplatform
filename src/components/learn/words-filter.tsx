"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";

const chip = (on: boolean) => `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-surface text-ink ring-1 ring-line hover:ring-brand-teal"}`;

/** Grade → Unit → Selection, as links (the page reads ONE selection). */
export function WordsFilter({ base, grades, grade, units, unit, selections, sel, extra = {} }: {
  base: string; grades: number[]; grade: number; units: number[]; unit: number | null; selections: { key: string; name: string; unit: number; words: number }[]; sel: string | null; extra?: Record<string, string>;
}) {
  const t = useT();
  const href = (q: Record<string, string | number | null>) => `${base}?${new URLSearchParams(Object.entries({ ...extra, ...q }).filter(([, v]) => v !== null && v !== "").map(([k, v]) => [k, String(v)]))}`;
  return (
    <nav aria-label={t("Words")} className="mb-5 space-y-3">
      <div className="flex flex-wrap gap-2">{grades.map((g) => <Link key={g} prefetch={false} href={href({ grade: g })} aria-current={g === grade ? "page" : undefined} className={chip(g === grade)}>{t("Grade {n}", { n: g })}</Link>)}</div>
      <div className="flex flex-wrap gap-2">{units.map((u) => <Link key={u} prefetch={false} href={href({ grade, unit: u })} aria-current={u === unit ? "page" : undefined} className={chip(u === unit)}>{t("Unit {n}", { n: u })}</Link>)}</div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {selections.map((x) => (
          <li key={x.key}>
            <Link prefetch={false} href={href({ sel: x.key })} aria-current={x.key === sel ? "page" : undefined}
              className={`flex min-h-12 items-center justify-between gap-2 rounded-2xl px-4 py-2 ${x.key === sel ? "bg-brand-navy text-white" : "bg-surface text-ink shadow-card ring-1 ring-line hover:ring-brand-teal"}`}>
              <span><span className="block text-xs opacity-80">{t("Unit {n}", { n: x.unit })}</span><span lang="en" className="font-semibold">{x.name}</span></span>
              <span className="text-sm opacity-80" dir="ltr">{x.words}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
