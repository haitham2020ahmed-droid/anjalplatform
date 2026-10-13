"use client";
/**
 * 🧩 A compact skill picker for small forms (e.g. the admin AI tools cards): a "Search skills…" box above a drop-down
 * of every skill, grouped by domain (Reading · Grammar · Vocabulary · Writing), A–Z, each with its question count.
 * The search finds a skill by any of its names (case, "&" / "and" and apostrophes ignored). A skill without
 * published questions is disabled ("0 Q") unless `allowEmpty`.
 */
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { SKILL_TABS, filterSkills, questionBadge, type SkillTab } from "@/lib/skill-picker";
import type { SkillListRow } from "./skill-list-picker";

export function SkillSearchSelect({ skills, name = "skillId", defaultValue = "", emptyLabel, allowEmpty, className = "" }: {
  skills: readonly SkillListRow[]; name?: string; defaultValue?: string;
  /** the first option (value ""), e.g. "All skills" */
  emptyLabel?: string; allowEmpty?: boolean; className?: string;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [value, setValue] = useState(defaultValue);
  const rows = useMemo(() => filterSkills(skills, q), [skills, q]);
  const chosen = skills.find((k) => k.id === value);
  const groups = SKILL_TABS.filter((g) => g.key !== "ALL").map((g) => ({ ...g, rows: rows.filter((k) => k.tab === (g.key as SkillTab)) })).filter((g) => g.rows.length);
  return (
    <span className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        placeholder={t("Search skills…")} aria-label={t("Search skills…")} dir="ltr" autoComplete="off" className="min-h-10 rounded-lg border border-slate-300 px-3" />
      <select name={name} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("Skill")} className="min-h-10 rounded-lg border border-slate-300 px-3">
        {emptyLabel !== undefined && <option value="">{t(emptyLabel)}</option>}
        {chosen && !rows.some((k) => k.id === chosen.id) && <option value={chosen.id}>{chosen.name}</option>}
        {groups.map((g) => (
          <optgroup key={g.key} label={t(g.label)}>
            {g.rows.map((k) => <option key={k.id} value={k.id} disabled={!allowEmpty && k.questions < 1}>{k.name} · {questionBadge(k.questions)}</option>)}
          </optgroup>
        ))}
      </select>
      {q && !rows.length && <span className="text-xs text-slate-500">{t("No skills found.")}</span>}
    </span>
  );
}
