import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { autoTestName, builderClasses, builderSkills, describe, openTemplate, schoolWeek, TEST_TYPES, type TestType } from "@/server/tests/assessments";
import { describePicks, mapSourceTree } from "@/server/tests/map-source";
import { TestBuilder } from "./test-builder";
import { getT } from "@/i18n/server";

export const metadata = { title: "New test" };

/** 📝 Build a test from Curriculum Map questions and skills (any grade), preview it as a student and assign it. */
export default async function NewTestPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const [skills, classes, week, mapTree] = await Promise.all([builderSkills(repo, actor), builderClasses(repo, actor), schoolWeek(repo, String(actor.schoolId)), mapSourceTree(repo, actor)]);
  let template = null;
  if (sp.template) { try { template = await openTemplate(repo, actor, String(sp.template)); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; } }
  const preview = template ? { levelMode: template.spec.levelMode, versions: await describe(repo, actor, template.spec.questions ?? {}), notes: [] as string[] } : null;
  const mapPicks = template?.spec.mapQuestionIds?.length ? await describePicks(repo, actor, template.spec.mapQuestionIds) : [];
  const names = Object.fromEntries(TEST_TYPES.map((t) => [t, autoTestName(t, week)])) as Record<TestType, string>;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/assessments", label: "Assessments" }} icon="📝" title={template ? t("Test from template: {name}", { name: template.title }) : "New test"} subtitle={t("1. Choose questions · 2. Choose the type · 3. Preview · 4. Assign")} />
      <TestBuilder skills={skills} classes={classes} names={names} template={template} preview={preview} mapTree={mapTree} mapPicks={mapPicks} />
    </AppShell>
  );
}
