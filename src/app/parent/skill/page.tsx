import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RichInline } from "@/components/rich-inline";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { ForbiddenError } from "@/server/auth/rbac";
import { familySkillPreview, type FamilyPreviewView } from "@/server/curriculum-map/skill-preview";

export const metadata = { title: "Skill preview" };

/**
 * 👀 r87: what a PARENT sees from the Curriculum Map PDF's link on one skill — the question text and choices,
 * never which one is correct. Read-only.
 */
export default async function ParentSkillPreviewPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const code = (await searchParams).code ?? "";
  let v: FamilyPreviewView | null = null, error: string | null = null;
  try { v = await familySkillPreview(repo, actor, code); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) error = e.message; else throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/parent", label: "My Children" }} icon="👀" title={v ? v.title : "Skill preview"} subtitle={v ? v.subtitle : null} />
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
      {v && (
        <>
          <p className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">A look at this skill from your child's Curriculum Map — the questions, not the answers.</p>
          {!v.questions.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No questions here yet.</p> : (
            <ol className="space-y-4">
              {v.questions.map((x, i) => (
                <li key={x.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                  {x.passageText && <details className="mb-3 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold text-brand-navy">📖 {x.passageTitle ?? "Passage"}</summary><p className="mt-2 whitespace-pre-line text-slate-700"><RichInline text={x.passageText} /></p></details>}
                  <p className="text-lg font-medium text-slate-900"><span className="me-2 font-bold text-brand-navy">{i + 1}.</span><RichInline text={x.stem} /></p>
                  {x.options.length > 0 && <ul className="mt-2 grid gap-1 sm:grid-cols-2">{x.options.map((o) => <li key={o.label} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-200">{o.label}. <RichInline text={o.text} /></li>)}</ul>}
                </li>
              ))}
            </ol>
          )}
          {v.total > v.shown && <p className="mt-3 text-sm text-slate-500">Showing the first {v.shown} of {v.total}.</p>}
        </>
      )}
      {!error && !v && <Link href="/parent" className="font-semibold text-brand-teal underline">My Children</Link>}
    </AppShell>
  );
}
