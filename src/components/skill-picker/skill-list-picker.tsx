"use client";
/**
 * 🧩 The skill list every form-based picker shows (worksheets, week plan, Assignments → New, QR skill games, writing
 * tasks, ReadMaster …): a "Search skills…" box (any name of the skill; case, "&" / "and" and apostrophes ignored),
 * the domain tabs All / Reading / Grammar / Vocabulary / Writing, and a two-column A–Z list with each skill's
 * question count. A skill without published questions is shown disabled ("0 Q").
 *
 *   mode "single"    one radio per skill (form field `name`); `optional` adds "None"
 *   mode "multiple"  one checkbox per skill (form field `name`, repeated)
 *   mode "link"      each skill is a link: `${href}${skillId}` (e.g. "/teacher/worksheet?grade=4&skillId=")
 *
 * The rows come from the one source (server/skills/picker.ts → skillPickerList), so every picker lists every skill.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { SKILL_TABS, filterSkills, questionBadge, type PickerSkill, type SkillTabFilter } from "@/lib/skill-picker";

export type SkillListRow = Pick<PickerSkill, "id" | "name" | "names" | "tab" | "questions">;

export interface SkillListPickerProps {
  skills: readonly SkillListRow[];
  mode?: "single" | "multiple" | "link";
  /** the form field (single / multiple) */
  name?: string;
  /** chosen skill id(s) at the start */
  defaultValue?: string | readonly string[];
  /** single: a skill must be chosen */
  required?: boolean;
  /** single: offer "None" */
  optional?: boolean;
  /** link: the link before the skill id */
  href?: string;
  /** link: the skill shown as chosen */
  current?: string | null;
  /** a skill without questions may still be chosen (e.g. a writing task's optional skill) */
  allowEmpty?: boolean;
  legend?: string;
  /** list height (Tailwind class) */
  height?: string;
}

export function SkillListPicker({ skills, mode = "single", name = "skillId", defaultValue, required, optional, href = "", current, allowEmpty, legend = "Skills — choose one or more", height = "max-h-80" }: SkillListPickerProps) {
  const t = useT();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<SkillTabFilter>("ALL");
  const start = useMemo(() => new Set(Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue as string] : []), [defaultValue]);
  const [chosen, setChosen] = useState<Set<string>>(start);
  const rows = useMemo(() => filterSkills(skills, q, tab), [skills, q, tab]);
  // chosen skills hidden by the search or tab still go with the form
  const hidden = [...chosen].filter((id) => !rows.some((k) => k.id === id));
  const pick = (id: string) => setChosen((c) => {
    if (mode === "single") return new Set(id ? [id] : []);
    const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-slate-700">{t(legend)}</legend>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        placeholder={t("Search skills…")} aria-label={t("Search skills…")} dir="ltr" autoComplete="off"
        className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" />
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("Filter")}>
        {SKILL_TABS.map((f) => (
          <button key={f.key} type="button" aria-pressed={tab === f.key} onClick={() => setTab(f.key)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ${tab === f.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{t(f.label)}</button>
        ))}
      </div>
      {mode !== "link" && hidden.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <ul className={`mt-3 grid ${height} gap-1 overflow-y-auto rounded-2xl p-2 ring-1 ring-slate-200 sm:grid-cols-2`} data-testid="skill-list">
        {optional && mode === "single" && !q && (
          <li><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
            <input type="radio" name={name} value="" checked={chosen.size === 0} onChange={() => pick("")} className="h-5 w-5" />
            <span className="text-slate-500">{t("None")}</span>
          </label></li>
        )}
        {rows.length === 0 && <li className="p-3 text-sm text-slate-600">{t("No skills found.")}</li>}
        {rows.map((k) => {
          const off = !allowEmpty && k.questions < 1;
          const badge = <span className="shrink-0 text-xs text-slate-400" dir="ltr">{questionBadge(k.questions)}</span>;
          if (mode === "link") {
            const on = current === k.id;
            return (
              <li key={k.id}>
                {off ? (
                  <span className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-400" aria-disabled="true"><bdi dir="ltr" className="min-w-0 flex-1">{k.name}</bdi>{badge}</span>
                ) : (
                  <Link prefetch={false} href={`${href}${encodeURIComponent(k.id)}`} aria-current={on ? "true" : undefined}
                    className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-sm ${on ? "bg-brand-navy text-white" : "hover:bg-slate-50"}`}><bdi dir="ltr" className="min-w-0 flex-1">{k.name}</bdi>{badge}</Link>
                )}
              </li>
            );
          }
          const on = chosen.has(k.id);
          return (
            <li key={k.id}>
              <label className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-sm ${off && !on ? "cursor-not-allowed text-slate-400" : "cursor-pointer hover:bg-slate-50"}`} title={off ? t("No questions yet") : undefined}>
                <input type={mode === "single" ? "radio" : "checkbox"} name={name} value={k.id} checked={on} disabled={off && !on}
                  required={mode === "single" && required && chosen.size === 0} onChange={() => pick(k.id)} className="h-5 w-5" />
                <bdi dir="ltr" className="min-w-0 flex-1">{k.name}</bdi>{badge}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
