import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { gameSkills, myGames } from "@/server/game/live";
import { createGameAction } from "@/app/games/actions";

export const metadata = { title: "Live game" };

/** 🎮 Live games: pick skills → a game with a PIN and QR code; students join from their page or by scanning. */
export default async function GamesPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const grade = klass ? Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0) : undefined;
  const [skills, games] = await Promise.all([gameSkills(repo, actor, grade), myGames(repo, actor)]);
  const box = "rounded-xl border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="🎮" title="Live game"
        subtitle="A quiz competition like Kahoot: choose the skills, show the PIN and QR code on the board, students join from their page or by scanning, then you start. Points for correct and fast answers, with a streak bonus." />
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{sp.msg}</p>}
      <Link href="/teacher/games/qr" className="lift mb-5 flex items-center justify-between gap-3 rounded-3xl bg-gradient-to-br bg-linear-to-br from-amber-50 to-white p-5 ring-1 ring-amber-200">
        <span><span className="block text-lg font-extrabold text-brand-navy">📱 Skill games with QR codes</span><span className="block text-sm text-slate-600">Every skill has a game. Each student plays at their own level and it counts toward their progress. Print QR cards or show one on the board.</span></span>
        <span className="rounded-xl bg-brand-navy px-4 py-2 font-bold text-white">Open ▶</span>
      </Link>
      <Section title="New live game (whole class together)" icon="➕">
        <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">
          {classes.map((c) => <Link key={String(c.id)} href={`/teacher/games?classId=${c.id}`} aria-current={c.id === klass?.id ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === klass?.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
        </nav>
        {!klass ? <p className="text-slate-600">You do not teach a class yet.</p> : skills.length === 0 ? <p className="text-slate-600">Grade {grade} has no multiple-choice or True/False questions yet.</p> : (
          <form action={createGameAction} className="space-y-4">
            <input type="hidden" name="classId" value={String(klass.id)} />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-1">Title<input name="title" maxLength={191} placeholder={`${String(klass.name)} quiz`} className={box} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Questions<select name="count" defaultValue="10" className={box}>{[5, 10, 15, 20].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Seconds per question<select name="seconds" defaultValue="20" className={box}>{[10, 20, 30, 45, 60].map((n) => <option key={n}>{n}</option>)}</select></label>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700">Skills (Grade {grade}) — tick one or more</legend>
              <div className="mt-2 grid max-h-80 gap-1 overflow-y-auto rounded-2xl p-3 ring-1 ring-slate-200 sm:grid-cols-2">
                {skills.map((k) => <label key={k.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50"><input type="checkbox" name="skillIds" value={k.id} /><span className="flex-1">{k.name}</span><span className="text-xs text-slate-400">{k.questions} Q</span></label>)}
              </div>
            </fieldset>
            <button className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-bold text-white shadow hover:bg-brand-purple">🎮 Create the game</button>
          </form>
        )}
      </Section>
      {games.length > 0 && (
        <Section title="My games" icon="🕹️" className="mt-6">
          <ul className="grid gap-2 md:grid-cols-2">
            {games.map((g) => <li key={g.id}><Link href={`/teacher/games/${g.id}`} className="lift flex items-center justify-between rounded-2xl bg-white p-3 ring-1 ring-slate-200"><span><span className="block font-bold text-brand-navy">{g.title}</span><span className="text-xs text-slate-500">PIN {g.code} · {g.players} player(s) · {g.createdAt}</span></span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${g.status === "FINISHED" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>{g.status === "FINISHED" ? "Finished" : "Open"}</span></Link></li>)}
          </ul>
        </Section>
      )}
    </AppShell>
  );
}
