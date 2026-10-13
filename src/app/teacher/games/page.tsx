import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { ChallengeSetup } from "@/components/game/challenge-setup";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { myGames } from "@/server/game/live";
import { challengeSkills, listChallengeTemplates, myOpenChallenges } from "@/server/game/live-challenge";
import { getT } from "@/i18n/server";

export const metadata = { title: "Live Challenge" };

/**
 * 🏁 Live Challenge (Games Part 1): the whole class plays together. Pick skills (names only), a game mode, questions,
 * time and level, then Start: the projector shows a big QR code and a 6-digit code; students join with Join Live.
 * Running challenges, earlier games (results) and the skill QR cards are listed below.
 */
export default async function GamesPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const rows = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const gradeRows = rows.length ? await repo.findMany("Grade", { id: { in: [...new Set(rows.map((c) => c.gradeId))] } }, { select: ["id", "level"] }) : [];
  const gradeOf = new Map(gradeRows.map((g) => [String(g.id), Number(g.level)]));
  const classes = rows.map((c) => ({ id: String(c.id), name: String(c.name), grade: gradeOf.get(String(c.gradeId)) ?? 0 }));
  const [skills, templates, games] = await Promise.all([challengeSkills(repo, actor, {}), listChallengeTemplates(repo, actor), myGames(repo, actor)]);
  const open = myOpenChallenges(actor);
  const finished = await repo.findMany("LiveGame", { id: { in: games.map((g) => g.id) } }, { select: ["id", "mode"] });
  const isChallenge = new Set(finished.filter((g) => g.mode).map((g) => String(g.id)));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="🏁" title="Live Challenge"
        subtitle="The whole class plays together: choose skills, show the QR code on the board, and students join with Join Live." />
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{sp.msg}</p>}
      {open.length > 0 && (
        <Section title="Running now" icon="🟢" className="mb-6">
          <ul className="grid gap-2 md:grid-cols-2">
            {open.map((r) => <li key={r.id}><Link prefetch={false} href={`/teacher/live/${r.id}`} className="lift flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200"><span className="min-w-0"><span className="block truncate font-semibold text-brand-navy">{r.title}</span><span className="text-xs text-slate-600">{t("Code")} <span dir="ltr">{r.code}</span> · {t("{n} joined", { n: r.joined })}</span></span><span className="rounded-xl bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white">{t("Open")}</span></Link></li>)}
          </ul>
        </Section>
      )}
      {classes.length === 0 ? <EmptyState icon="🏁" title="You do not teach a class yet." text="Ask the school admin to add your class." /> : (
        <ChallengeSetup classes={classes} initialClassId={sp.classId ?? null} initialSkills={skills} templates={templates} />
      )}
      {games.length > 0 && (
        <Section title="Earlier games" icon="🕹️" className="mt-6">
          <ul className="grid gap-2 md:grid-cols-2">
            {games.map((g) => <li key={g.id}><Link prefetch={false} href={`/teacher/games/${g.id}`} className="lift flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80"><span className="min-w-0"><span className="block truncate font-semibold text-brand-navy">{g.title}</span><span className="text-xs text-slate-500" dir="ltr">{g.code} · {g.players} · {g.createdAt}</span></span><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${g.status === "FINISHED" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>{isChallenge.has(g.id) ? t("Results") : g.status === "FINISHED" ? t("Finished") : t("Open")}</span></Link></li>)}
          </ul>
        </Section>
      )}
      <Link prefetch={false} href="/teacher/games/qr" className="lift mt-6 flex min-h-14 items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-violet-50 to-white p-5 shadow-card ring-1 ring-violet-100">
        <span><span className="block text-lg font-semibold text-brand-navy">📱 {t("Skill games with QR codes")}</span><span className="block text-sm text-slate-600">{t("Print a QR card for a skill: students scan it and play Quiz Race on that skill at their own level.")}</span></span>
        <span className="shrink-0 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Open")}</span>
      </Link>
      <p className="mt-4 text-sm"><Link prefetch={false} href="/teacher/reports/games-usage" className="font-semibold text-brand-navy underline">{t("Games report: most played and best rated")}</Link></p>
    </AppShell>
  );
}
