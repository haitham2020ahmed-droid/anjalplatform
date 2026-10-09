import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { curriculumTree } from "@/server/admin/ai-bank";
import { GenerateForm } from "./generate-form";

export default async function GeneratePage() {
  const actor = await requireActor({ permission: "questions:generate" });
  const me = (await getActor())!.user;
  const tree = await curriculumTree(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin/question-bank" className="text-brand-teal hover:underline">← Question bank coverage</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Generate Questions with AI</h1>
      <p className="mt-1 max-w-3xl text-slate-600">Only curriculum information (grade, book, unit, lesson, skill and standard) is sent to the AI provider. No student names, results or other personal data are ever sent.</p>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-slate-200"><GenerateForm tree={tree} /></div>
    </AppShell>
  );
}
