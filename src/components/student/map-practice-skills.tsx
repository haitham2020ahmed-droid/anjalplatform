"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { SkillStar } from "@/components/skills/skill-star";
import type { MapPracticeView } from "@/server/student/map-practice";
import type { MySkillsTab } from "@/server/skills/my-skills";

const CHIP = "inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold ring-1";
const STATUS_CHIPS: { key: MySkillsTab | "ALL"; label: string; icon: string }[] = [
  { key: "ALL", label: "All", icon: "" }, { key: "LEARNING", label: "Learning", icon: "◐" }, { key: "MASTERED", label: "Mastered", icon: "⭐" }, { key: "REVIEW", label: "Review", icon: "🔄" },
];

/**
 * 🗺️ "Your MAP practice" (owner r68 §B): every MAP-linked skill I practised, by MAP goal area, each with its star and a
 * Practise button; filter chips by goal area and by status; its own scroll area when the list is long. Never empty
 * words: with no practice yet it says where to start.
 */
export function MapPracticeSkills({ v }: { v: MapPracticeView }) {
  const t = useT();
  const [area, setArea] = useState<string>("ALL");
  const [status, setStatus] = useState<MySkillsTab | "ALL">("ALL");
  const shown = v.areas.filter((a) => area === "ALL" || a.key === area).map((a) => ({ ...a, skills: a.skills.filter((k) => status === "ALL" || k.tab === status) })).filter((a) => a.skills.length);
  return (
    <section id="map-practice" aria-labelledby="map-practice-h" data-testid="map-practice-skills" className="mt-6 rounded-3xl bg-green-50/70 p-5 ring-1 ring-green-100 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="map-practice-h" className="text-xl font-semibold text-brand-navy">{t("Your MAP practice")}</h2>
        {v.total > 0 && <span className="text-sm font-semibold text-slate-600" dir="ltr">⭐ {v.counts.MASTERED} · ◐ {v.counts.LEARNING}{v.counts.REVIEW ? ` · 🔄 ${v.counts.REVIEW}` : ""}</span>}
      </div>
      {v.total === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-4 text-slate-700 ring-1 ring-green-100">🌱 {t("Every skill you practise appears here with its star, by MAP goal area. Open My Study Plan or My Work to start.")}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("Goal area")}>
            <button type="button" aria-pressed={area === "ALL"} onClick={() => setArea("ALL")} className={`${CHIP} ${area === "ALL" ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{t("All areas")}</button>
            {v.areas.map((a) => <button key={a.key} type="button" aria-pressed={area === a.key} onClick={() => setArea(a.key)} className={`${CHIP} ${area === a.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{a.icon} {t(a.name)} <span className="text-xs opacity-80" dir="ltr">{a.skills.length}</span></button>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("Status")}>
            {STATUS_CHIPS.filter((c) => c.key === "ALL" || v.counts[c.key as MySkillsTab] > 0).map((c) => <button key={c.key} type="button" aria-pressed={status === c.key} onClick={() => setStatus(c.key)} className={`${CHIP} ${status === c.key ? "bg-emerald-700 text-white ring-emerald-700" : "bg-white text-slate-700 ring-slate-300"}`}>{c.icon} {t(c.label)}</button>)}
          </div>
          <div className="mt-3 max-h-[28rem] overflow-y-auto overscroll-contain rounded-2xl pe-1" data-testid="map-practice-scroll">
            {shown.length === 0 ? <p className="rounded-2xl bg-white p-4 text-sm text-slate-600">{t("No skill with this filter.")}</p> : shown.map((a) => (
              <div key={a.key} className="mb-3">
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">{a.icon} {t(a.name)} <span className="rounded-full bg-white px-2 text-xs ring-1 ring-slate-200" dir="ltr">{a.skills.length}</span></h3>
                <ul className="grid gap-2 md:grid-cols-2">
                  {a.skills.map((k) => (
                    <li key={k.key} data-testid="map-practice-skill" className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-slate-100">
                      <SkillStar info={{ status: k.status }} who="student" t={t} label={k.name} size={20} />
                      <span className="min-w-0 flex-1 font-semibold text-brand-navy" data-content lang="en">{k.name}</span>
                      <Link prefetch={false} href={k.href} className="inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-brand-purple">▶ {t("Practise")}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
