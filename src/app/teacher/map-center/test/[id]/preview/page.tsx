import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MapTestPreview } from "@/components/map/map-test-preview";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { loadQuestionItems, toClientQuestion } from "@/server/practice/items";
import { testDetail } from "@/server/map/map-test";

export const metadata = { title: "MAP Test preview" };

/** 👁 The manual MAP test exactly as students see it (one question per screen); nothing is saved. */
export default async function MapTestPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const [{ t }, { id }] = await Promise.all([getT(), params]);
  let d;
  try { d = await testDetail(repo, actor, id); } catch (e) { if (e instanceof ForbiddenError) d = null; else throw e; }
  const items = d ? await loadQuestionItems(repo, d.items.map((x) => x.id)) : [];
  const questions = items.map((it) => toClientQuestion(it, `preview:${id}:${it.questionId}`));
  return (
    <AppShell name={String(me.displayName)}>
      <Link href={`/teacher/map-center/test/${encodeURIComponent(id)}`} className="mb-3 inline-flex min-h-10 items-center text-sm font-medium text-slate-500 hover:text-brand-teal">‹ {t("Back to the test")}</Link>
      {d && questions.length ? <MapTestPreview title={d.v.title} subject={d.subject} questions={questions} /> : <p className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">{t("Test not found.")}</p>}
    </AppShell>
  );
}
