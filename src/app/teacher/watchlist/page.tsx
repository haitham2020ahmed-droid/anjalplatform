import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReportHeader } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { watchedStudentsFor } from "@/server/teacher/watchlist";
import { AddToWatchlist, RemoveFromWatchlist } from "@/components/teacher/watchlist-form";

export const metadata = { title: "Watchlist" };

/**
 * 👁️ A teacher's own watchlist (Oct 2026, daily-reports consolidation): students the teacher is keeping an eye on
 * by their own judgement, independent of any report's automatic flags — a place the teacher's "I'm a bit worried
 * about this one" doesn't get lost between visits.
 */
export default async function WatchlistPage() {
  const actor = await requireActor({ roles: ["TEACHER"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const [watched, classes] = await Promise.all([watchedStudentsFor(repo, actor), readableClasses(repo, actor)]);
  const memberLists = await Promise.all(classes.map((c) => classMembers(repo, String(c.id))));
  const allIds = [...new Set(memberLists.flat())];
  const names = await studentNames(repo, allIds);
  const options = classes.flatMap((c, i) => memberLists[i].map((sid) => ({ id: sid, name: names.get(sid)?.name ?? "—", className: String(c.name) })))
    .filter((o) => !watched.some((w) => w.studentId === o.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} title="Watchlist" print={false}
        subtitle={t("Students you are keeping an eye on, by your own judgement.")} />

      <div className="mb-6"><AddToWatchlist students={options} /></div>

      {watched.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("No one on your watchlist yet. Add a student above.")}</p>
      ) : (
        <ul className="space-y-2">
          {watched.map((w) => (
            <li key={w.studentId} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="min-w-0 flex-1">
                <Link prefetch={false} href={`/teacher/students/${w.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{w.name}</bdi></Link>
                {w.note && <p className="mt-0.5 truncate text-sm text-slate-600">{w.note}</p>}
              </div>
              <RemoveFromWatchlist studentId={w.studentId} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
