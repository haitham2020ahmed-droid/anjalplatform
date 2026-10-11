import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { ImportView } from "../_components/import-view";
import { ADMIN_TABS, ReadRiseTabs } from "../_components/tabs";
import { Flash } from "../_components/ui";

export const metadata = { title: "ReadRise import" };

/** 🚀 ReadRise (admin): Excel / JSON import with a preview, then review and publish. */
export default async function ReadRiseImportAdmin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:edit" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/readrise", label: "ReadRise Library" }} icon="📥" title="Import ReadRise Articles"
        subtitle="Add your school's own articles at any time: fill the Excel template (or a JSON file), check the preview, import as a draft, review, publish.">
        <ReadRiseTabs items={ADMIN_TABS} current="/admin/readrise/import" />
      </PageHeader>
      <Flash msg={sp.msg} />
      <ImportView base="/admin/readrise" canPublish={can(actor, "questions:publish")} />
    </AppShell>
  );
}
