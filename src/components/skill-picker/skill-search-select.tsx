"use client";
/**
 * 🧩 A compact skill picker for small forms (e.g. the admin AI tools cards) — the shared combobox: clicking it opens
 * EVERY skill at once, grouped by domain (Reading · Grammar · Vocabulary · Writing), A–Z, each with its question count;
 * typing finds a skill by any of its names (case, "&" / "and" and apostrophes ignored). A skill without published
 * questions is disabled ("0 Q") unless `allowEmpty`.
 */
import { useMemo } from "react";
import { useT } from "@/i18n/client";
import { Combo, type ComboOption } from "@/components/ui/combo";
import { SKILL_TABS, questionBadge, skillMatches, type SkillTab } from "@/lib/skill-picker";
import type { SkillListRow } from "./skill-list-picker";

export function SkillSearchSelect({ skills, name = "skillId", defaultValue = "", emptyLabel, allowEmpty, className = "" }: {
  skills: readonly SkillListRow[]; name?: string; defaultValue?: string;
  /** the first option (value ""), e.g. "All skills" */
  emptyLabel?: string; allowEmpty?: boolean; className?: string;
}) {
  const t = useT();
  const options = useMemo<ComboOption[]>(() => {
    const groups = SKILL_TABS.filter((g) => g.key !== "ALL");
    const rows = groups.flatMap((g) => skills.filter((k) => k.tab === (g.key as SkillTab)).sort((a, b) => a.name.localeCompare(b.name)).map((k) => ({
      value: k.id, label: k.name, hint: questionBadge(k.questions), group: t(g.label), keywords: (k.names ?? []).join(" "), disabled: !allowEmpty && k.questions < 1,
    })));
    return emptyLabel !== undefined ? [{ value: "", label: t(emptyLabel) }, ...rows] : rows;
  }, [skills, allowEmpty, emptyLabel, t]);
  // the shared search rules (filterSkills / skillMatches: any of the skill's names, "&" = "and", apostrophes ignored)
  const byId = useMemo(() => new Map(skills.map((k) => [k.id, k])), [skills]);
  const match = useMemo(() => (o: ComboOption, q: string) => { const k = byId.get(o.value); return k ? skillMatches(k, q) : !o.value; }, [byId]);
  return <Combo name={name} label={t("Skill")} defaultValue={defaultValue} options={options} match={match} placeholder={t("Search skills…")} className={className} dir="ltr" />;
}
