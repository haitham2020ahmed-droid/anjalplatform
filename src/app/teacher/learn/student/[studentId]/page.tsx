import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentLearnResults } from "@/server/learn/teacher";
import { getT } from "@/i18n/server";

export const metadata = { title: "Learn results" };

/** 📊 One student's Learn work: every lesson and selection opened or given, finished, score, needed "again", time. */
export default async function StudentLearnResultsPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { studentId } = await params;
  const v = await studentLearnResults(repo, actor, studentId).catch(() => null);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/learn", label: "Learn" }} icon="📊" title="Learn results" subtitle={v ? <bdi>{v.name}</bdi> : undefined} />
      {!v ? <p className="rounded-2xl bg-surface p-6 text-muted ring-1 ring-line">{t("Not your student.")}</p> : !v.rows.length ? <p className="rounded-2xl bg-surface p-6 text-muted ring-1 ring-line">{t("No Learn work yet.")}</p> : (
        <div className="rk-box rk-cards">
          <table className="w-full text-sm">
            <thead><tr><th>{t("Lesson")}</th><th>{t("Status")}</th><th>{t("Opened")}</th><th>{t("Finished")}</th><th>{t("Score")}</th><th>{t("Needed “again”")}</th><th>{t("Time")}</th></tr></thead>
            <tbody>{v.rows.map((r) => (
              <tr key={`${r.kind}${r.ref}`}>
                <td className="rk-first" data-label={t("Lesson")}><Link prefetch={false} href={r.kind === "WORDS" ? `/teacher/learn/words?sel=${encodeURIComponent(r.ref)}` : `/teacher/learn/${r.ref}`} className="font-semibold hover:underline" lang="en">{r.kind === "WORDS" ? "📗 " : "📘 "}{r.title}</Link></td>
                <td data-label={t("Status")}>{r.status === "DONE" ? t("Done") : r.status === "IN_PROGRESS" ? t("In progress") : r.status === "NOT_STARTED" ? t("Not started") : "—"}</td>
                <td data-label={t("Opened")} dir="ltr">{r.opened?.slice(0, 10) ?? "—"}</td>
                <td data-label={t("Finished")} dir="ltr">{r.finished?.slice(0, 10) ?? "—"}</td>
                <td data-label={t("Score")} dir="ltr">{r.score ?? "—"}</td>
                <td data-label={t("Needed “again”")}>{r.kind === "WORDS" ? "—" : r.again ? t("Yes") : t("No")}</td>
                <td data-label={t("Time")} dir="ltr">{r.minutes ? `${r.minutes} min` : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
