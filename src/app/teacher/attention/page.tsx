import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState, BTN_SECONDARY } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { accessibleClasses } from "@/server/teacher/assign";
import { attentionList, type AttentionKind } from "@/server/teacher/home";

export const metadata = { title: "Needs your attention" };

/** 🔔 The list a "Needs your attention" card opens (own class only); each name opens the student's profile. */
export default async function AttentionPage({ searchParams }: { searchParams: Promise<{ classId?: string; kind?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const kind: AttentionKind = sp.kind === "rti" ? "rti" : sp.kind === "tests" ? "tests" : "not-started";
  const classes = await accessibleClasses(repo, actor);
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await attentionList(repo, actor, classId, kind) : null;
  const title = kind === "rti" ? "Suggested for RTI" : kind === "tests" ? "Tests with new results" : "Have not started their work";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: classId ? `/teacher?classId=${classId}` : "/teacher", label: "Home" }} icon={kind === "rti" ? "🛟" : kind === "tests" ? "📝" : "⏰"} title={title} subtitle={v ? <bdi>{v.className}</bdi> : undefined}>
        {kind === "rti" && classId && <Link prefetch={false} href={`/teacher/tiers?classId=${classId}`} className={BTN_SECONDARY}>{t("Support Tiers")}</Link>}
        {kind === "rti" && classId && <Link prefetch={false} href={`/teacher/rti-plan?classId=${classId}`} className={BTN_SECONDARY}>{t("RTI Program")}</Link>}
      </PageHeader>
      {kind === "tests" ? (
        v && v.tests.length ? (
          <ul className="space-y-2">{v.tests.map((x) => <li key={x.id}><Link prefetch={false} href={`/teacher/assessments/${x.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200 hover:ring-brand-teal"><span className="font-semibold text-brand-navy" data-content lang="en">{x.title}</span><span className="text-sm text-slate-600">{t("{n} new results", { n: x.fresh })}</span></Link></li>)}</ul>
        ) : <EmptyState icon="✅" title="No results yet" />
      ) : v && v.rows.length ? (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
          {v.rows.map((r) => (
            <li key={r.studentId}>
              <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="flex min-h-14 flex-col justify-center px-4 py-3 hover:bg-slate-50">
                <span className="font-semibold text-brand-navy"><bdi>{r.name}</bdi></span>
                <span className="text-sm text-slate-600" data-content lang="en">{r.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="✅" title="Nothing needs your attention right now" />}
    </AppShell>
  );
}
