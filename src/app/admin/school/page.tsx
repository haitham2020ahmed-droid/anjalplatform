import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolTree } from "@/server/admin/school";
import { SchoolTreeView, type OpenDialog } from "./school-tree";
import { teachersCanAddStudents } from "@/server/teacher/class-students";
import { teachersAddStudentsAction } from "./actions";
import { getT } from "@/i18n/server";

export const metadata = { title: "School" };

const OPEN: readonly OpenDialog[] = ["roster", "add-student", "new-teacher", "teacher", "no-class", "add-grade"];

/** 🏫 One page for the school: Grades → Classes → Teacher → Students, with small dialogs for every change. */
export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ open?: string; filter?: string; q?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "classes:manage" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [tree, teachersAdd, { t }] = await Promise.all([schoolTree(repo, actor), teachersCanAddStudents(repo, actor.schoolId), getT()]);
  const open = (OPEN as readonly string[]).includes(sp.open ?? "") ? (sp.open as OpenDialog) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🏫" title="School"
        subtitle={tree.yearName ? `${tree.yearName}` : undefined} />
      <SchoolTreeView tree={tree} open={open} filter={sp.filter === "no-teacher" ? "no-teacher" : null} initialQuery={(sp.q ?? "").slice(0, 100)} />
      {/* owner r83: teachers add students to their own class (ON unless the admin turns it off) */}
      <section aria-labelledby="teachers-add" className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 id="teachers-add" className="text-lg font-semibold text-brand-navy">👩‍🏫 {t("Teachers can add students")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("When this is on, a teacher can add students to their own class by name, fix a name, and take a student out of their class. Accounts are never deleted by teachers.")}</p>
        <form action={teachersAddStudentsAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="on" value={teachersAdd ? "0" : "1"} />
          <span className={teachersAdd ? "font-semibold text-brand-teal" : "font-semibold text-red-700"}>{teachersAdd ? t("On") : t("Off")}</span>
          <button className="min-h-11 rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{teachersAdd ? t("Turn off") : t("Turn on")}</button>
        </form>
      </section>
    </AppShell>
  );
}
