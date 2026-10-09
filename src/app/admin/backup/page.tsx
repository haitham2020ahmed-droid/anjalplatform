import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";

export const metadata = { title: "Backup" };

/** 💾 Download the school's data as one Excel file (keep it safe: it has students' names and scores). */
export default async function BackupPage() {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:export" });
  const me = (await getActor())!.user;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="💾" title="Backup to Excel" subtitle="One Excel file with every student, MAP result, skill result, assignment, MAP plan and alert. Download it every week and keep it in a safe place (it contains students' names and scores)." />
      <a href="/api/backup" className="inline-block rounded-2xl bg-brand-navy px-6 py-4 text-lg font-bold text-white shadow hover:bg-brand-purple">⬇ Download the backup (.xlsx)</a>
      <p className="mt-4 text-sm text-slate-600">This is a copy for reading and reports. The full database backup is done by the database service (Aiven): turn on its daily backups too.</p>
    </AppShell>
  );
}
