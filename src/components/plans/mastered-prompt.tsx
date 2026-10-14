import type { TFn } from "@/i18n";
import { repo } from "@/server/auth/next";
import { masteredBySkill } from "@/server/skills/status-extras";

/**
 * ⭐ The plan builder's "N students already mastered this skill — exclude them?" (Yes / No) before Send: one read for
 * the whole plan. Yes (default) = each skill goes only to the students who have not mastered it (send.ts).
 */
export async function PlanMasteredPrompt({ t, classId, plan, excluded }: { t: TFn; classId: string; plan: { id: string; name: string; studentIds: string[] }[]; excluded: boolean }) {
  if (!classId || !plan.length) return null;
  const klass = await repo.findUnique("Class", { id: classId });
  if (!klass) return null;
  const students = [...new Set(plan.flatMap((k) => k.studentIds))];
  const m = await masteredBySkill(repo, String(klass.schoolId), students, plan.map((k) => k.id)).catch(() => new Map<string, string[]>());
  const lines = plan.map((k) => ({ name: k.name, n: (m.get(k.id) ?? []).filter((id) => k.studentIds.includes(id)).length })).filter((x) => x.n > 0);
  if (!lines.length) return null;
  const total = lines.reduce((a, x) => a + x.n, 0);
  return (
    <fieldset data-testid="plan-exclude-mastered" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
      <legend className="sr-only">{t("Students who already mastered a skill")}</legend>
      <p className="font-semibold">⭐ {lines.length === 1 ? (lines[0].n === 1 ? t("1 student already mastered this skill — exclude them?") : t("{n} students already mastered this skill — exclude them?", { n: lines[0].n })) : t("{n} students already mastered some of these skills — exclude them?", { n: total })}</p>
      {lines.length > 1 && <p className="text-xs">{lines.map((x) => `${x.name} (${x.n})`).join(" · ")}</p>}
      <div className="mt-2 flex gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-3 py-1 font-semibold ring-1 ring-amber-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white"><input type="radio" name="xm" value="1" defaultChecked={excluded} className="sr-only" />{t("Yes")}</label>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-3 py-1 font-semibold ring-1 ring-amber-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white"><input type="radio" name="xm" value="0" defaultChecked={!excluded} className="sr-only" />{t("No")}</label>
      </div>
    </fieldset>
  );
}
