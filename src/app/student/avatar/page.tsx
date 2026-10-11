import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AvatarShop } from "@/components/motivation/avatar-shop";
import { CoinIcon } from "@/components/motivation/avatar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { shopView } from "@/server/motivation/shop";
import { coinHistory, COINS } from "@/server/motivation/coins";
import { getT } from "@/i18n/server";

export const metadata = { title: "Avatar Shop" };
const REASON: Record<string, string> = { work: "My Work skill finished", mastered: "Skill mastered", levelup: "Move up a level", plan: "Finish a plan", qotd: "Question of the Day", game: "Game", live: "Live Challenge", "live.win": "Won a Live Challenge", bonus: "Bonus from my teacher", shop: "Avatar Shop" };

/** 🛍️ Avatar Shop (Games Part 3): opened from the avatar + coins in the top bar. Students only, own coins only. */
export default async function AvatarShopPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, v, history] = await Promise.all([getT(), shopView(repo, actor), coinHistory(repo, actor.studentId!, 8)]);
  const ways: [string, number][] = [["Finish a skill in My Work", COINS.work], ["Master a skill", COINS.mastered], ["Move up a level", COINS.levelup], ["Finish a plan", COINS.plan], ["Question of the Day (right)", COINS.qotdRight], ["Games and Live Challenge", COINS.game]];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🛍️" title="Avatar Shop" subtitle={t("Choose your character, hat, glasses and color. Fixed prices — no surprises, no real money.")} />
      <AvatarShop items={v.items} coins={v.chip.coins} avatar={v.chip.avatar} />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section aria-labelledby="earn-h" className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 id="earn-h" className="font-semibold text-brand-navy">{t("How to earn coins")}</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {ways.map(([w, n]) => <li key={w} className="flex items-center justify-between gap-3 py-2"><span>{t(w)}</span><span className="inline-flex items-center gap-1 font-semibold text-amber-900"><CoinIcon size={16} /><span dir="ltr">+{n}</span></span></li>)}
          </ul>
          <p className="mt-2 text-sm text-slate-500">{t("Coins never change your level or your scores.")}</p>
        </section>
        <section aria-labelledby="hist-h" className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 id="hist-h" className="font-semibold text-brand-navy">{t("My coins")}</h2>
          {history.length ? (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {history.map((h, i) => <li key={i} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate"><span dir="ltr" className="me-2 text-slate-500">{h.date}</span>{t(h.note ?? REASON[h.reason] ?? h.reason)}</span><span dir="ltr" className={`font-semibold tabular-nums ${h.amount < 0 ? "text-slate-600" : "text-emerald-700"}`}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span></li>)}
            </ul>
          ) : <p className="mt-2 text-slate-600">{t("No coins yet. Finish a skill in My Work to earn your first coins!")}</p>}
        </section>
      </div>
    </AppShell>
  );
}
