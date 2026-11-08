import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { possibleDuplicateStudents, type DupAccount } from "@/server/admin/duplicate-students";
import { getT } from "@/i18n/server";
import { archiveDuplicateAction } from "./actions";

export const metadata = { title: "Possible duplicate students" };

/**
 * 👥 Reports audit 8 Nov 2026: the same child twice in a class makes every report count the class wrong. Each pair of
 * look-alike names in a class, with answers and last sign-in; the admin archives the extra account (reversible).
 */
export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const pairs = await possibleDuplicateStudents(repo, actor);
  const one = (x: DupAccount, empty: string | null) => (
    <div className={`flex-1 rounded-xl p-3 ring-1 ${empty === x.studentId ? "bg-amber-50 ring-amber-200" : "bg-white ring-slate-200"}`}>
      <p className="font-semibold text-brand-navy"><bdi>{x.name}</bdi></p>
      <p className="text-xs text-slate-600" dir="ltr">{x.username}</p>
      <p className="mt-1 text-sm text-slate-700">{t("{n} answers", { n: x.answers })} · {x.lastLogin ? t("last sign-in {d}", { d: x.lastLogin }) : t("never signed in")}</p>
      {empty === x.studentId && <p className="mt-1 text-xs font-semibold text-amber-900">{t("Probably the extra account (no answers)")}</p>}
      <form action={archiveDuplicateAction} className="mt-2">
        <input type="hidden" name="studentId" value={x.studentId} /><input type="hidden" name="name" value={x.name} />
        <button className="min-h-9 rounded-lg bg-white px-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">{t("Archive this account")}</button>
      </form>
    </div>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/data-cleanup", label: "Data Cleanup" }} icon="users" title="Possible duplicate students"
        subtitle={t("The same child twice in a class makes every report count the class wrong. Check each pair and archive the extra account: it leaves the class and cannot sign in; its data is kept and Restore (Users) brings it back.")} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">{sp.msg}</p>}
      {!pairs.length ? <p className="rounded-2xl bg-white p-5 text-emerald-800 ring-1 ring-slate-200">✓ {t("No look-alike names in any class.")}</p> : (
        <ul className="grid gap-3">
          {pairs.map((p) => (
            <li key={`${p.classId}|${p.a.studentId}|${p.b.studentId}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <p className="mb-2 text-sm font-semibold text-slate-600">{p.className}</p>
              <div className="flex flex-col gap-3 sm:flex-row">{one(p.a, p.empty)}{one(p.b, p.empty)}</div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
