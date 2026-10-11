import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { RosterUpload } from "./roster-upload";

export const metadata = { title: "Upload Roster" };

/** 📤 Upload Roster (Teacher Home): names + usernames into the teacher's OWN class; password = username. */
export default async function RosterPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: klass ? `/teacher?classId=${klass.id}` : "/teacher", label: "Home" }} icon="📤" title="Upload Roster" />
      {classes.length > 1 && <nav aria-label="Class" className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/accounts/roster?classId=${c.id}`} aria-current={c.id === klass?.id ? "page" : undefined} className={chip(c.id === klass?.id)}>{String(c.name)}</Link>)}</nav>}
      {klass ? <RosterUpload classId={String(klass.id)} className={String(klass.name)} /> : <EmptyState icon="🏫" title="Nothing here yet" />}
    </AppShell>
  );
}
