import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { nafsQuestionView } from "@/server/nafs/bank";
import { CONTENT_SKILLS, MOE_OPTION_STYLES, MOE_STANDARDS, PROCESSES, PROCESS_NAME } from "@/server/nafs/framework";
import { getT } from "@/i18n/server";
import { NafsQuestionForm } from "@/components/nafs/question-form";

export const metadata = { title: "NAFS question" };

/**
 * 🇸🇦 Add a NAFS question (with or without a passage; MCQ A–D; NAFS skill tag) or edit one. Editing a platform
 * question saves a school copy — the original never changes.
 */
export default async function NafsQuestionPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const v = sp.id ? await nafsQuestionView(repo, actor, sp.id).catch(() => null) : null;
  const initial = v ? {
    id: v.q.id, own: v.entry.own, draft: v.entry.draft, nafsCode: v.entry.nafsCode, process: v.entry.process, standard: v.entry.standard ?? "", kind: v.q.kind, stem: v.q.stem, options: [0, 1, 2, 3].map((i) => v.q.options[i] ?? ""),
    correct: v.q.correct, explanation: v.q.explanation, model: v.q.model, rubric: v.q.rubric, passageTitle: v.q.passage?.title ?? "", passageText: v.q.passage?.text ?? "", textType: v.q.passage?.type ?? null, difficulty: v.entry.difficulty,
  } : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/nafs?tab=bank", label: "Question bank" }} icon="🇸🇦" title={v ? (v.entry.own ? "Edit question" : "Edit a copy") : "Add a question"}
        subtitle={v && !v.entry.own ? t("This is a platform question: your changes are saved as the school's own copy. The original never changes and is hidden from your NAFS bank.") : t("Multiple choice A–D or a short written answer, tagged with a Ministry standard and a NAFS skill. A passage is optional.")} />
      <NafsQuestionForm initial={initial} skills={CONTENT_SKILLS.map((k) => ({ code: k.code, name: k.name, process: k.process }))} processes={PROCESSES.map((p) => ({ code: p, name: PROCESS_NAME[p] }))}
        standards={MOE_STANDARDS.map((x) => ({ code: x.code, short: x.short, text: x.text }))} styles={MOE_OPTION_STYLES} />
    </AppShell>
  );
}
