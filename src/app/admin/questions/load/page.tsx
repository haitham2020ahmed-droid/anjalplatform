import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BankTabs } from "../bank-tabs";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { loadStatus } from "@/server/admin/load-questions";
import { LoadRunner, type RunnerPack } from "./load-runner";

export const metadata = { title: "Load new questions" };

/**
 * 📥 Load new questions (school admin): each question pack with what is in already and what is left, Load / Load
 * everything. The work runs in short chunks from the page (src/server/admin/load-questions.ts), then the Question Check.
 */
export default async function LoadQuestionsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const st = await loadStatus(repo, actor);
  const packs: RunnerPack[] = st.packs.map((p) => ({
    key: p.key, title: p.title, hint: p.hint, file: p.file, present: p.present, applies: p.count?.applies ?? false,
    questions: p.count?.questions ?? 0, inBank: p.count?.inBank ?? 0, left: p.count?.left ?? 0,
    done: p.progress?.done ?? 0, total: p.progress?.total ?? p.count?.units ?? 0, finished: Boolean(p.progress?.finishedAt), added: p.progress?.added ?? 0, errors: p.progress?.errors ?? [],
  }));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Questions" }} icon="⬇️" title="Load new questions"
        subtitle="The platform's new question sets, loaded here instead of from a terminal. Questions already in the bank are skipped, so Load is safe to press again. At the end the Question Check hides any question with a definite error from students.">
        <Link href="/admin/item-quality" prefetch={false} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">🔬 {t("Question Check")}</Link>
      </PageHeader>
      <BankTabs />
      <LoadRunner packs={packs} running={st.running ? (st.running.byName || "—") : null} last={st.last} />
      <p className="mt-4 text-xs text-slate-500">{t("“Already in” is counted by question text. Work is done a few skills at a time; you can stop and come back later.")}</p>
    </AppShell>
  );
}
