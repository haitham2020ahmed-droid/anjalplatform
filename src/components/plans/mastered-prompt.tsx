import type { TFn } from "@/i18n";
import { repo } from "@/server/auth/next";
import { masteredBySkill } from "@/server/skills/status-extras";

/**
 * ⭐ The plan builder's note before Send (owner 1 Nov 2026: nobody is left out): "N students already mastered this
 * skill: a 20-question review for them." One read for the whole plan; the form always sends xm=0.
 */
export async function PlanMasteredPrompt({ t, classId, plan }: { t: TFn; classId: string; plan: { id: string; name: string; studentIds: string[] }[]; excluded?: boolean }) {
  if (!classId || !plan.length) return null;
  const klass = await repo.findUnique("Class", { id: classId });
  if (!klass) return null;
  const students = [...new Set(plan.flatMap((k) => k.studentIds))];
  const m = await masteredBySkill(repo, String(klass.schoolId), students, plan.map((k) => k.id)).catch(() => new Map<string, string[]>());
  const lines = plan.map((k) => ({ name: k.name, n: (m.get(k.id) ?? []).filter((id) => k.studentIds.includes(id)).length })).filter((x) => x.n > 0);
  if (!lines.length) return null;
  const total = lines.reduce((a, x) => a + x.n, 0);
  return (
    <div data-testid="plan-exclude-mastered" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
      <input type="hidden" name="xm" value="0" />
      <p className="font-semibold">⭐ {lines.length === 1 ? (lines[0].n === 1 ? t("1 student already mastered this skill: a 20-question review for them.") : t("{n} students already mastered this skill: a 20-question review for them.", { n: lines[0].n })) : t("{n} students already mastered some of these skills: a 20-question review for them.", { n: total })}</p>
      {lines.length > 1 && <p className="text-xs">{lines.map((x) => `${x.name} (${x.n})`).join(" · ")}</p>}
    </div>
  );
}
