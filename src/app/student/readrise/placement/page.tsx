import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { placementView } from "@/server/readrise/placement";
import { ensureRRStudent } from "@/server/readrise/engine";
import { ReadRiseIcon } from "@/components/readrise/readrise-icon";
import { PlacementRunner } from "@/components/readrise/placement";
import { getT } from "@/i18n/server";

export const metadata = { title: "ReadRise placement" };
export const dynamic = "force-dynamic";

/** 🚀 The ReadRise placement (LevelSet-like): adaptive passages from data/readrise/placement.json, 3 questions each. */
export default async function ReadRisePlacementPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const view = await placementView(repo, actor);
  const level = view.state === "DONE" ? Number((await ensureRRStudent(repo, actor.studentId!)).level) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student/readrise" className="inline-flex min-h-10 items-center text-sm font-medium text-slate-500 hover:text-brand-teal">‹ ReadRise</Link></p>
      <header className="mt-2 flex items-center gap-3">
        <ReadRiseIcon size={48} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-navy">{t("Find my ReadRise Level")}</h1>
          <p className="text-slate-600">{t("Up to 13 short passages, 3 questions each (about 36–39 questions). About 20–30 minutes — no time limit, you can stop and come back. They get easier or harder as you go.")}</p>
        </div>
      </header>
      <div className="mx-auto mt-5 max-w-3xl">
        <PlacementRunner view={view} level={level} />
      </div>
    </AppShell>
  );
}
