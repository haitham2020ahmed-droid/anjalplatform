import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentBadges } from "@/server/student/badges";
import { streakAndPoints } from "@/server/student/streak";

export const metadata = { title: "My badges" };

/** 🏅 My badges and points — only mine, no comparisons. */
export default async function MyBadgesPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [badges, sp] = await Promise.all([studentBadges(repo, actor.studentId!), streakAndPoints(repo, actor.studentId!)]);
  const earned = badges.filter((b) => b.earned).length;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🏅" title="My badges" subtitle="Badges for finishing skills and tasks, moving up, reading and writing, and practising every day." />
      <section className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center gap-6">
          <p><span className="block text-sm text-white/80">Badges</span><span className="text-4xl font-black">{earned}<span className="text-xl text-white/70"> / {badges.length}</span></span></p>
          <p><span className="block text-sm text-white/80">Points</span><span className="text-4xl font-black">⭐ {sp.points.toLocaleString("en")}</span></p>
          <p><span className="block text-sm text-white/80">Streak</span><span className="text-4xl font-black">🔥 {sp.streak}</span></p>
        </div>
      </section>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b) => (
          <li key={b.code} className={`lift rounded-3xl p-5 ring-1 ${b.earned ? "animate-pop bg-gradient-to-br bg-linear-to-br from-amber-50 to-white ring-amber-300" : "bg-white ring-slate-200"}`}>
            <p className={`text-5xl ${b.earned ? "" : "opacity-30 grayscale"}`} aria-hidden="true">{b.icon}</p>
            <p className="mt-2 text-lg font-extrabold text-brand-navy">{b.name}</p>
            <p className="text-sm text-slate-600">{b.description}</p>
            {b.earned ? <p className="mt-2 text-sm font-bold text-emerald-700">✓ Earned{b.earnedAt ? ` · ${b.earnedAt.slice(0, 10)}` : ""}</p> : (
              <div className="mt-3"><div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${Math.round((b.value / b.target) * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-500">{b.value} / {b.target}</p></div>
            )}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
