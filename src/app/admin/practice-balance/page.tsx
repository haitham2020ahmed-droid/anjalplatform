import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { NAFS_SHARE_FLAG, MIN_FLAG_MINUTES, practiceBalance } from "@/server/admin/practice-balance";

export const metadata = { title: "NAFS vs. Motivational Practice Balance" };

/**
 * 👥 School-wide report (admin only): NAFS exam-drill practice vs. ReadRise and games, per student, per class, over
 * the last 30 days — so a department has a number to watch instead of a feeling that NAFS is "too much".
 * See src/server/admin/practice-balance.ts for exactly what is measurable and what is a labelled proxy.
 */
export default async function PracticeBalancePage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "analytics:school" });
  const me = (await getActor())!.user;
  const d = await practiceBalance(repo, actor);
  const { t } = await getT();
  const flaggedCount = d.schoolTotals.flagged;
  const pctLabel = Math.round(NAFS_SHARE_FLAG * 100);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Administration" }} icon="⚖️" title="NAFS vs. Motivational Practice Balance"
        subtitle={t("How much of each student's practice is NAFS exam drilling versus ReadRise and games — a department-level target so NAFS does not crowd out the features that keep practice motivating.")} />

      <div className="mb-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">{t("NAFS share is NAFS minutes ÷ (NAFS + ReadRise) minutes. A student is flagged \"NAFS-heavy\" at over {p}% NAFS share, with at least {m} combined minutes (shorter samples are too noisy to flag).", { p: pctLabel, m: MIN_FLAG_MINUTES })}</p>
        <p className="mt-1 text-sm text-slate-500">{t("Games have no time tracked in the platform (only questions answered), so they are shown separately and never counted in the NAFS share. Badges and streaks are not timed practice and are not part of this report.")}</p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">{t("NAFS (minutes)")}</p>
          <p className="text-2xl font-bold text-brand-navy tabular-nums">{d.schoolTotals.nafsMinutes.toLocaleString("en")}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">{t("ReadRise (minutes)")}</p>
          <p className="text-2xl font-bold text-brand-navy tabular-nums">{d.schoolTotals.readriseMinutes.toLocaleString("en")}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">{t("NAFS-heavy students (last {n} days)", { n: d.days })}</p>
          <p className={`text-2xl font-bold tabular-nums ${flaggedCount ? "text-amber-700" : "text-emerald-700"}`}>{flaggedCount}</p>
          <p className="text-xs text-slate-500">{t("students whose timed practice is mostly NAFS — worth a look, not an alarm")}</p>
        </div>
      </div>

      {!d.classes.length ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("No practice recorded in the last {n} days.", { n: d.days })}</p>
      ) : (
        <ul className="space-y-3">
          {d.classes.map((c) => (
            <li key={c.classId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="font-semibold text-brand-navy">
                {t("Grade {n}", { n: c.grade })} · {c.className}
                <span className="text-sm font-normal text-slate-500"> · {c.teacherName}</span>
                {c.totals.flagged > 0 && <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{c.totals.flagged} {t("NAFS-heavy")}</span>}
              </p>
              <div className="mt-2 overflow-x-auto rounded-xl ring-1 ring-slate-100">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="p-2">{t("Student")}</th>
                      <th className="p-2">{t("NAFS (minutes)")}</th>
                      <th className="p-2">{t("ReadRise (minutes)")}</th>
                      <th className="p-2">{t("Games (questions answered)")}</th>
                      <th className="p-2">{t("NAFS share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.students.map((st) => (
                      <tr key={st.studentId} className="border-b last:border-0">
                        <td className="p-2">{st.name}</td>
                        <td className="p-2 tabular-nums">{st.nafsMinutes}</td>
                        <td className="p-2 tabular-nums">{st.readriseMinutes}</td>
                        <td className="p-2 tabular-nums">{st.gameAnswers}</td>
                        <td className="p-2 tabular-nums">
                          {st.nafsSharePct === null ? "—" : (
                            <span className={st.flagged ? "font-bold text-amber-800" : ""}>
                              {st.nafsSharePct}%{st.flagged ? ` · ${t("NAFS-heavy")}` : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
