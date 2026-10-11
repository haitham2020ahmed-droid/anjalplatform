import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { ClassChips, Empty, ExportLinks, fmtNum, fmtPct, pctTone, Stat, Stats, TableBox, td, th, WindowChips } from "@/components/reports/report-ui";
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
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🎮" title="Live games report"
        subtitle="Participation, accuracy by skill and rapid guessing in the class's live games. An answer faster than the rapid-guess line (set from the game's time per question) is a guess: it is left out of accuracy." />
      <ClassChips classes={classes} current={klass?.id ?? null} href={(id) => url(id)} />
      {klass && <WindowChips days={days} href={(d) => url(klass.id, d)} />}
      {!r ? <Empty>You have no classes yet.</Empty> : (
        <div className="space-y-5">
          <Stats>
            <Stat label="Games" value={r.summary.games} note={`last ${r.days} days`} />
            <Stat label="Took part" value={`${r.summary.joined} / ${r.summary.students}`} note={`${fmtPct(r.summary.participation)} of the class`} />
            <Stat label="Answers" value={r.summary.answers} />
            <Stat label="Accuracy" value={fmtPct(r.summary.accuracy)} note="rapid guesses left out" />
            <Stat label="Rapid guesses" value={fmtPct(r.summary.rapidPct)} tone={(r.summary.rapidPct ?? 0) >= 20 ? "amber" : "slate"} />
          </Stats>
          <ExportLinks report={{ kind: "games", classId: klass!.id, days, period: "TERM" }} />
          {!r.games.length ? <Empty>No live games for this class in this window. Start one from Games.</Empty> : (
            <>
              <Section title="Accuracy by skill" icon="🧩">
                <TableBox label="Accuracy by skill">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead><tr><th className={th}>Skill</th><th className={th}>Answers</th><th className={th}>Accuracy</th><th className={th}>Rapid</th></tr></thead>
                    <tbody>{r.skills.map((k) => <tr key={k.skillId} className="border-t border-slate-100"><td className={`${td} font-medium`}>{k.name}</td><td className={td}>{k.answers}</td><td className={`${td} font-semibold ${pctTone(k.accuracy)}`}>{fmtPct(k.accuracy)}</td><td className={td}>{fmtPct(k.rapidPct)}</td></tr>)}</tbody>
                  </table>
                </TableBox>
              </Section>
              <Section title="Most missed questions" icon="❗" hint="Lowest accuracy first (2+ answers), with the wrong answer chosen most often — a quick reteach target.">
                {r.missed.length ? (
                  <ol className="space-y-2">{r.missed.map((m) => (
                    <li key={m.questionId} className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-200 text-sm">
                      <p className="font-medium text-slate-900 [overflow-wrap:anywhere]">{m.stem}</p>
                      <p className="mt-1 text-slate-600">{m.skill} · {m.answers} answers · <b className={pctTone(m.accuracy)}>{fmtPct(m.accuracy)}</b>{m.commonWrong ? <> · most chosen wrong answer: {m.commonWrong}</> : null}</p>
                    </li>
                  ))}</ol>
                ) : <p className="text-slate-600">Not enough answers yet.</p>}
              </Section>
              <Section title="Students" icon="👩‍🎓">
                <TableBox label="Students">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead><tr><th className={th}>Student</th><th className={th}>Games</th><th className={th}>Answers</th><th className={th}>Accuracy</th><th className={th}>Rapid</th><th className={th}>Points</th></tr></thead>
                    <tbody>{r.students.map((s) => (
                      <tr key={s.studentId} className="border-t border-slate-100"><td className={td}><bdi>{s.name}</bdi></td><td className={td}>{s.games || <span className="text-amber-700">did not play</span>}</td><td className={td}>{s.answers}</td><td className={`${td} font-semibold ${pctTone(s.accuracy)}`}>{fmtPct(s.accuracy)}</td><td className={`${td} ${(s.rapidPct ?? 0) >= 30 ? "font-semibold text-amber-700" : ""}`}>{fmtPct(s.rapidPct)}</td><td className={td}>{fmtNum(s.points)}</td></tr>
                    ))}</tbody>
                  </table>
                </TableBox>
              </Section>
              <Section title="Games" icon="🗓">
                <TableBox label="Games">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead><tr><th className={th}>Date</th><th className={th}>Game</th><th className={th}>Questions</th><th className={th}>Players</th><th className={th}>Participation</th><th className={th}>Accuracy</th><th className={th}>Rapid</th></tr></thead>
                    <tbody>{r.games.map((g) => <tr key={g.id} className="border-t border-slate-100"><td className={td}>{g.date}</td><td className={`${td} font-medium`}>{g.title}</td><td className={td}>{g.questions}</td><td className={td}>{g.players}</td><td className={td}>{fmtPct(g.participation)}</td><td className={`${td} font-semibold ${pctTone(g.accuracy)}`}>{fmtPct(g.accuracy)}</td><td className={td}>{fmtPct(g.rapidPct)}</td></tr>)}</tbody>
                  </table>
                </TableBox>
              </Section>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
