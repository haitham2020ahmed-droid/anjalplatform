import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BankTabs } from "../bank-tabs";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { explainLoadError, loadStatus, type LoadStatus } from "@/server/admin/load-questions";
import { LoadRunner, type RunnerPack } from "./load-runner";

export const metadata = { title: "Load new questions" };

/**
 * 📥 Load new questions (school admin): opens at once with the list of question packs (no counting here — two small
 * reads); each pack's "already in / left" is asked for after the page has opened, all packs at the same time
 * (/api/admin/question-packs/count), and a pack that cannot be counted says why on its own row. Load / Load
 * everything run in short chunks from the page (src/server/admin/load-questions.ts), then the Question Check.
 */
export default async function LoadQuestionsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  let st: LoadStatus = { packs: [], running: null, last: null };
  let failed: string | null = null;
  try { st = await loadStatus(repo, actor); }
  catch (e) { console.error("load-questions page", e); const x = explainLoadError(e, "The list of question packs could not be read: {what}"); failed = t(x.error, { what: x.what }); }
  const packs: RunnerPack[] = st.packs.map((p) => ({
    key: p.key, title: p.title, hint: p.hint, file: p.file, present: p.present,
    done: p.progress?.done ?? 0, total: p.progress?.total ?? 0, finished: Boolean(p.progress?.finishedAt), added: p.progress?.added ?? 0, errors: p.progress?.errors ?? [],
  }));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Questions" }} icon="⬇️" title="Load new questions"
        subtitle="The platform's new question sets, loaded here instead of from a terminal. Questions already in the bank are skipped, so Load is safe to press again. At the end the Question Check hides any question with a definite error from students.">
        <Link href="/admin/item-quality" prefetch={false} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">🔬 {t("Question Check")}</Link>
      </PageHeader>
      <BankTabs />
      {failed ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200" dir="auto">{failed}</p>
        : <LoadRunner packs={packs} running={st.running ? (st.running.byName || "—") : null} last={st.last} />}
      <p className="mt-4 text-xs text-slate-500">{t("“Already in” is counted by question text. Work is done a few skills at a time; you can stop and come back later.")}</p>
    </AppShell>
  );
}
