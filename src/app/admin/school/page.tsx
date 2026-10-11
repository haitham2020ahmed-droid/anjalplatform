import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolTree } from "@/server/admin/school";
import { SchoolTreeView, type OpenDialog } from "./school-tree";

export const metadata = { title: "School" };

const OPEN: readonly OpenDialog[] = ["roster", "add-student", "new-teacher", "teacher", "no-class", "add-grade"];

/** 🏫 One page for the school: Grades → Classes → Teacher → Students, with small dialogs for every change. */
export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ open?: string; filter?: string; q?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "classes:manage" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const tree = await schoolTree(repo, actor);
  const open = (OPEN as readonly string[]).includes(sp.open ?? "") ? (sp.open as OpenDialog) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🏫" title="School"
        subtitle={tree.yearName ? `${tree.yearName}` : undefined} />
      <SchoolTreeView tree={tree} open={open} filter={sp.filter === "no-teacher" ? "no-teacher" : null} initialQuery={(sp.q ?? "").slice(0, 100)} />
    </AppShell>
  );
}
