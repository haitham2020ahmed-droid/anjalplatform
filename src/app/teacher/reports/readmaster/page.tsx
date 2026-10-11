import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReadingLevelLabel, ReadingScalesHelp } from "@/components/reading-level";
import { chip, Empty, exportsOf, fmtNum, fmtPct, fmtSigned, pctTone, WindowChips, windowText } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { readableClasses } from "@/server/teacher/coordinators";
import { classReadMasterReport, readMasterAnalytics, type ReadMasterAnalytics, type RmScope } from "@/server/reports/readmaster-report";
import { windowOf } from "@/server/reports/report-access";

export const metadata = { title: "ReadMaster results" };

const VIEWS = ["students", "texts", "skills", "below"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, { label: string; icon: string }> = {
  students: { label: "By student", icon: "👩‍🎓" }, texts: { label: "By text", icon: "📰" }, skills: { label: "By skill", icon: "🧩" }, below: { label: "Reading below their level", icon: "🧪" },
};

/**
 * ⭐ ReadMaster results — every ReadMaster number in the Reports hub. A teacher sees their own classes (all of them, or
 * one); a school admin sees the whole school (or one class). Views: by student (texts read, average score, reading
 * Lexile start → now, counted vs practice), by text (readers, average score by level), by skill (accuracy) and the
 * students reading below their level (who chose lower versions most). Scope is checked on the server (typed URLs too).
 */
export default async function ReadMasterReportPage({ searchParams }: { searchParams: Promise<{ classId?: string; days?: string; scope?: string; view?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const days = windowOf(sp.days, 90);
  const school = can(actor, "analytics:school");
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = sp.classId ? classes.find((c) => c.id === sp.classId) ?? null : null;
  const wide: RmScope = school ? "school" : "mine";
  const scope: RmScope = klass ? "class" : sp.scope === "school" || sp.scope === "mine" ? sp.scope : wide;
  const view: View = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as View) : "students";
  const url = (o: { classId?: string | null; scope?: RmScope; days?: number; view?: View }) => {
    const q = new URLSearchParams();
    const cid = o.classId === undefined ? klass?.id ?? null : o.classId;
    if (cid) q.set("classId", cid); else q.set("scope", o.scope ?? (scope === "class" ? wide : scope));
    q.set("days", String(o.days ?? days)); q.set("view", o.view ?? view);
    return `/teacher/reports/readmaster?${q}`;
  };
  const { t } = await getT();
  let r: ReadMasterAnalytics | null = null, refused = false;
  if (sp.classId && !klass) refused = true;
  else {
    try { r = await readMasterAnalytics(repo, actor, { scope, classId: klass?.id ?? null, days }); }
    catch (e) { if (e instanceof ForbiddenError) refused = true; else throw e; }
  }
  // one class: the question-type accuracy of the Update 39C class report too
  const cls = klass && r ? await classReadMasterReport(repo, actor, klass.id, { days }) : null;
  const downloads = klass ? exportsOf({ kind: "readmaster", classId: klass.id, days, period: "TERM" }) : scope === "school" && school ? exportsOf({ kind: "readmaster", scope: "school", days, period: "TERM" }) : [];
  const studentLink = (id: string, name: string) => <Link href={`/teacher/reports/readmaster/${id}`} className="inline-flex min-h-8 items-center font-semibold text-brand-teal hover:underline"><bdi>{name}</bdi></Link>;
  const score = (v: number | null) => <span className={`font-semibold ${pctTone(v)}`}>{fmtPct(v)}</span>;
  const names = (list: { studentId: string; name: string }[]) => <>{list.slice(0, 8).map((x, i) => <span key={x.studentId}>{i ? ", " : ""}<bdi>{x.name}</bdi></span>)}{list.length > 8 ? ` +${list.length - 8}` : ""}</>;
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="⭐" title="ReadMaster results"
        subtitle={<>{t("By student, by text, by skill, and the students reading below their level.")} {t("Counted = read at the student's level or higher; Practice = a lower level (no level change).")} <ReadingLevelLabel scale="READMASTER" /></>}
        who={r ? (scope === "class" ? <bdi>{r.label}</bdi> : t(r.label)) : undefined} when={windowText(t, days)} downloads={downloads}
        filters={<>
          <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2 print:hidden">
            <Link href={url({ classId: null, scope: wide })} className={chip(scope !== "class")}>{t(school ? "Whole school" : "All my classes")}</Link>
            {classes.map((c) => <Link key={c.id} href={url({ classId: c.id })} className={chip(c.id === klass?.id)}><bdi>{c.name}</bdi></Link>)}
          </nav>
          <WindowChips days={days} href={(d) => url({ days: d })} />
        </>} />
      <ReadingScalesHelp className="mb-4" />
      {refused ? <Empty>{t("You cannot open this report.")}</Empty> : !r ? <Empty>You have no classes yet.</Empty> : (
        <div className="space-y-5">
          <AtAGlance items={[
            { icon: "📚", label: "Readers", value: `${r.summary.readers} / ${r.summary.students}`, meaning: t("students read at least one article in the last {n} days", { n: r.days }), tone: r.summary.readers < r.summary.students ? "warn" : "good" },
            { icon: "📰", label: "Texts read", value: r.summary.reads, meaning: t("{n} counted · {m} practice", { n: r.summary.counted, m: r.summary.practice }) },
            { icon: "🎯", label: "Avg score", value: fmtPct(r.summary.avgScore), meaning: t("average score of the counted reads"), tone: toneOfPct(r.summary.avgScore) },
            { icon: "📈", label: "Avg Lexile change", value: fmtSigned(r.summary.avgChange), meaning: "ReadMaster reading Lexile since the first article", tone: (r.summary.avgChange ?? 0) > 0 ? "good" : (r.summary.avgChange ?? 0) < 0 ? "bad" : "neutral" },
            { icon: "🧪", label: "Reading below their level", value: r.summary.belowReaders, meaning: t("students who chose a lower version at least once"), tone: r.summary.belowReaders ? "warn" : "neutral" },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Callout kind="help" items={[
              (() => { const n = r.below.slice(0, 8); return n.length ? <>{t("Chose lower versions most")}: {names(n)}</> : null; })(),
              (() => { const n = r.students.filter((x) => (x.change ?? 0) < 0); return n.length ? <>{t("Reading Lexile went down")}: {names(n)}</> : null; })(),
              (() => { const n = r.students.filter((x) => x.avgScore !== null && x.avgScore < 60); return n.length ? <>{t("Under 60% accuracy")}: {names(n)}</> : null; })(),
            ]} />
            <Callout kind="next" items={[
              (() => { const w = r.skills.find((x) => x.accuracy !== null); return w ? <>{t("Model the weakest skill")}: <b>{w.skill}</b> ({fmtPct(w.accuracy)})</> : null; })(),
              r.below.length ? t("Encourage students who practise below their level to try their own level next.") : null,
              t("Ask students who are not reading yet to read one article this week."),
            ]} />
          </div>
          <nav aria-label={t("Views")} className="flex flex-wrap gap-2 print:hidden" data-rm="views">
            {VIEWS.map((v) => <Link key={v} href={url({ view: v })} aria-current={v === view ? "page" : undefined} className={chip(v === view)}><span aria-hidden="true" className="me-1">{VIEW_LABEL[v].icon}</span>{t(VIEW_LABEL[v].label)}</Link>)}
          </nav>
          {view === "students" && (
            <ReportSection title="By student" icon="👩‍🎓">
              <ReportTable label="By student" empty="No ReadMaster reads in this window."
                cols={[{ key: "n", label: "Student" }, { key: "g", label: "Grade", num: true }, { key: "t", label: "Texts read", num: true }, { key: "c", label: "Counted", num: true }, { key: "p", label: "Practice", num: true }, { key: "a", label: "Avg score", num: true }, { key: "ls", label: "Reading Lexile start", num: true }, { key: "ln", label: "Now", num: true }, { key: "ch", label: "Change", num: true }, { key: "l", label: "Last read" }]}
                rows={r.students.map((x) => ({
                  id: x.studentId, flag: !x.texts || (x.change ?? 0) < 0 ? "warn" : undefined,
                  sort: { n: x.name, g: x.grade, t: x.texts, c: x.counted, p: x.practice, a: x.avgScore, ls: x.lexileStart, ln: x.lexileNow, ch: x.change, l: x.lastRead },
                  cells: { n: studentLink(x.studentId, x.name), g: x.grade ?? "—", t: x.texts, c: x.counted, p: x.practice ? <span className="font-semibold text-amber-800">{x.practice}</span> : 0, a: score(x.avgScore),
                    ls: x.lexileStart === null ? "—" : `${x.lexileStart}L`, ln: x.lexileNow === null ? "—" : `${x.lexileNow}L`,
                    ch: <span className={(x.change ?? 0) > 0 ? "font-semibold text-emerald-700" : (x.change ?? 0) < 0 ? "font-semibold text-red-700" : ""}>{(x.change ?? 0) > 0 ? "▲ " : (x.change ?? 0) < 0 ? "▼ " : ""}{fmtSigned(x.change)}</span>, l: x.lastRead ?? "—" },
                }))} />
            </ReportSection>
          )}
          {view === "texts" && (
            <ReportSection title="By text" icon="📰" hint={t("Average score of each version: Below / On / Above (number of reads).")}>
              <ReportTable label="By text" empty="No ReadMaster reads in this window."
                cols={[{ key: "t", label: "Text" }, { key: "g", label: "Grade", num: true }, { key: "s", label: "Skill" }, { key: "r", label: "Readers", num: true }, { key: "a", label: "Avg score", num: true }, { key: "b", label: "Below", num: true }, { key: "o", label: "On", num: true }, { key: "ab", label: "Above", num: true }, { key: "p", label: "Practice", num: true }]}
                rows={r.texts.map((x) => ({
                  id: x.articleId, sort: { t: x.title, g: x.grade, s: x.skill, r: x.readers, a: x.avgScore, b: x.byLevel.BELOW.avg, o: x.byLevel.ON.avg, ab: x.byLevel.ABOVE.avg, p: x.practice },
                  cells: { t: <span dir="ltr" className="font-medium">{x.title}</span>, g: x.grade, s: <span dir="ltr">{x.skill}</span>, r: x.readers, a: score(x.avgScore),
                    b: x.byLevel.BELOW.reads ? <>{fmtPct(x.byLevel.BELOW.avg)} <span className="text-xs text-slate-500">({x.byLevel.BELOW.reads})</span></> : "—",
                    o: x.byLevel.ON.reads ? <>{fmtPct(x.byLevel.ON.avg)} <span className="text-xs text-slate-500">({x.byLevel.ON.reads})</span></> : "—",
                    ab: x.byLevel.ABOVE.reads ? <>{fmtPct(x.byLevel.ABOVE.avg)} <span className="text-xs text-slate-500">({x.byLevel.ABOVE.reads})</span></> : "—", p: x.practice },
                }))} />
            </ReportSection>
          )}
          {view === "skills" && (
            <ReportSection title="By skill" icon="🧩" hint={t("Accuracy of the counted reads of each article's skill; practice reads shown apart.")}>
              {r.skills.length ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <SimpleBar items={r.skills.map((x) => ({ label: x.skill, value: x.accuracy, note: t("{n} counted reads", { n: x.counted }) }))} />
                  <ReportTable label="By skill"
                    cols={[{ key: "s", label: "Skill" }, { key: "t", label: "Texts", num: true }, { key: "r", label: "Readers", num: true }, { key: "c", label: "Counted", num: true }, { key: "a", label: "Accuracy", num: true }, { key: "p", label: "Practice", num: true }, { key: "pa", label: "Practice accuracy", num: true }]}
                    rows={r.skills.map((x) => ({ id: x.skill, sort: { s: x.skill, t: x.texts, r: x.readers, c: x.counted, a: x.accuracy, p: x.practice, pa: x.practiceAccuracy }, cells: { s: <span dir="ltr">{x.skill}</span>, t: x.texts, r: x.readers, c: x.counted, a: score(x.accuracy), p: x.practice, pa: fmtPct(x.practiceAccuracy) } }))} />
                </div>
              ) : <p className="text-slate-600">{t("No ReadMaster reads in this window.")}</p>}
            </ReportSection>
          )}
          {view === "below" && (
            <ReportSection title="Reading below their level" icon="🧪" hint={t("Students who chose a version below their own level (Practice), most first.")}>
              <ReportTable label="Reading below their level" empty="No student chose a lower level in this window."
                cols={[{ key: "n", label: "Student" }, { key: "g", label: "Grade", num: true }, { key: "lo", label: "Lower-level reads", num: true }, { key: "r", label: "All reads", num: true }, { key: "sh", label: "Share", num: true }, { key: "l", label: "Last lower read" }]}
                rows={r.below.map((x) => ({ id: x.studentId, flag: (x.share ?? 0) >= 50 ? "warn" : undefined, sort: { n: x.name, g: x.grade, lo: x.lower, r: x.reads, sh: x.share, l: x.last }, cells: { n: studentLink(x.studentId, x.name), g: x.grade ?? "—", lo: x.lower, r: x.reads, sh: fmtPct(x.share), l: x.last ?? "—" } }))} />
            </ReportSection>
          )}
          {cls && view === "skills" && (
            <ReportSection title="Accuracy by question type" icon="🧩" hint="ReadMaster answers saved through the engine; rapid guesses left out.">
              {cls.types.length ? <SimpleBar items={cls.types.map((x) => ({ label: x.name, value: x.accuracy, note: t("{n} answers", { n: x.answers }) }))} /> : <p className="text-slate-600">No ReadMaster answers in this window.</p>}
            </ReportSection>
          )}
        </div>
      )}
    </AppShell>
  );
}
