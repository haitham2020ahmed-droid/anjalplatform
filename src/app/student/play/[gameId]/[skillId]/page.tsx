import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { soloRound } from "@/server/game/questions";
import { myRating } from "@/server/game/results";
import { PlayRunner } from "@/games/kit/runner";
import { EmptyState, BTN_PRIMARY } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Play" };

/** 🎲 Solo play: a game on one skill, filled from the bank at the student's level (opened from Play ▾ in My Work). */
export default async function PlayGamePage({ params }: { params: Promise<{ gameId: string; skillId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { gameId, skillId } = await params;
  try {
    const [round, rating] = await Promise.all([soloRound(repo, actor, gameId, skillId), myRating(repo, actor, gameId)]);
    return <AppShell name={String(me.displayName)}><PlayRunner initial={round} rating={rating} backHref="/student#my-work" /></AppShell>;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    return (
      <AppShell name={String(me.displayName)}>
        <EmptyState icon="🎲" title="Let's pick another game" text={e instanceof ForbiddenError ? "This skill is not in your work." : "This game needs more questions for this skill. Try another game from Play."} />
        <p className="mt-4 text-center"><Link prefetch={false} href="/student#my-work" className={BTN_PRIMARY}>{t("Back to My Work")}</Link></p>
      </AppShell>
    );
  }
}
