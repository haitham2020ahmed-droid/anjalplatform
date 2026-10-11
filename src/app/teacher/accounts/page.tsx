import Link from "next/link";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { LoginCards } from "@/components/accounts/login-cards";
import { EmptyState, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { accessibleClasses } from "@/server/teacher/assign";
import { classAccounts, PASSWORD_HIDDEN } from "@/server/teacher/class-accounts";
import { resetToUsernameAction } from "../home-actions";

export const metadata = { title: "Download Accounts" };

/**
 * ⬇️ Download Accounts (Teacher Home): the class's accounts as Excel (Student Name | Username | Password) and as
 * printable login cards with a QR code ("Save as PDF"). Only the class's teacher and the admin (server-checked).
 */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const a = classId ? await classAccounts(repo, actor, classId) : null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = (process.env.APP_URL ?? `${proto}://${host}`).replace(/\/$/, "");
  const hidden = a ? a.rows.filter((r) => r.password === null).length : 0;
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: classId ? `/teacher?classId=${classId}` : "/teacher", label: "Home" }} icon="⬇️" title="Download Accounts"
          subtitle={t("Student Name, Username and Password for your class: an Excel file, or login cards to print and cut.")} />
        {classes.length > 1 && <nav aria-label={t("Class")} className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/accounts?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>}
        {a && (
          <div className="flex flex-wrap gap-3">
            <a href={`/api/class-accounts?classId=${encodeURIComponent(a.classId)}`} className={BTN_PRIMARY}><span aria-hidden="true">📊</span> {t("Download Excel")}</a>
            <PrintButton label={t("Print login cards (PDF)")} />
            <Link prefetch={false} href={`/teacher/accounts/roster?classId=${a.classId}`} className={BTN_SECONDARY}><span aria-hidden="true">📤</span> {t("Upload Roster")}</Link>
          </div>
        )}
        {a && hidden > 0 && (
          <section className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="font-semibold text-amber-950">{t("{n} students have a password that is not their username", { n: hidden })}</p>
            <p className="text-sm text-amber-900">{t("Their password is shown as “set by admin / reset to show”. Reset it to their username to print it.")}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {a.rows.filter((r) => r.password === null).map((r) => (
                <li key={r.studentId}>
                  <form action={resetToUsernameAction} className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 ring-1 ring-amber-200">
                    <input type="hidden" name="classId" value={a.classId} /><input type="hidden" name="studentId" value={r.studentId} />
                    <bdi className="font-medium">{r.name}</bdi>
                    <button className="min-h-10 rounded-lg px-2 text-sm font-semibold text-brand-teal hover:underline">{t("Reset to username")}</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}
        {a && a.rows.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 text-start">{t("Student Name")}</th><th className="p-3 text-start">{t("Username")}</th><th className="p-3 text-start">{t("Password")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {a.rows.map((r) => (
                  <tr key={r.studentId}>
                    <td className="p-3"><Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-medium text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link></td>
                    <td className="p-3 font-mono" dir="ltr">{r.username}</td>
                    <td className="p-3 font-mono" dir="ltr">{r.password ?? <span className="font-sans text-slate-500">{t(PASSWORD_HIDDEN)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {a && <h2 className="mt-8 text-lg font-semibold text-brand-navy">{t("Login cards")}</h2>}
      </div>
      {a && a.rows.length > 0 && <LoginCards cards={a.rows.map((r) => ({ userId: r.userId, name: r.name, username: r.username, number: r.number, className: a.className, grade: a.grade, password: r.password }))} schoolName={a.schoolName} base={base} t={t} />}
      {(!a || a.rows.length === 0) && <div className="mt-6"><EmptyState icon="👥" title="No students in this class yet" action={classId ? { href: `/teacher/accounts/roster?classId=${classId}`, label: "Upload Roster" } : undefined} /></div>}
    </AppShell>
  );
}
