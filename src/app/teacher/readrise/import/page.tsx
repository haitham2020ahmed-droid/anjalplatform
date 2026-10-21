import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { ImportView } from "@/app/admin/readrise/_components/import-view";
import { ReadRiseTabs, TEACHER_TABS } from "@/app/admin/readrise/_components/tabs";
import { Flash } from "@/app/admin/readrise/_components/ui";

export const metadata = { title: "ReadRise import" };

/** 🚀 ReadRise (teacher): import an article as a draft; publish it with the publish permission, or an admin does. */
export default async function ReadRiseImportTeacher({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:edit" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/readrise/library", label: "ReadRise Library" }} icon="📥" title="Import a ReadRise Article"
        subtitle="Write your own article at 14 levels with the Excel template. It is imported as a draft for your school.">
        <ReadRiseTabs items={TEACHER_TABS} current="/teacher/readrise/import" />
      </PageHeader>
      <Flash msg={sp.msg} />
      <ImportView base="/teacher/readrise/library" canPublish={can(actor, "questions:publish")} />
    </AppShell>
  );
}
