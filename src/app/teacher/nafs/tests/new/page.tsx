import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { bookletChoices, builderRows, MINISTRY_DEFAULT } from "@/server/nafs/build";
import { getNafsTest, nafsClasses } from "@/server/nafs/tests";
import { MAX_NAFS_MINUTES, MAX_NAFS_QUESTIONS, MOE_STANDARDS, NAFS_DOMAINS, NAFS_SKILLS, SIMULATION_DEFAULT } from "@/server/nafs/framework";
import { getT } from "@/i18n/server";
import { NafsTestBuilder } from "@/components/nafs/test-builder";

export const metadata = { title: "New NAFS test" };
type Mode = "SIMULATION" | "MINISTRY" | "AUTO" | "MANUAL" | "AI";

/**
 * 🇸🇦 New NAFS test (or change a saved one: ?id=…): NAFS simulation, Ministry booklet model, automatic, manual or AI
 * drafts — the number of questions and the time first — then every question.
 */
export default async function NewNafsTestPage({ searchParams }: { searchParams: Promise<{ mode?: string; id?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const mode: Mode = (["SIMULATION", "MINISTRY", "AUTO", "MANUAL", "AI"] as const).find((m) => m === sp.mode) ?? "SIMULATION";
  const test = sp.id ? await getNafsTest(repo, actor, sp.id).catch(() => null) : null;
  const [classes, rows, booklets] = await Promise.all([nafsClasses(repo, actor), test ? builderRows(repo, actor, test.questionIds) : Promise.resolve([]), bookletChoices(repo, actor)]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/nafs?tab=tests", label: "Create test" }} icon="🇸🇦" title={test ? "Change the test" : "New NAFS test"}
        subtitle={t("Build it, then replace, remove, reorder or add any question before saving.")} />
      <NafsTestBuilder initialMode={mode} maxQuestions={MAX_NAFS_QUESTIONS} maxMinutes={MAX_NAFS_MINUTES} simulation={SIMULATION_DEFAULT} ministry={MINISTRY_DEFAULT}
        standards={MOE_STANDARDS.map((x) => ({ code: x.code, short: x.short, text: x.text }))} booklets={booklets}
        skills={NAFS_SKILLS.map((k) => ({ code: k.code, name: k.name, domain: k.domain }))} domains={NAFS_DOMAINS.map((d) => ({ code: d.code, name: d.name }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        existing={test ? { id: test.canEdit ? test.id : null, title: test.title, mode: test.mode, rows, marks: test.marks, timeLimitMin: test.timeLimitMin, locked: test.locked || !test.canEdit } : null} />
    </AppShell>
  );
}
