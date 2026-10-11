import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { badgeShelf } from "@/server/motivation/badges";
import { streakAndPoints } from "@/server/student/streak";
import { BadgeEmblem } from "@/components/motivation/avatar";
import { itemByCode } from "@/lib/avatar";
import { setFavoriteBadgeAction } from "@/app/student/avatar/actions";
import { getT } from "@/i18n/server";

export const metadata = { title: "My badges" };

/**
 * 🏅 My badges and points — only mine, no comparisons. Earned badges in colour, locked ones faded (Games Part 3);
 * the student picks ONE favorite, shown as an emblem next to their name (top bar, Live Board, teacher's class list).
 */
export default async function MyBadgesPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, shelf, sp] = await Promise.all([getT(), badgeShelf(repo, actor), streakAndPoints(repo, actor.studentId!)]);
  const { badges, favorite } = shelf;
  const earned = badges.filter((b) => b.earned).length;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🏅" title="My Badges" subtitle={t("Badges for finishing skills and tasks, moving up, reading and writing, and practising every day.")} />
      <section className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center gap-6">
          <p><span className="block text-sm text-white/80">{t("Badges")}</span><span className="text-4xl font-black" dir="ltr">{earned}<span className="text-xl text-white/70"> / {badges.length}</span></span></p>
          <p><span className="block text-sm text-white/80">{t("Points")}</span><span className="text-4xl font-black" dir="ltr">⭐ {sp.points.toLocaleString("en")}</span></p>
          <p><span className="block text-sm text-white/80">{t("Streak")}</span><span className="text-4xl font-black" dir="ltr">🔥 {sp.streak}</span></p>
          <p className="ms-auto flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2" data-testid="favorite-now">
            <span className="text-sm text-white/80">{t("My favorite badge")}</span>
            {favorite ? <BadgeEmblem code={favorite} size={40} /> : <span className="text-sm">{t("Pick one below")}</span>}
          </p>
        </div>
      </section>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b) => {
          const fav = favorite === b.code, unlock = b.unlocks ? itemByCode(b.unlocks) : null;
          return (
            <li key={b.code} data-badge-card={b.code} data-earned={b.earned ? "1" : "0"} className={`lift rounded-3xl p-5 ring-1 ${b.earned ? "animate-pop bg-gradient-to-br bg-linear-to-br from-amber-50 to-white ring-amber-300" : "bg-white ring-slate-200"} ${fav ? "ring-2 ring-brand-teal" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <BadgeEmblem code={b.code} size={52} locked={!b.earned} label={t(b.name)} />
                {b.earned && (fav
                  ? <form action={setFavoriteBadgeAction}><input type="hidden" name="code" value="none" /><button className="min-h-11 rounded-xl bg-brand-teal px-3 text-sm font-semibold text-white">★ {t("Favorite")}</button></form>
                  : <form action={setFavoriteBadgeAction}><input type="hidden" name="code" value={b.code} /><button className="min-h-11 rounded-xl bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">☆ {t("Make favorite")}</button></form>)}
              </div>
              <p className={`mt-2 text-lg font-extrabold ${b.earned ? "text-brand-navy" : "text-slate-500"}`}>{t(b.name)}</p>
              <p className="text-sm text-slate-600">{t(b.description)}</p>
              {unlock && <p className="mt-1 text-xs font-semibold text-brand-purple">🎁 {t("Unlocks: {item}", { item: t(unlock.name) })}</p>}
              {b.earned ? <p className="mt-2 text-sm font-bold text-emerald-700">✓ {t("Earned")}{b.earnedAt ? <span dir="ltr"> · {b.earnedAt.slice(0, 10)}</span> : null}</p> : (
                <div className="mt-3"><div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${Math.round((b.value / b.target) * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-500" dir="ltr">{b.value} / {b.target}</p></div>
              )}
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
