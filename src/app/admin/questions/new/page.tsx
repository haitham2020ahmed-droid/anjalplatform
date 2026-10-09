import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { QuestionEditor } from "../question-editor";
import { editorOptions } from "../editor-data";
import { can } from "@/server/auth/rbac";
import { attachmentNodes } from "@/server/curriculum-map/questions";

export default async function NewQuestionPage({ searchParams }: { searchParams: Promise<{ map?: string }> }) {
  const actor = await requireActor({ permission: "questions:edit" });
  // “➕ Add question” on the Curriculum Map opens this page on that place
  const placeFromMap = ((await searchParams).map ?? "").slice(0, 120) || null;
  const me = (await getActor())!.user;
  const { skills, standards, grades } = await editorOptions(repo, actor.schoolId!);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin/questions" className="text-brand-teal hover:underline">← Questions</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">New Question</h1>
      <p className="mt-1 text-slate-600">New questions start as drafts. Students see a question only after a reviewer publishes it.</p>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-slate-200"><QuestionEditor questionId={null} initial={null} skills={skills} standards={standards} readOnly={false} curriculum={can(actor, "curriculum:edit") ? { grades } : undefined} initialPlace={placeFromMap} places={(await attachmentNodes(repo, actor.schoolId!)).map((p) => ({ code: p.code, grade: p.grade, unit: p.unit, path: p.path }))} /></div>
    </AppShell>
  );
}
