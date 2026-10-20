import Link from "next/link";
import { repo } from "@/server/auth/next";
import { rewardChip, studentGradeClass } from "@/server/motivation/coins";
import { getT } from "@/i18n/server";
import { badgeByCode } from "@/lib/badge-catalog";
import { Avatar, BadgeEmblem, CoinIcon } from "./avatar";

/**
 * 🧑‍🚀 The student's corner of the top bar (Games Part 3): avatar + coins (opens the Avatar Shop) and the favorite
 * badge emblem next to the name (opens all badges). One cached read (rewardChip: 30 s per student).
 * Grade + class sit under the name (studentGradeClass, cached 10 min) — handy for a teacher/admin signed in as a
 * student, or flipping between several test accounts, to see at a glance who they are looking at.
 */
export async function RewardChip({ studentId, name }: { studentId: string; name: string }) {
  const [{ t }, c, gc] = await Promise.all([getT(), rewardChip(repo, studentId).catch(() => null), studentGradeClass(repo, studentId).catch(() => null)]);
  if (!c) return null;
  const fav = badgeByCode(c.favoriteBadge);
  const where = gc && (gc.grade || gc.className) ? [gc.grade ? t("Grade {n}", { n: gc.grade }) : null, gc.className].filter(Boolean).join(" · ") : null;
  return (
    <span className="flex items-center gap-1 sm:gap-2">
      <Link prefetch={false} href="/student/avatar" data-testid="reward-chip" aria-label={t("Avatar Shop · {n} coins", { n: c.coins })}
        className="flex min-h-11 items-center gap-1 rounded-full bg-amber-50 py-1 pe-2 ps-0.5 font-semibold sm:gap-1.5 sm:pe-3 sm:ps-1 text-amber-900 ring-1 ring-amber-200 hover:ring-amber-400">
        <Avatar avatar={c.avatar} size={32} />
        <span className="hidden sm:inline-flex"><CoinIcon size={18} /></span>
        <span dir="ltr" className="tabular-nums" data-testid="coin-count">{c.coins.toLocaleString("en")}</span>
      </Link>
      <span className="hidden flex-col leading-tight xl:flex">
        <bdi className="max-w-[9rem] truncate font-semibold text-slate-800">{name}</bdi>
        {where && <bdi data-testid="reward-chip-grade-class" className="max-w-[9rem] truncate text-xs font-normal text-slate-500">{where}</bdi>}
      </span>
      <Link prefetch={false} href="/student/badges" data-testid="favorite-emblem" aria-label={fav ? t("My favorite badge: {name}", { name: t(fav.name) }) : t("My badges")}
        className="hidden min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-slate-100 sm:flex">
        {fav ? <BadgeEmblem code={fav.code} size={24} label={t(fav.name)} /> : <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full border-2 border-dashed border-slate-300 text-xs text-slate-400">★</span>}
      </Link>
    </span>
  );
}
