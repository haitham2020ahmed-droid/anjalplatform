"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n/client";

const AREA_ICON: Record<string, string> = { "Informational Text": "📰", "Literary Text": "📖", Vocabulary: "🔤", Writing: "✍️", "Grammar and Usage": "🧩", Mechanics: "✏️" };
export const areaIcon = (a: string) => AREA_ICON[a] ?? "📘";
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null);

/** One lesson as a card: its area, the title, where it came from, the due date, Start / Continue / Done. */
export function LessonCard({ href, title, area, tag, due, done, started }: { href: string; title: string; area: string; tag?: string; due?: string | null; done?: boolean; started?: boolean }) {
  const t = useT();
  return (
    <Link href={href} prefetch={false} className="tile group flex h-full flex-col gap-2 rounded-2xl p-4">
      <span className="flex items-center justify-between gap-2 text-xs font-semibold text-muted">
        <span><span aria-hidden="true">{areaIcon(area)}</span> {t(area)}</span>
        {tag && <span className="rounded-full bg-surface-2 px-2 py-0.5 ring-1 ring-line">{t(tag)}</span>}
      </span>
      <span className="font-display text-lg leading-snug text-ink" lang="en">{title}</span>
      <span className="mt-auto flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">{due ? <>{t("Due")} <span dir="ltr">{day(due)}</span></> : null}</span>
        <span className={`rounded-xl px-3 py-1 font-semibold ${done ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-brand-navy text-white"}`}>{done ? `✓ ${t("Done")}` : started ? t("Continue") : t("Start")}</span>
      </span>
    </Link>
  );
}

/** Every lesson by area (Reading / Language), each area folded open on tap. */
export function LearnAreaList({ areas, hrefBase }: { areas: { subject: string; goalArea: string; lessons: { code: string; title: string; done: boolean }[] }[]; hrefBase: string }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  if (!areas.length) return null;
  const subjects = [...new Set(areas.map((a) => a.subject))];
  return (
    <section aria-labelledby="all-lessons">
      <h2 id="all-lessons" className="mb-3 text-xl text-ink">{t("All lessons")}</h2>
      {subjects.map((s) => (
        <div key={s} className="mb-5">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-teal-ink">{t(s === "LANGUAGE" ? "Language" : "Reading")}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {areas.filter((a) => a.subject === s).map((a) => {
              const key = `${s}|${a.goalArea}`, on = open === key;
              return (
                <li key={key} className="rounded-2xl bg-surface shadow-card ring-1 ring-line">
                  <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : key)} className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 text-start font-semibold text-ink">
                    <span><span aria-hidden="true">{areaIcon(a.goalArea)}</span> {t(a.goalArea)}</span>
                    <span className="text-sm text-muted" dir="ltr">{a.lessons.filter((l) => l.done).length}/{a.lessons.length} <span aria-hidden="true">{on ? "▴" : "▾"}</span></span>
                  </button>
                  {on && (
                    <ul className="border-t border-line px-2 py-2">
                      {a.lessons.map((l) => (
                        <li key={l.code}><Link href={`${hrefBase}/${l.code}`} prefetch={false} className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 hover:bg-surface-2"><span lang="en">{l.title}</span>{l.done && <span className="text-emerald-700" aria-label={t("Done")}>✓</span>}</Link></li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
