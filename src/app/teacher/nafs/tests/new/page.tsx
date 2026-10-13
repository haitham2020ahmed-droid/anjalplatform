import { redirect } from "next/navigation";
import { nafsDbGate } from "@/components/db-update-needed";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { bookletChoices, builderRows, MINISTRY_DEFAULT } from "@/server/nafs/build";
import { getNafsTest, nafsClasses } from "@/server/nafs/tests";
import { isMoeCode, isNafsCode, MAX_NAFS_MINUTES, MAX_NAFS_QUESTIONS, MOE_STANDARDS, NAFS_DOMAINS, NAFS_SKILLS, SIMULATION_DEFAULT } from "@/server/nafs/framework";
import { getT } from "@/i18n/server";
import { NafsTestBuilder } from "@/components/nafs/test-builder";

export const metadata = { title: "New NAFS test" };
type Mode = "FULL" | "SIMULATION" | "MINISTRY" | "AUTO" | "MANUAL" | "AI";

/**
 * 🇸🇦 New NAFS test (or change a saved one: ?id=…): the complete NAFS test (all 13 standards; ?purpose=PRACTICE gives it
 * as adaptive practice), NAFS simulation, Ministry booklet model, automatic, manual or AI drafts — the number of
 * questions and the time first — then every question.
 */
export default async function NewNafsTestPage({ searchParams }: { searchParams: Promise<{ mode?: string; id?: string; purpose?: string; codes?: string; class?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const mode: Mode = (["FULL", "SIMULATION", "MINISTRY", "AUTO", "MANUAL", "AI"] as const).find((m) => m === sp.mode) ?? "SIMULATION";
  const test = sp.id ? await getNafsTest(repo, actor, sp.id).catch(() => null) : null;
  const [classes, rows, booklets] = await Promise.all([nafsClasses(repo, actor), test ? builderRows(repo, actor, test.questionIds) : Promise.resolve([]), bookletChoices(repo, actor)]);
  // prefilled from the Dashboard: ?mode=AUTO&class=…&codes=MOE.S04,MOE.S07
  const initialCodes = [...new Set(String(sp.codes ?? "").split(",").map((x) => x.trim()).filter((x) => isMoeCode(x) || isNafsCode(x)))].slice(0, 26);
  const st = (test?.settings && typeof test.settings === "object" ? test.settings : {}) as { counts?: Record<string, number>; written?: boolean };
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/nafs?tab=tests", label: "Create test" }} icon="🇸🇦" title={test ? "Change the test" : mode === "FULL" ? "Complete NAFS test (all standards)" : "New NAFS test"}
        subtitle={t("Build it, then replace, remove, reorder or add any question before saving.")} />
      <NafsTestBuilder initialMode={mode} initialPurpose={sp.purpose === "PRACTICE" ? "PRACTICE" : "TEST"} initialCodes={initialCodes} initialClassId={classes.some((c) => c.id === sp.class) ? sp.class : null} maxQuestions={MAX_NAFS_QUESTIONS} maxMinutes={MAX_NAFS_MINUTES} simulation={SIMULATION_DEFAULT} ministry={MINISTRY_DEFAULT}
        standards={MOE_STANDARDS.map((x) => ({ code: x.code, short: x.short, text: x.text, area: x.area }))} booklets={booklets}
        skills={NAFS_SKILLS.map((k) => ({ code: k.code, name: k.name, domain: k.domain }))} domains={NAFS_DOMAINS.map((d) => ({ code: d.code, name: d.name }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name, students: c.students.map((x) => ({ id: x.id, name: x.name })) }))}
        existing={test ? { id: test.canEdit ? test.id : null, title: test.title, mode: test.mode, rows, marks: test.marks, timeLimitMin: test.timeLimitMin, locked: test.locked || !test.canEdit, counts: st.counts && typeof st.counts === "object" ? st.counts : null, written: typeof st.written === "boolean" ? st.written : null } : null} />
    </AppShell>
  );
}
