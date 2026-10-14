import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { SkillStar, StarGlyph } from "@/components/skills/skill-star";
import { getActor, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { STAR_ORDER, STUDENT_WORD, TEACHER_MEANING, TEACHER_WORD } from "@/lib/skill-stars";

export const metadata = { title: "Skill stars guide" };

const RULES = [
  "A star ⭐ comes only from skill practice: at least 30 answered questions (rapid guesses do not count) and the engine's mastery. Practice stops at 50 questions at most.",
  "Before 30 questions the score shown is never 100 (at most 99).",
  "Tests never change a star. Test scores are only in Reports.",
  "Every practice counts, wherever it was given: Curriculum Map lessons, assigned skills, the MAP plan, free practice. Learn checks and lessons do not give stars.",
  "Every copy of a skill is one skill: “Character” in a Curriculum Map lesson, “Character Traits” in the MAP plan and the Grade 4 and Grade 5 copies share one star.",
  "50 questions without mastery: you see “Needs support”, you get an alert and the RTI plan suggests the student and the skill. The student still sees “Learning”, and Done in My Work.",
  "3 weeks after a star: 5 quick review questions arrive in My Work. 4 of 5 or more keeps the star (the next review about 8 weeks later); fewer gives 🔄 Needs review and the skill returns to the plan. A review answered mostly with rapid guesses does not count and is given again.",
  "Once a month: a mixed review of 10 questions from several starred skills. A skill missed twice in it gets 🔄.",
  "A new, higher MAP level: skills that get harder with the level (reading, inference, vocabulary in context, analysis, writing) become ☆⬆ Next level; stable skills (capitalization, punctuation, spelling patterns, basic grammar) keep their star. The history is kept.",
];
const USES = [
  "Reports → Skills grid: filter by plan and by “skills most of the class hasn't mastered” to make small groups; open a cell for dates, questions, accuracy and reviews.",
  "When you assign a skill, the platform asks: “5 students already mastered this skill — exclude them?” Press Yes so nobody repeats a mastered skill.",
  "Follow 🔄 and “no progress for 7 days” on the Home page (Needs attention): reteach, or send the Learn lesson.",
  "A student stuck at ◐ for 7 days (or 25 answers without progress) is offered the skill's Learn lesson before practising more.",
  "Weekly goal: the student (or you, in the Skills grid) picks a small goal, e.g. “master 2 skills”.",
  "Self-check: after a skill the student answers “Do you feel you understood it?” 😊😐😟. The Skills grid shows mismatches: confident but weak, unsure but strong.",
];

/** ⭐ The full "Skill stars guide" (EN + AR through the interface language): each icon, the rules, how to use them. */
export default async function SkillStarsGuide() {
  await requireActor();
  const me = (await getActor())!.user;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <article data-testid="stars-guide" className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-navy sm:text-3xl">⭐ {t("Skill stars guide")}</h1>
            <p className="mt-2 text-lg text-slate-600">{t("Every skill has ONE status for each student, shown the same way on every page.")}</p>
          </div>
          <div className="print:hidden"><PrintButton /></div>
        </header>
        <section aria-labelledby="g-icons" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 id="g-icons" className="text-lg font-bold text-brand-navy">{t("The five stars")}</h2>
          <ul className="mt-3 space-y-3">
            {STAR_ORDER.map((k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="mt-0.5"><StarGlyph status={k} size={24} /></span>
                <span><b>{t(TEACHER_WORD[k])}</b> — {t(TEACHER_MEANING[k])}<span className="block text-sm text-slate-500">{t("Students see: {word}", { word: t(STUDENT_WORD[k]) })}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600"><SkillStar info={{ status: "MASTERED", level: 2, answered: 34 }} t={t} label={t("Example")} /> {t("A small number on a star = mastered again at a higher level. Point at (or tap) any star to see what it means, when, and the next step.")}</p>
        </section>
        <section aria-labelledby="g-rules" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 id="g-rules" className="text-lg font-bold text-brand-navy">{t("The rules")}</h2>
          <ol className="mt-2 list-decimal space-y-2 ps-5 text-slate-700">{RULES.map((r) => <li key={r}>{t(r)}</li>)}</ol>
        </section>
        <section aria-labelledby="g-use" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 id="g-use" className="text-lg font-bold text-brand-navy">{t("How to use them")}</h2>
          <ul className="mt-2 list-disc space-y-2 ps-5 text-slate-700">{USES.map((r) => <li key={r}>{t(r)}</li>)}</ul>
          <p className="mt-3 flex flex-wrap gap-3 text-sm print:hidden">
            <Link prefetch={false} href="/teacher/reports/skills-grid" className="font-semibold text-brand-teal underline">{t("Skills grid")}</Link>
            <Link prefetch={false} href="/guide" className="font-semibold text-brand-teal underline">{t("Guide")}</Link>
          </p>
        </section>
      </article>
    </AppShell>
  );
}
