import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsHomeSummary } from "@/server/nafs/center";
import { codeName, DIFFICULTIES, DIFFICULTY_NAME } from "@/server/nafs/framework";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line";
const Stat = ({ n, label, href }: { n: number | string; label: string; href: string }) => (
  <Link href={href} className={`${CARD} lift block`}>
    <p className="text-3xl font-bold tabular-nums text-ink">{n}</p>
    <p className="mt-1 text-sm text-ink-2">{label}</p>
  </Link>
);

/**
 * 🇸🇦 NAFS center — Home: a quick summary (open tests and practice, written answers waiting for marking, the classes'
 * weakest Ministry standard, the center's questions by difficulty) and the two tools.
 */
export async function HomeTab({ actor, t }: { actor: Actor; t: TFn }) {
  const h = await nafsHomeSummary(repo, actor);
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("Summary")}>
        <Stat n={h.openTests} label={t("NAFS tests open online")} href="/teacher/nafs?tab=tests" />
        <Stat n={h.openPractice} label={t("Adaptive practice open")} href="/teacher/nafs?tab=practice" />
        <Stat n={h.waiting} label={t("Written answers waiting for marking")} href="/teacher/nafs?tab=marking" />
        <Link href="/teacher/nafs?tab=reports&view=across" className={`${CARD} lift block`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Weakest standard")}</p>
          {h.weakest ? <>
            <p className="mt-1 text-sm font-semibold text-ink">{codeName(h.weakest.code, t)}</p>
            {h.weakest.pct !== null && <p className="mt-0.5 text-lg font-semibold tabular-nums text-rose-700">{h.weakest.pct}%</p>}
          </> : <p className="mt-1 text-sm text-muted">{t("No NAFS results yet.")}</p>}
        </Link>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className={`${CARD} ring-2 ring-teal-200`}>
          <h2 className="text-lg font-semibold text-ink">🎯 {t("Practice")}</h2>
          <p className="mt-1 text-sm text-ink-2">{t("Choose NAFS skills or Ministry standards and the students. Each student starts at Medium; the next question gets harder after a right answer and easier after a wrong one, until the skill is mastered or the number of questions is reached.")}</p>
          <Link href="/teacher/nafs?tab=practice#give" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-5 font-semibold text-white">+ {t("Give adaptive practice")}</Link>
        </div>
        <div className={`${CARD} ring-2 ring-indigo-200`}>
          <h2 className="text-lg font-semibold text-ink">📝 {t("Tests")}</h2>
          <p className="mt-1 text-sm text-ink-2">{t("One builder: start from a model booklet, all 13 standards, or the standards you choose; then the number of questions, the time, the difficulty (Easy, Medium, Hard, Mixed or Adaptive) and test or practice.")}</p>
          <Link href="/teacher/nafs?tab=tests" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">+ {t("New NAFS test")}</Link>
        </div>
      </section>
      <section className={CARD} aria-label={t("The NAFS question bank")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">{t("The NAFS question bank")}</h2>
          <Link href="/teacher/nafs?tab=bank" className="text-sm font-semibold text-teal-ink underline">{t("{n} questions", { n: h.questions })}</Link>
        </div>
        <p className="mt-1 text-sm text-ink-2">{t("Every platform question that measures a NAFS skill or Ministry standard, the model booklets, the practice sets and your school's own questions — organised by standard and skill, with a difficulty.")}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((k) => (
            <li key={k}><Link href={`/teacher/nafs?tab=bank&dif=${k}`} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 px-3 text-sm ring-1 ring-line"><span className="font-semibold text-ink">{t(DIFFICULTY_NAME[k])}</span><span className="tabular-nums text-muted">{h.byDifficulty[k]}</span></Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
