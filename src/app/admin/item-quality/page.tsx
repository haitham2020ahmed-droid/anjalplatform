import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BankTabs } from "../questions/bank-tabs";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { itemQuality, MIN_ANSWERS, type ItemFlag } from "@/server/admin/item-quality";
import { alertList, levelChangeList, questionData } from "@/server/admin/question-data";
import { questionsWithoutLevel } from "@/server/questions/bank-levels";
import { listAutoHidden } from "@/server/questions/auto-check";
import { MIN_PER_SKILL, skillsUnderMinimum } from "@/server/questions/min-per-skill";
import { autoCheckAction, resolveAlertAction, releaseHoldAction } from "./actions";
import { LineIcon } from "@/components/ui/line-icon";
import { RichInline } from "@/components/rich-inline";
import { stripMarks } from "@/lib/inline-marks";
import { FlaggedTable } from "./flagged-table";

export const metadata = { title: "Question quality" };
const FLAG: Record<ItemFlag, [string, string, string]> = {
  TOO_EASY: ["Too easy for its level", "bg-emerald-50 text-emerald-800 ring-emerald-200", "Move it down a level, or make it harder"],
  TOO_HARD: ["Too hard for its level", "bg-red-50 text-red-800 ring-red-200", "Check the answer key, or move it up a level"],
  GUESSED: ["Often guessed", "bg-orange-50 text-orange-900 ring-orange-200", "Shorten or clarify the question or its passage"],
  UNUSED_OPTION: ["Option never chosen", "bg-violet-50 text-violet-900 ring-violet-200", "Replace it with a more believable wrong answer"],
};
const ALERT: Record<string, [string, string]> = {
  KEY_SUSPECT: ["Key may be wrong", "bg-red-50 text-red-800 ring-red-200"],
  DISTRACTOR_MAGNET: ["Misleading option", "bg-orange-50 text-orange-900 ring-orange-200"],
  NEGATIVE_DISCRIMINATION: ["Strong students miss it", "bg-red-50 text-red-800 ring-red-200"],
  TOO_EASY: ["Too easy", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
  SLOW: ["Very slow", "bg-sky-50 text-sky-900 ring-sky-200"],
};
const LEVEL: Record<string, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };
const TABS = [["quality", "Quality"], ["alerts", "Alerts"], ["changes", "Level changes"], ["nolevel", "No level"], ["hidden", "Hidden automatically"], ["under25", "Under 25"]] as const;
type Tab = (typeof TABS)[number][0] | "question";

