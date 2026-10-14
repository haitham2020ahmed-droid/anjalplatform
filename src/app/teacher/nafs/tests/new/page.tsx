import { redirect } from "next/navigation";
import { nafsDbGate } from "@/components/db-update-needed";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { builderRows, MINISTRY_DEFAULT, setChoices } from "@/server/nafs/build";
import { getNafsTest, nafsClasses } from "@/server/nafs/tests";
import { isMoeCode, isNafsCode, MAX_NAFS_MINUTES, MAX_NAFS_QUESTIONS, MOE_AREAS, MOE_STANDARDS, NAFS_DOMAINS, NAFS_SKILLS, SIMULATION_DEFAULT } from "@/server/nafs/framework";
import { legacyBuilderRedirect } from "@/server/nafs/center";
import { getT } from "@/i18n/server";
import { NafsBuilder } from "@/components/nafs/nafs-builder";
import type { BuilderStart } from "@/components/nafs/builder-starts";

export const metadata = { title: "New NAFS test" };

/**
 * 🇸🇦 New NAFS test (or change a saved one: ?id=…) — the ONE builder: Step 1 start from a model booklet · all 13
 * standards · standards / skills I choose (?start=BOOKLET|ALL|CHOOSE); Step 2 the number of questions, the time, the
 * difficulty and Test or Practice (?purpose=PRACTICE); Step 3 every question. Old links (?mode=FULL|SIMULATION|
 * MINISTRY|AUTO|MANUAL|AI) are redirected to the matching start.
 */
export default async function NewNafsTestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const old = legacyBuilderRedirect(sp);
  if (old) redirect(old);
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const start: BuilderStart = (["BOOKLET", "ALL", "CHOOSE"] as const).find((m) => m === sp.start) ?? "CHOOSE";
  const test = sp.id ? await getNafsTest(repo, actor, sp.id).catch(() => null) : null;
  const [classes, rows, sets] = await Promise.all([nafsClasses(repo, actor), test ? builderRows(repo, actor, test.questionIds) : Promise.resolve([]), setChoices(repo, actor, "ALL")]);
  // prefilled from the Dashboard: ?start=CHOOSE&class=…&codes=MOE.S04,MOE.S07
  const initialCodes = [...new Set(String(sp.codes ?? "").split(",").map((x) => x.trim()).filter((x) => isMoeCode(x) || isNafsCode(x)))].slice(0, 26);
  const settings = test?.settings && typeof test.settings === "object" ? (test.settings as Record<string, unknown>) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/nafs?tab=tests", label: "Tests" }} icon="🇸🇦" title={test ? "Change the test" : "New NAFS test"}
        subtitle={t("1. Start from · 2. Options · 3. The questions — replace, remove, reorder or add any question before saving.")} />
      <NafsBuilder start={start} initialPurpose={sp.purpose === "PRACTICE" ? "PRACTICE" : "TEST"} initialCodes={initialCodes} initialShape={sp.shape === "BOOKLET" ? "BOOKLET" : "BALANCED"} initialAdd={sp.add === "AI" ? "AI" : sp.add === "BANK" ? "BANK" : null}
        initialClassId={classes.some((c) => c.id === sp.class) ? sp.class : null} maxQuestions={MAX_NAFS_QUESTIONS} maxMinutes={MAX_NAFS_MINUTES} simulation={SIMULATION_DEFAULT} ministry={MINISTRY_DEFAULT}
        standards={MOE_STANDARDS.map((x) => ({ code: x.code, short: x.short, text: x.text, area: x.area }))} areas={MOE_AREAS.map((a) => ({ code: a.code, name: a.name }))}
        skills={NAFS_SKILLS.map((k) => ({ code: k.code, name: k.name, domain: k.domain }))} domains={NAFS_DOMAINS.map((d) => ({ code: d.code, name: d.name }))}
        booklets={sets.filter((b) => b.code.startsWith("NB-"))} sets={sets}
        classes={classes.map((c) => ({ id: c.id, name: c.name, students: c.students.map((x) => ({ id: x.id, name: x.name })) }))}
        existing={test ? { id: test.canEdit ? test.id : null, title: test.title, mode: test.mode, rows, marks: test.marks, timeLimitMin: test.timeLimitMin, locked: test.locked || !test.canEdit, settings } : null} />
    </AppShell>
  );
}
