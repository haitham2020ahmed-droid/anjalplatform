import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { AutoPrint } from "@/components/plans/auto-print";
import { PlanDocView } from "@/components/map/map-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { classPlans, type Subject } from "@/server/map/map-plan";
import { planDoc } from "@/server/map/map-more";
import { PrintFooter, PrintHeader, PrintPage, PrintStyles } from "@/components/print/print-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Print MAP plans" };

/** 🖨 Every individual MAP plan of a class, one per page — print or save as PDF. (The 3-level group plan prints from Personalized plan.) */
export default async function PrintMapPlansPage({ searchParams }: { searchParams: Promise<{ classId?: string; subject?: string; print?: string; copy?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classId = String(sp.classId ?? "");
  const subject: Subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const studentCopy = sp.copy === "student";
  const plans = await classPlans(repo, actor, classId, subject);
  const docs = await Promise.all(plans.plans.map((p) => planDoc(repo, actor, p.id)));
  const { t } = await getT();
  const school = actor.schoolId ? String((await repo.findUnique("School", { id: actor.schoolId }))?.name ?? "") : "";
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/teacher/map-plans?${new URLSearchParams({ classId, subject, tab: "plans" })}`, label: "MAP plans" }} icon="🖨" title={`All individual plans · ${plans.className}`}
          subtitle={`${docs.length} plan(s) · ${subject === "READING" ? "Reading" : "Language Usage"}. Press Print and choose “Save as PDF” to keep a file. Each student's plan starts on a new page.`}>
          <PrintButton />
          {/* 🔗 r79: the students' copy — every skill opens the student's own practice (the teachers' copy opens the skill page) */}
          <Link prefetch={false} href={`/teacher/map-plans/print?${new URLSearchParams({ classId, subject, ...(studentCopy ? {} : { copy: "student" }) })}`} data-testid="print-copy" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300">{studentCopy ? t("Teachers' copy") : t("Students' copy")}</Link>
        </PageHeader>
      </div>
      {docs.length > 0 && <PrintStyles extra={`.pk-map article{box-shadow:none;padding:4px 0 0}.pk-map article>header{border:0}`} />}
      {docs.map((d) => (
        <PrintPage key={d.id} className="pk-map" label={d.name}>
          <PrintHeader title={`${t("MAP plan")} · ${subject === "READING" ? "Reading" : "Language Usage"}`} subtitle={<bdi>{d.name} · {plans.className}</bdi>} school={school} t={t} />
          <PlanDocView d={d} forStudent={studentCopy} audience={studentCopy ? "student" : "staff"} />
          <PrintFooter t={t} right={<>{plans.className} · {d.term}</>} />
        </PrintPage>
      ))}
      {!docs.length && <p className="mt-6 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No individual plans yet: no student of this class has {subject === "READING" ? "Reading" : "Language Usage"} MAP scores.</p>}
      {sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
