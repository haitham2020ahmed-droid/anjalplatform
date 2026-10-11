import { AppShell } from "@/components/app-shell";
import { ClassChips, Empty, exportsOf, fmtNum, fmtPct, pctTone, WindowChips, windowText } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classGamesReport } from "@/server/reports/games-report";
import { windowOf } from "@/server/reports/report-access";

export const metadata = { title: "Live games report" };

/** 🎮 Live games: who took part, accuracy by skill, rapid guessing and the questions most missed. */
export default async function GamesReportPage({ searchParams }: { searchParams: Promise<{ classId?: string; days?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const days = windowOf(sp.days);
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const url = (classId: string, d = days) => `/teacher/reports/games?classId=${classId}&days=${d}`;
  const r = klass ? await classGamesReport(repo, actor, klass.id, { days }) : null;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🎮" title="Live games report"
        subtitle="Participation, accuracy by skill and rapid guessing in the class's live games. An answer faster than the rapid-guess line (set from the game's time per question) is a guess: it is left out of accuracy."
        who={klass?.name} when={windowText(t, days)} downloads={klass ? exportsOf({ kind: "games", classId: klass.id, days, period: "TERM" }) : []}
        filters={<><ClassChips classes={classes} current={klass?.id ?? null} href={(id) => url(id)} />{klass && <WindowChips days={days} href={(d) => url(klass.id, d)} />}</>} />
      {!r ? <Empty>You have no classes yet.</Empty> : (
        <div className="space-y-5">
          <AtAGlance items={[
            { icon: "🎮", label: "Games", value: r.summary.games, meaning: t("{n} answers in all", { n: r.summary.answers }) },
            { icon: "🙋", label: "Took part", value: `${r.summary.joined} / ${r.summary.students}`, meaning: t("{p} of the class", { p: fmtPct(r.summary.participation) }), tone: r.summary.joined < r.summary.students ? "warn" : "good" },
            { icon: "🎯", label: "Accuracy", value: fmtPct(r.summary.accuracy), meaning: "rapid guesses left out", tone: toneOfPct(r.summary.accuracy) },
            { icon: "⚡", label: "Rapid guesses", value: fmtPct(r.summary.rapidPct), meaning: "answers too fast to have been read", tone: (r.summary.rapidPct ?? 0) >= 20 ? "warn" : "neutral" },
          ]} />
          {!r.games.length ? <Empty>No live games for this class in this window. Start one from Games.</Empty> : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Callout kind="help" items={[
                  (() => { const n = r.students.filter((s) => !s.games); return n.length ? <>{t("Did not play")}: {n.slice(0, 10).map((s, i) => <span key={s.studentId}>{i ? ", " : ""}<bdi>{s.name}</bdi></span>)}{n.length > 10 ? ` +${n.length - 10}` : ""}</> : null; })(),
                  (() => { const n = r.students.filter((s) => (s.rapidPct ?? 0) >= 30); return n.length ? <>{t("Guessing fast (30%+ rapid)")}: {n.slice(0, 10).map((s, i) => <span key={s.studentId}>{i ? ", " : ""}<bdi>{s.name}</bdi></span>)}</> : null; })(),
                ]} />
                <Callout kind="next" items={[
                  (() => { const w = [...r.skills].filter((k) => k.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0]; return w && (w.accuracy ?? 100) < 70 ? <>{t("Reteach")} <b>{w.name}</b> ({fmtPct(w.accuracy)})</> : null; })(),
                  r.missed[0] ? t("Go over the most missed question below with the class.") : null,
                ]} />
              </div>
              <ReportSection title="Accuracy by skill" icon="🧩">
                <div className="grid gap-5 lg:grid-cols-2">
                  <SimpleBar items={r.skills.map((k) => ({ label: k.name, value: k.accuracy, note: t("{n} answers", { n: k.answers }) }))} />
                  <ReportTable label="Accuracy by skill"
                    cols={[{ key: "s", label: "Skill" }, { key: "a", label: "Answers", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "r", label: "Rapid", num: true }]}
                    rows={r.skills.map((k) => ({ id: k.skillId, sort: { acc: k.accuracy, r: k.rapidPct }, cells: { s: <span className="font-medium">{k.name}</span>, a: k.answers, acc: <span className={`font-semibold ${pctTone(k.accuracy)}`}>{fmtPct(k.accuracy)}</span>, r: fmtPct(k.rapidPct) } }))} />
                </div>
              </ReportSection>
              <ReportSection title="Most missed questions" icon="❗" hint="Lowest accuracy first (2+ answers), with the wrong answer chosen most often — a quick reteach target.">
                {r.missed.length ? (
                  <ol className="space-y-2">{r.missed.map((m) => (
                    <li key={m.questionId} className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-200 text-sm">
                      <p className="font-medium text-slate-900 [overflow-wrap:anywhere]">{m.stem}</p>
                      <p className="mt-1 text-slate-600">{m.skill} · {m.answers} answers · <b className={pctTone(m.accuracy)}>{fmtPct(m.accuracy)}</b>{m.commonWrong ? <> · most chosen wrong answer: {m.commonWrong}</> : null}</p>
                    </li>
                  ))}</ol>
                ) : <p className="text-slate-600">Not enough answers yet.</p>}
              </ReportSection>
              <ReportSection title="Students" icon="👩‍🎓">
                <ReportTable label="Students"
                  cols={[{ key: "n", label: "Student" }, { key: "g", label: "Games", num: true }, { key: "a", label: "Answers", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "r", label: "Rapid", num: true }, { key: "p", label: "Points", num: true }]}
                  rows={r.students.map((s) => ({
                    id: s.studentId, flag: !s.games || (s.rapidPct ?? 0) >= 30 ? "warn" : undefined, sort: { n: s.name, g: s.games, acc: s.accuracy, r: s.rapidPct, p: s.points },
                    cells: { n: <bdi>{s.name}</bdi>, g: s.games || <span className="text-amber-700">! did not play</span>, a: s.answers, acc: <span className={`font-semibold ${pctTone(s.accuracy)}`}>{fmtPct(s.accuracy)}</span>,
                      r: <span className={(s.rapidPct ?? 0) >= 30 ? "font-semibold text-amber-700" : ""}>{fmtPct(s.rapidPct)}</span>, p: fmtNum(s.points) },
                  }))} />
              </ReportSection>
              <ReportSection title="Games" icon="🗓">
                <ReportTable label="Games"
                  cols={[{ key: "d", label: "Date" }, { key: "g", label: "Game" }, { key: "q", label: "Questions", num: true }, { key: "p", label: "Players", num: true }, { key: "pa", label: "Participation", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "r", label: "Rapid", num: true }]}
                  rows={r.games.map((g) => ({ id: g.id, sort: { pa: g.participation, acc: g.accuracy, r: g.rapidPct }, cells: { d: g.date, g: <span className="font-medium">{g.title}</span>, q: g.questions, p: g.players, pa: fmtPct(g.participation), acc: <span className={`font-semibold ${pctTone(g.accuracy)}`}>{fmtPct(g.accuracy)}</span>, r: fmtPct(g.rapidPct) } }))} />
              </ReportSection>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
