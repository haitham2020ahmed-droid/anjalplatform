import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { openGamesFor } from "@/server/game/live";
import { joinGameAction } from "@/app/games/actions";

export const metadata = { title: "Join a game" };

/** 🎮 A student joins a live game: type the PIN, or tap a game open for their class. */
export default async function PlayPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const open = await openGamesFor(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <div className="mx-auto max-w-md space-y-5">
        <form action={joinGameAction} className="animate-pop rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-8 text-center text-white shadow-xl">
          <p className="animate-float text-6xl" aria-hidden="true">🎮</p>
          <h1 className="mt-2 text-3xl font-black">Join a game</h1>
          <label className="mt-5 block"><span className="sr-only">Game PIN</span>
            <input name="code" inputMode="numeric" autoComplete="off" required maxLength={8} placeholder="Game PIN" className="w-full rounded-2xl bg-white px-4 py-4 text-center font-mono text-3xl font-black tracking-[0.3em] text-brand-navy" />
          </label>
          <button className="mt-4 w-full rounded-2xl bg-brand-gold py-3.5 text-xl font-black text-brand-navy shadow active:scale-95">Enter ▶</button>
        </form>
        {sp.msg && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-center text-red-800">{sp.msg}</p>}
        {open.length > 0 && (
          <div className="rounded-3xl bg-white p-5 ring-1 ring-emerald-200">
            <p className="font-bold text-brand-navy">Open now for your class</p>
            <ul className="mt-2 space-y-2">{open.map((g) => <li key={g.code}><Link href={`/play/${g.code}`} className="lift flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900 ring-1 ring-emerald-200">{g.title}<span>Join ▶</span></Link></li>)}</ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
