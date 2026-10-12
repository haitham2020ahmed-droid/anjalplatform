"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { EmptyState } from "@/components/ui-kit";

type Group = { key: string; title: string; blurb: string; tools: { href: string; icon: string; label: string; en: string }[] };

/** The searchable list of every admin tool (labels already translated; the English name and the address match too). */
export function AllToolsList({ groups }: { groups: Group[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (x: Group["tools"][number]) => { const hay = `${x.label} ${x.en} ${x.href.replace(/[/?=&-]/g, " ")}`.toLowerCase(); return words.every((w) => hay.includes(w)); };
  const shown = groups.map((g) => ({ ...g, tools: g.tools.filter(hit) })).filter((g) => g.tools.length);
  return (
    <>
      <div className="mt-5">
        <label htmlFor="tool-q" className="sr-only">{t("Find a tool")}</label>
        <input id="tool-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
          placeholder={t("Type a word, e.g. MAP, backup, users")}
          className="min-h-12 w-full rounded-2xl bg-white px-4 text-lg ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
      </div>
      {shown.length === 0 && <div className="mt-6"><EmptyState compact icon="🔍" title="Nothing matches your search" /></div>}
      {shown.map((g) => (
        <section key={g.key} id={g.key} aria-labelledby={`${g.key}-h`} className="mt-8 scroll-mt-32">
          <h2 id={`${g.key}-h`} className="flex items-center gap-2 text-xl font-semibold text-brand-navy">{g.title}<span className="text-base font-normal text-slate-500">· {g.tools.length}</span></h2>
          <p className="mb-3 text-slate-600">{g.blurb}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.tools.map((x) => (
              <li key={x.href} className="min-w-0">
                <Link prefetch={false} href={x.href} className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">
                  <span aria-hidden="true" className="w-7 shrink-0 text-center text-xl">{x.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{x.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
