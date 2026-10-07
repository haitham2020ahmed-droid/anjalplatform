import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";

/** Admin home: one card per area the signed-in admin may use. */
export default async function AdminHome() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const areas = [
    { href: "/admin/performance", title: "Teacher & student performance", text: "Every teacher, class and student at a glance: mastery, completion, overdue work, skills that need work.", show: can(actor, "analytics:school") },
    { href: "/admin/users", title: "Users", text: "Students, teachers, parents and admins; classes and parent links.", show: can(actor, "students:manage") || can(actor, "teachers:manage") },
    { href: "/admin/roster", title: "Import users", text: "Add or update many users at once from a CSV or Excel file.", show: can(actor, "students:manage") },
    { href: "/admin/questions?status=PUBLISHED", title: "📚 Question Bank", text: "Every question on the platform in one library: search, filter, preview, edit, select and assign. Separate from the Curriculum Map.", show: can(actor, "questions:read") },
    { href: "/admin/questions/import", title: "Import questions", text: "Upload questions from the official CSV or Excel template; review, fix and import.", show: can(actor, "questions:edit") },
    { href: "/admin/question-bank", title: "Question bank coverage (AI)", text: "Questions per skill and difficulty; generate missing questions as drafts for review.", show: can(actor, "questions:read") },
    { href: "/admin/curriculum", title: "Curriculum", text: "Units, lessons, skills, standards and prerequisites.", show: can(actor, "curriculum:edit") },
    { href: "/admin/imports", title: "MAP and other results", text: "Import official MAP Growth and other results.", show: can(actor, "imports:run") },
    { href: "/admin/analytics", title: "School analytics and reports", text: "Progress, comparisons, standards; PDF and Excel reports.", show: can(actor, "analytics:school") },
    { href: "/admin/settings", title: "Settings", text: "Calendar, classes, report branding, adaptive engine.", show: can(actor, "settings:school") || can(actor, "settings:engine") },
  ].filter((a) => a.show);
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-bold text-brand-navy">School administration</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <Link key={a.href} href={a.href} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 hover:ring-brand-teal">
            <h2 className="text-lg font-bold text-brand-navy">{a.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{a.text}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