/** 🔬 Data-driven content decisions: questions whose real answers do not fit their level, alerts and the level-change log. */
export default async function ItemQualityPage({ searchParams }: { searchParams: Promise<{ tab?: string; grade?: string; q?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const tab: Tab = sp.q ? "question" : (TABS.find(([k]) => k === sp.tab)?.[0] ?? "quality");
  const grade = Number(sp.grade) >= 1 && Number(sp.grade) <= 12 ? Number(sp.grade) : undefined;
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  // only admins may bulk-delete; matches deleteQuestionsAction's own RBAC check
  const canDelete = isAdmin;
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  const gradeChips = (base: string) => <div className="mb-4 flex flex-wrap gap-2">{[undefined, 4, 5, 6].map((g) => <Link key={g ?? 0} href={`${base}${g ? `&grade=${g}` : ""}`} className={chip(grade === g)}>{g ? `Grade ${g}` : "All grades"}</Link>)}</div>;

  let body: React.ReactNode = null;
  let subtitle = "From the students' own answers.";
  if (tab === "quality") {
    const { rows, checked } = await itemQuality(repo, actor);
    subtitle = `From the students' own answers: every published question with ${MIN_ANSWERS}+ answers is checked against its level. ${checked} checked · ${rows.length} need attention.`;
    body = <>
      <ul className="mb-5 grid gap-2 text-sm sm:grid-cols-2">{(Object.keys(FLAG) as ItemFlag[]).map((f) => <li key={f} className={`rounded-xl px-3 py-2 ring-1 ${FLAG[f][1]}`}><b>{FLAG[f][0]}</b> · {FLAG[f][2]}</li>)}</ul>
      {rows.length === 0 ? <p className="rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">{checked ? "Every checked question fits its level." : `No question has ${MIN_ANSWERS} answers yet: this report fills in as students practise.`}</p> : (
        <FlaggedTable rows={rows} canDelete={canDelete} flagLabels={FLAG} />
      )}
    </>;
  } else if (tab === "alerts") {
    const rows = await alertList(repo, actor, { grade });
    subtitle = "Possible problems found in students' first answers (30+ per grade). “Key may be wrong” and “Strong students miss it” questions are held out of adaptive practice until you review them.";
    body = <>
      {gradeChips("/admin/item-quality?tab=alerts")}
      {!rows.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No open alerts.</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${ALERT[r.kind]?.[1] ?? "bg-slate-50 ring-slate-200"}`}>{ALERT[r.kind]?.[0] ?? r.kind}</span>
                  <span>Grade {r.grade} students{r.grade !== r.ownGrade ? ` (question is Grade ${r.ownGrade})` : ""} · {r.skill}</span>
                  {r.heldBack && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">⏸ held out of practice</span>}
                </p>
                <p className="mt-1 font-semibold text-brand-navy"><RichInline text={r.stem} /></p>
                <p className="mt-1 text-sm text-slate-700">{r.detail}</p>
                <p className="mt-1 text-xs tabular-nums text-slate-500">{r.responses ?? "—"} first answers · {r.pct ?? "—"}% right{r.discrimination !== null ? ` · discrimination ${r.discrimination.toFixed(2)}` : ""}{r.medianMs !== null ? ` · median ${Math.round(r.medianMs / 1000)} s` : ""} · since {r.createdAt.slice(0, 10)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/questions/${r.questionId}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="pen" className="me-1 inline-block h-4 w-4 align-[-3px]" />Open in editor</Link>
                <Link href={`/admin/item-quality?q=${r.questionId}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="chart" className="me-1 inline-block h-4 w-4 align-[-3px]" />Per grade</Link>
                {isAdmin && <>
                  <form action={resolveAlertAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="RESOLVED" /><input type="hidden" name="grade" value={grade ?? ""} /><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">✓ Resolve</button></form>
                  <form action={resolveAlertAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="DISMISSED" /><input type="hidden" name="grade" value={grade ?? ""} /><button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300">Dismiss</button></form>
                  {r.heldBack && <form action={releaseHoldAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="grade" value={grade ?? ""} /><button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300">▶ Release hold</button></form>}
                </>}
              </div>
            </div>
          </li>
        ))}</ul>
      )}
    </>;
  } else if (tab === "hidden" && isAdmin) {
    // 🧹 definite errors (no correct answer, two correct answers, empty or identical choices…) are hidden from students
    const rows = await listAutoHidden(repo, actor);
    subtitle = "Questions with a definite error are hidden from students automatically. Fix each one, then approve it to bring it back.";
    body = <>
      <form action={autoCheckAction} className="mb-4"><button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white"><LineIcon name="broom" className="me-1 inline-block h-4 w-4 align-[-3px]" />Check all published questions now</button></form>
      {rows.length === 0 ? <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-200"><LineIcon name="check" className="me-1 inline-block h-4 w-4 align-[-3px]" />No question is hidden.</p> : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">Question</th><th className="p-3">Problem</th><th className="p-3">Hidden on</th><th className="p-3"></th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className="border-b last:border-0"><td className="p-3" data-content lang="en"><RichInline text={r.stem} /></td><td className="p-3 font-semibold text-red-800">{r.problem}</td><td className="p-3">{r.at.slice(0, 10)}</td><td className="p-3 text-end"><Link href={`/admin/questions/${r.id}`} className="font-semibold text-brand-teal underline">Fix</Link></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>;
  } else if (tab === "under25" && isAdmin) {
    const rows = await skillsUnderMinimum(repo, actor);
    subtitle = `Every skill should have at least ${MIN_PER_SKILL} questions (Approaching / Meeting / Exceeding). These skills have fewer.`;
    body = rows.length === 0 ? <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-200"><LineIcon name="check" className="me-1 inline-block h-4 w-4 align-[-3px]" />Every skill has at least {MIN_PER_SKILL} questions.</p> : (
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Skill</th><th className="p-3">Questions</th><th className="p-3">Missing</th><th className="p-3"></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-b last:border-0"><td className="p-3">{r.name}</td><td className="p-3 tabular-nums">{r.questions}</td><td className="p-3 tabular-nums font-semibold text-red-800">{r.missing}</td><td className="p-3 text-end"><Link href={`/admin/questions?q=${encodeURIComponent(r.name)}`} className="font-semibold text-brand-teal underline">Open</Link></td></tr>)}</tbody>
        </table>
      </div>
    );
  } else if (tab === "nolevel") {
    // 🏦 bank questions are classified by skill + level only: a question without a level (Below / On / Above) is
    // listed here so it can be given one (open it and set its level)
    const rows = await questionsWithoutLevel(repo, actor);
    subtitle = "Bank questions without a level (Approaching / Meeting / Exceeding). Open each one and set its level.";
    body = rows.length === 0 ? <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-200"><LineIcon name="check" className="me-1 inline-block h-4 w-4 align-[-3px]" />Every bank question has a level.</p> : (
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Question</th><th className="p-3">Skill</th><th className="p-3"></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-b last:border-0"><td className="p-3"><RichInline text={r.stem} /></td><td className="p-3">{r.skill}</td><td className="p-3 text-end"><Link href={`/admin/questions/${r.id}`} className="font-semibold text-brand-teal underline">Set level</Link></td></tr>)}</tbody>
        </table>
      </div>
    );
  } else if (tab === "changes") {
    const rows = await levelChangeList(repo, actor, { grade });
    subtitle = "Every level change made from students' first answers (automatic), or approved by an admin when the level had been set by a person.";
    body = <>
      {gradeChips("/admin/item-quality?tab=changes")}
      {!rows.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No level changes yet: they appear once questions have 30+ first answers.</p> : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">Date</th><th className="p-3">Question</th><th className="p-3">Grade</th><th className="p-3">Level</th><th className="p-3">How</th><th className="p-3">Why</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap p-3 tabular-nums">{r.createdAt.slice(0, 10)}</td>
                <td className="max-w-xs p-3"><Link href={`/admin/item-quality?q=${r.questionId}`} className="text-brand-navy hover:underline"><RichInline text={r.stem} /></Link></td>
                <td className="p-3">{r.grade}</td>
                <td className="whitespace-nowrap p-3">{LEVEL[r.fromLevel] ?? r.fromLevel} → <b>{LEVEL[r.toLevel] ?? r.toLevel}</b> <span className="text-xs text-slate-500">({r.fromDifficulty} → {r.toDifficulty})</span></td>
                <td className="p-3">{r.source === "APPROVED" ? "Approved" : "Automatic"}</td>
                <td className="p-3 text-slate-700">{r.reason}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>;
  } else {
    const v = await questionData(repo, actor, String(sp.q));
    subtitle = `Grade ${v.ownGrade} question · ${v.skill} · difficulty ${v.difficulty}${v.source ? ` (${v.source.toLowerCase()})` : ""}. Only the question's own grade decides its level; other grades are shown for information.`;
    body = <>
      <p className="mb-4 rounded-2xl bg-white p-4 font-semibold text-brand-navy ring-1 ring-slate-200"><RichInline text={v.stem} /> <Link href={`/admin/questions/${v.questionId}`} className="ms-2 text-sm font-normal underline"><LineIcon name="pen" className="me-1 inline-block h-4 w-4 align-[-3px]" />Open in editor</Link></p>
      {!v.grades.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No first answers counted yet.</p> : (
        <div className="mb-5 overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">Students</th><th className="p-3">First answers</th><th className="p-3">Right</th><th className="p-3">On-level students</th><th className="p-3">Discrimination</th><th className="p-3">Median time</th><th className="p-3">Wrong options chosen</th></tr></thead>
            <tbody>{v.grades.map((g) => (
              <tr key={g.grade} className={`border-b last:border-0 ${g.own ? "bg-teal-50/50" : ""}`}>
                <td className="p-3">Grade {g.grade}{g.own && <LineIcon name="star" className="ms-1 inline-block h-4 w-4 fill-amber-400 align-[-3px] text-amber-500" />}</td>
                <td className="p-3 tabular-nums">{g.responses}</td><td className="p-3 tabular-nums">{g.pct}%</td>
                <td className="p-3 tabular-nums">{g.pctOnLevel !== null ? `${g.pctOnLevel}% of ${g.responsesOnLevel}` : "—"}</td>
                <td className="p-3 tabular-nums">{g.discrimination !== null ? g.discrimination.toFixed(2) : "—"}</td>
                <td className="p-3 tabular-nums">{g.medianMs !== null ? `${Math.round(g.medianMs / 1000)} s` : "—"}</td>
                <td className="p-3 text-xs">{g.optionShares ? Object.entries(g.optionShares).map(([k, x]) => `${k} ${Math.round(x * 100)}%`).join(" · ") : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {v.alerts.length > 0 && <ul className="mb-5 space-y-2 text-sm">{v.alerts.map((a) => <li key={a.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><b>{ALERT[a.kind]?.[0] ?? a.kind}</b> · Grade {a.grade} · {a.status.toLowerCase()}{a.heldBack ? " · ⏸ held" : ""} — {a.detail}</li>)}</ul>}
      {v.changes.length > 0 && <ul className="space-y-2 text-sm">{v.changes.map((c) => <li key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><span className="tabular-nums text-slate-500">{c.createdAt.slice(0, 10)}</span> · {c.source === "APPROVED" ? "Approved" : "Automatic"} · {c.reason}</li>)}</ul>}
    </>;
  }

  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: tab === "question" ? "/admin/item-quality?tab=alerts" : "/admin/questions", label: tab === "question" ? "Question Quality" : "Question Bank" }} icon="search" title="Question Quality" subtitle={subtitle}>
        <Link href="/admin/bank-gaps" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="grid" className="me-1 inline-block h-4 w-4 align-[-3px]" />Bank gaps</Link>
      </PageHeader>
      {actor.role !== "TEACHER" && <BankTabs />}
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {tab !== "question" && <div className="mb-4 flex flex-wrap gap-2">{TABS.filter(([k]) => isAdmin || (k !== "hidden" && k !== "under25")).map(([k, l]) => <Link key={k} href={`/admin/item-quality?tab=${k}`} className={chip(tab === k)}>{l}</Link>)}</div>}
      {body}
    </AppShell>
  );
}
