import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { FamilyWeekPage, FamilyWeekStyles } from "@/components/reports/family-week";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { accessibleClasses } from "@/server/teacher/assign";
import { familyWeeks, NOTE_MAX, type FamilyWeekBatch } from "@/server/reports/family-week";
import { getT } from "@/i18n/server";
import { LANG_NAMES, makeT } from "@/i18n";
import { saveFamilyWeekNoteAction } from "../actions";
import { ReportIntro, ReportSummary } from "@/components/report-kit";
import { familyWeekSummary } from "@/lib/report-summaries";
import { ClassSignInOption } from "@/components/class-signin/strip";

export const metadata = { title: "Family reports this week" };

/**
 * 👪 Family reports this week (per class): every student's weekly family page, previewed exactly as the student and
 * the family see it (English or Arabic), with the teacher's optional note per student, and Download PDF — one
 * student, or the whole class in one PDF (a page per student) to send by WhatsApp. The class's teacher or the admin.
 */
export default async function FamilyWeekTeacherPage({ searchParams }: { searchParams: Promise<{ classId?: string; studentId?: string; lang?: string; msg?: string; signin?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const [me, { t }, sp] = await Promise.all([getActor(), getT(), searchParams]);
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const lang = sp.lang === "ar" ? "ar" : "en";
  let batch: FamilyWeekBatch | null = null;
  let denied = false;
  try { batch = classId ? await familyWeeks(repo, actor, classId) : null; } catch (e) { if (!(e instanceof ForbiddenError)) throw e; denied = true; }
  const items = batch?.items ?? [];
  const cur = items.find((w) => w.studentId === sp.studentId) ?? items[0] ?? null;
  const tp = makeT(lang); // the preview in the family's language
  // 🖨 r85: the whole-class print carries the class sign-in QR + code (default on; signin=0 → off)
  const signinOn = sp.signin !== "0";
  const href = (o: { classId?: string; studentId?: string; lang?: string; signin?: boolean }) => {
    const p = new URLSearchParams();
    const v = { classId, studentId: cur?.studentId, lang, signin: signinOn, ...o };
    if (v.classId) p.set("classId", v.classId);
    if (v.studentId) p.set("studentId", v.studentId);
    if (v.lang === "ar") p.set("lang", "ar");
    if (!v.signin) p.set("signin", "0");
    return `/teacher/family-reports/this-week?${p}`;
  };
  const off = signinOn ? "" : "&signin=0";
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const btn = "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-semibold";
  return (
    <AppShell name={String(me!.user.displayName)}>
      <PageHeader back={{ href: "/teacher/family-reports", label: "Family Reports" }} icon="👪" title="Family reports this week"
        subtitle={t("Each student's week in simple words for the family: what they worked on, things to practise at home and your note. Preview it, then download a PDF to send by WhatsApp.")} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{String(sp.msg).slice(0, 200)}</p>}
      <ReportIntro text="Each student's week in simple words for the family, ready to download and send." />
      {classes.length > 1 && <nav aria-label={t("Class")} className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/family-reports/this-week?classId=${c.id}${lang === "ar" ? "&lang=ar" : ""}`} aria-current={c.id === classId ? "page" : undefined} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>}
      {denied && <EmptyState icon="🔒" title="You cannot open this summary." text="Only the class teacher and the school admin can print it." />}
      {!denied && !items.length && <EmptyState icon="👥" title="No students in this class yet" />}
      {cur && batch && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <aside className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <p className="px-2 text-sm font-semibold text-slate-600">{t("{n} students", { n: items.length })}</p>
            <ul className="mt-2 grid max-h-[70vh] gap-1 overflow-y-auto">
              {items.map((w) => (
                <li key={w.studentId}><Link prefetch={false} href={href({ studentId: w.studentId })} aria-current={w.studentId === cur.studentId ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-sm ${w.studentId === cur.studentId ? "bg-teal-50 font-semibold text-teal-900 ring-1 ring-teal-200" : "hover:bg-slate-50"}`}>
                  <bdi className="truncate">{w.name}</bdi><span className="shrink-0 text-xs text-slate-500">{w.note ? "📝 " : ""}{w.minutes} {t("min")}</span>
                </Link></li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3">
              <ClassSignInOption on={signinOn} href={href({ signin: !signinOn })} t={t} />
              <a href={`/api/family-week?classId=${encodeURIComponent(classId)}&lang=en&print=1${off}`} target="_blank" rel="noopener" className={`${btn} justify-center bg-brand-navy text-white`}>⬇ {t("Download all (one PDF)")} · {LANG_NAMES.en}</a>
              <a href={`/api/family-week?classId=${encodeURIComponent(classId)}&lang=ar&print=1${off}`} target="_blank" rel="noopener" className={`${btn} justify-center bg-white text-brand-navy ring-1 ring-slate-300`}>⬇ {t("Download all (one PDF)")} · {LANG_NAMES.ar}</a>
            </div>
          </aside>
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">{t("Preview in")}</span>
              <Link prefetch={false} href={href({ lang: "en" })} aria-current={lang === "en" ? "page" : undefined} className={chip(lang === "en")}>{LANG_NAMES.en}</Link>
              <Link prefetch={false} href={href({ lang: "ar" })} aria-current={lang === "ar" ? "page" : undefined} className={chip(lang === "ar")}>{LANG_NAMES.ar}</Link>
              <span className="flex-1" />
              <a href={`/api/family-week?studentId=${encodeURIComponent(cur.studentId)}&lang=${lang}&print=1`} target="_blank" rel="noopener" className={`${btn} bg-teal-700 text-white`}>⬇ {t("Download PDF")}</a>
            </div>
            <FamilyWeekStyles />
            <FamilyWeekPage w={cur} t={tp} lang={lang} />
            <form action={saveFamilyWeekNoteAction} className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <input type="hidden" name="studentId" value={cur.studentId} />
              <input type="hidden" name="classId" value={classId} />
              <input type="hidden" name="lang" value={lang} />
              <label className="block text-sm font-semibold text-slate-700">📝 {t("My note to the family (optional)")}
                <textarea name="note" rows={3} maxLength={NOTE_MAX} defaultValue={cur.note ?? ""} dir="auto" className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              <p className="mt-1 text-xs text-slate-500">{t("Write in English or Arabic. It is shown as you write it, on this week's page only.")}</p>
              <button className="mt-2 min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Save")}</button>
            </form>
          </div>
        </div>
      )}
      {items.length > 0 && <ReportSummary summary={familyWeekSummary(items, classId)} />}
    </AppShell>
  );
}
