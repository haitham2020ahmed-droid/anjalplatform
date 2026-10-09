import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AiRunner } from "@/components/ai/ai-runner";
import { ReviewTable } from "@/components/ai/review-table";
import { AiGuide } from "@/components/ai/guide";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { aiEnv } from "@/server/ai/env";
import { aiSettings, pickProvider, rateState } from "@/server/ai/engine";
import { aiLogSummary, aiSince, listJobs, runWeekly, suggestions, TOOL_NAME, weeklyState } from "@/server/ai/jobs";
import { gapReport, suspiciousQuestions } from "@/server/ai/tools";
import { wizardList } from "@/server/ai/wizard";
import { masterSkills } from "@/server/skills/master";
import { settingsAction, startToolAction, stopJobAction, tickAction, weeklyAction } from "./actions";

export const metadata = { title: "AI tools" };
const TABS = [["wizard", "🪄 Prepare a Skill"], ["tools", "🧰 Tools"], ["review", "✅ Review"], ["suspicious", "🔍 Suspicious questions"], ["log", "📜 Log"], ["settings", "⚙️ Settings"], ["guide", "📘 Guide"]] as const;
const ST: Record<string, string> = { NOT_STARTED: "bg-slate-100 text-slate-600", IN_PROGRESS: "bg-sky-100 text-sky-900", READY: "bg-emerald-100 text-emerald-800" };

/** 🤖 AI tools for the question bank: a guided wizard, the tools, review, suspicious questions, log, settings, guide. */
export default async function AiToolsPage({ searchParams }: { searchParams: Promise<{ tab?: string; grade?: string; skillId?: string; section?: string; tool?: string; job?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "wizard";
  await aiSince(repo, actor.schoolId!);
  const settings = await aiSettings(repo, actor.schoolId);
  const picked = pickProvider(aiEnv(), settings);
  const rate = await rateState(repo, actor.schoolId!, settings);
  // 🗓️ weekly routine: due → queue the check of new questions (it runs while this page is open)
  let weekly = await weeklyState(repo, actor.schoolId!);
  if (picked.ok && weekly.due && weekly.newQuestions > 0) { await runWeekly(repo, actor); weekly = await weeklyState(repo, actor.schoolId!); }
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).map((g) => Number(g.level)).filter((g) => g >= 4 && g <= 6).sort();
  const grade = grades.includes(Number(sp.grade)) ? Number(sp.grade) : grades[0] ?? 4;
  const jobs = await listJobs(repo, actor, 15);
  const active = jobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");
  const wizardRows = tab === "wizard" ? await wizardList(repo, actor, grade) : [];
  const toolSkills = tab === "tools" ? await masterSkills(repo, actor.schoolId!, { grade, withQuestionsOnly: true }) : [];
  const gaps = tab === "tools" && sp.tool === "GAP" ? await gapReport(repo, actor.schoolId!, grade, sp.skillId || undefined) : null;
  const reviewRows = tab === "review" ? await suggestions(repo, actor, { tool: sp.tool || undefined, jobId: sp.job || undefined, skillId: sp.skillId || undefined }) : [];
  const suspicious = tab === "suspicious" ? await suspiciousQuestions(repo, actor.schoolId!, { grade }) : [];
  const logSummary = tab === "log" ? await aiLogSummary(repo, actor, 7) : null;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const link = (p: Record<string, string | number>) => `/admin/ai-tools?${new URLSearchParams(Object.entries({ tab, grade, ...p }).map(([k, v]) => [k, String(v)]))}`;
  const field = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Administration" }} icon="🤖" title="AI tools"
        subtitle="Clean and complete the question bank with the help of AI — one skill at a time. The AI reads questions and passages only, never student data. Nothing changes until you approve it." />
      <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${picked.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
        {picked.ok ? <span>✅ Connected: <b>{picked.name === "gemini" ? "Google Gemini" : "Claude"}</b> · model <code>{picked.model}</code></span> : <span>⚠️ {picked.reason}</span>}
        <span className="text-slate-600">· Requests: {rate.usedMinute}/{settings.perMinute} this minute · {rate.usedToday}/{settings.perDay} today</span>
        <span className="text-slate-600">· New questions to check: {weekly.newQuestions}{weekly.lastRun ? ` · last weekly run ${weekly.lastRun.slice(0, 10)}` : ""}</span>
      </div>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="AI tools" className="mb-4 flex flex-wrap gap-2">{TABS.map(([k, l]) => <Link key={k} href={`/admin/ai-tools?tab=${k}&grade=${grade}`} className={chip(k === tab)}>{l}</Link>)}</nav>
      {active && picked.ok && tab !== "settings" && tab !== "guide" && <div className="mb-4"><AiRunner jobId={sp.job ?? null} tick={tickAction} label={`Running: ${active.toolName}`} /></div>}
      {(tab === "wizard" || tab === "tools" || tab === "suspicious") && <nav aria-label="Grade" className="mb-4 flex gap-2">{grades.map((g) => <Link key={g} href={link({ grade: g })} className={chip(g === grade)}>Grade {g}</Link>)}</nav>}

      {tab === "wizard" && (() => {
        const list = wizardRows;
        return (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-brand-navy">Skills of Grade {grade}, most urgent first</h2>
            <p className="text-sm text-slate-600">Open a skill and follow the 6 steps: Gap Report → Quality Check → Duplicates → Auto-Tag → Reading Level → Gap Report.</p>
            <ul className="mt-3 divide-y divide-slate-100">{list.map((x) => (
              <li key={x.skill.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/admin/ai-tools/wizard/${x.skill.id}`} className="font-semibold text-brand-navy hover:underline">{x.skill.name}</Link> <span className="text-xs text-slate-500">{x.skill.questions} questions · {x.why}</span></span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ST[x.status]}`}>{x.status === "NOT_STARTED" ? "Not started" : x.status === "IN_PROGRESS" ? "In progress" : "✅ Ready"}</span>
              </li>
            ))}</ul>
          </section>
        );
      })()}

      {tab === "tools" && (() => {
        const skills = toolSkills;
        const tools: [string, string, string][] = [
          ["GAP", "📊 Gap Report", "How many questions each skill has at each level, against the targets (60 per skill = 20 per level · 30 per Grammar skill · 25 per Concept Vocabulary selection). No AI."],
          ["QUALITY", "🩺 Quality Check", "Finds wrong answer keys and several correct answers (shown first), weak options, spelling mistakes and unclear questions."],
          ["DUPLICATE", "👯 Duplicate Finder", "Finds identical or very similar questions, also across sections. No AI."],
          ["TAG", "🏷️ Auto-Tag", "Suggests skill, CCSS standard, MAP goal area, level (Below / On / Above) and difficulty, from the allowed lists only."],
          ["READING", "📖 Reading Level Estimate", "For passages: a free formula plus the AI. Shown as “Estimated reading level” — it is not a Lexile."],
        ];
        return (
          <>
            <div className="grid gap-4 md:grid-cols-2">{tools.map(([k, title, what]) => (
              <form key={k} action={k === "GAP" ? `/admin/ai-tools` : startToolAction} method={k === "GAP" ? "get" : undefined} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                {k === "GAP" ? <><input type="hidden" name="tab" value="tools" /><input type="hidden" name="tool" value="GAP" /></> : <input type="hidden" name="tool" value={k} />}
                <h3 className="text-lg font-bold text-brand-navy">{title}</h3><p className="text-sm text-slate-600">{what}</p>
                <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
                  <label className="flex flex-col">Grade<select name="grade" defaultValue={grade} className={field}>{grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
                  <label className="flex min-w-[12rem] flex-1 flex-col">Skill<select name="skillId" defaultValue={sp.skillId ?? ""} className={field}><option value="">All skills</option>{skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                  {k !== "GAP" && k !== "READING" && <label className="flex flex-col">Section<select name="section" className={field}><option value="">All</option><option value="CONCEPT_VOCABULARY">Concept Vocabulary</option><option value="ANALYZE_CRAFT_AND_STRUCTURE">Analyze Craft &amp; Structure</option><option value="RESPOND_TO_READING">Respond to Reading</option></select></label>}
                  <button disabled={k !== "GAP" && k !== "DUPLICATE" && !picked.ok} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">▶ Start</button>
                </div>
              </form>
            ))}
              <div className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-amber-50 to-white p-5 ring-1 ring-amber-200">
                <h3 className="text-lg font-bold text-brand-navy">🆕 New questions</h3><p className="text-sm text-slate-600">Every week the new questions get a Quality Check and Auto-Tag by themselves. {weekly.newQuestions} new question(s) now.</p>
                <form action={weeklyAction}><button disabled={!picked.ok} className="mt-3 rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600 disabled:opacity-50">▶ Run now</button></form>
              </div>
            </div>
            {gaps && (
              <section className="mt-5 overflow-x-auto rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h3 className="text-lg font-bold text-brand-navy">📊 Gap Report · Grade {grade}</h3>
                <table className="mt-2 min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3">Skill / selection</th><th className="px-2">Below</th><th className="px-2">On</th><th className="px-2">Above</th><th className="px-2">Total / target</th><th className="px-2">Missing</th></tr></thead>
                  <tbody>{gaps.map((g) => <tr key={g.kind + g.id} className="border-b last:border-0"><td className="py-1.5 pe-3">{g.name}</td>{g.perLevel ? (["BELOW", "ON", "ABOVE"] as const).map((l) => <td key={l} className={`px-2 tabular-nums ${g.counts[l] < g.perLevel! ? "text-red-700" : "text-emerald-700"}`}>{g.counts[l]}/{g.perLevel}</td>) : <td colSpan={3} className="px-2 text-slate-500">no levels</td>}<td className="px-2 tabular-nums">{g.total}/{g.target}</td><td className={`px-2 font-bold tabular-nums ${g.missingTotal ? "text-red-700" : "text-emerald-700"}`}>{g.missingTotal || "✓"}</td></tr>)}</tbody></table>
              </section>
            )}
            <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-bold text-brand-navy">Recent runs</h3>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">{jobs.map((j) => <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{j.toolName} · {j.scope.new ? "new questions" : `Grade ${j.scope.grade ?? "all"}`}{j.scope.skillId ? " · 1 skill" : ""} · {j.createdAt.slice(0, 16).replace("T", " ")}</span><span className="flex items-center gap-2"><span className="tabular-nums">{j.done}/{j.total}{j.failed ? ` · ${j.failed} failed` : ""}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{j.status}</span>{(j.status === "RUNNING" || j.status === "QUEUED") && <form action={stopJobAction}><input type="hidden" name="jobId" value={j.id} /><button className="text-xs font-semibold text-red-700 underline">Stop</button></form>}<Link href={`/admin/ai-tools?tab=review&job=${j.id}`} className="text-xs font-semibold text-brand-teal underline">Results</Link></span></li>)}</ul>
            </section>
          </>
        );
      })()}

      {tab === "review" && (() => {
        const rows = reviewRows;
        return (
          <>
            <div className="mb-3 flex flex-wrap gap-2">{[["", "All"], ["QUALITY", "Quality"], ["DUPLICATE", "Duplicates"], ["TAG", "Tags"], ["READING", "Reading level"]].map(([k, l]) => <Link key={k} href={`/admin/ai-tools?tab=review${k ? `&tool=${k}` : ""}`} className={chip((sp.tool ?? "") === k)}>{l}</Link>)}</div>
            <ReviewTable rows={rows} back={`/admin/ai-tools?tab=review${sp.tool ? `&tool=${sp.tool}` : ""}`} />
          </>
        );
      })()}

      {tab === "suspicious" && (() => {
        const rows = suspicious;
        return (
          <section className="overflow-x-auto rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">From real student answers (no AI), questions with 10+ careful answers. Usually the answer key or the wording needs checking.</p>
            {rows.length === 0 ? <p className="mt-3 text-slate-600">No suspicious questions. ✅</p> : (
              <table className="mt-3 min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3">Question</th><th className="px-2">Answers</th><th className="px-2">Correct</th><th className="px-2">Strong students correct</th><th className="px-2">Key · most chosen wrong</th><th className="px-2">Why</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.id} className="border-b align-top last:border-0"><td className="max-w-md py-2 pe-3"><Link href={`/admin/questions/${r.id}`} className="font-medium text-brand-navy hover:underline">{r.stem}</Link></td><td className="px-2 tabular-nums">{r.answers}</td><td className="px-2 tabular-nums">{r.correctPct}%</td><td className="px-2 tabular-nums">{r.strongCorrectPct === null ? "—" : `${r.strongCorrectPct}% (${r.strongAnswers})`}</td><td className="px-2">{r.key} ({r.keyCount}){r.topWrong ? ` · ${r.topWrong.label} (${r.topWrong.count})` : ""}</td><td className="px-2 text-red-800">{r.reasons.join(" ")}</td></tr>)}</tbody></table>
            )}
          </section>
        );
      })()}

      {tab === "log" && logSummary && (() => {
        const l = logSummary;
        return (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-brand-navy">AI requests · last 7 days</h2>
            <p className="mt-1 text-sm">{l.requests} requests · {l.ok} OK · {l.invalid} invalid replies (retried) · {l.rate} limit reached · {l.down} provider down · {l.other} other · error rate {l.errorPct ?? 0}%</p>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">{l.recent.map((r, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-1"><span>{r.at.slice(0, 19).replace("T", " ")} · {TOOL_NAME[r.tool as keyof typeof TOOL_NAME] ?? r.tool} · {r.ms} ms</span><span className={r.ok ? "text-emerald-700" : "text-red-700"}>{r.ok ? "OK" : r.error}</span></li>)}</ul>
          </section>
        );
      })()}

      {tab === "settings" && (
        <form action={settingsAction} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">AI settings</h2>
          <p className="text-sm text-slate-600">The API key is kept only in the server settings (Render → Environment: GEMINI_API_KEY or ANTHROPIC_API_KEY), never in the browser. Set the limits to what Google AI Studio shows for your project (aistudio.google.com/rate-limit).</p>
          <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col">Provider<select name="provider" defaultValue={settings.provider} className={field}><option value="auto">Automatic (Gemini if its key is set)</option><option value="gemini">Google Gemini</option><option value="anthropic">Claude</option><option value="off">Off</option></select></label>
            <label className="flex flex-col">Requests per minute<input name="perMinute" type="number" min={1} max={60} defaultValue={settings.perMinute} className={`${field} w-28`} /></label>
            <label className="flex flex-col">Requests per day<input name="perDay" type="number" min={1} max={10000} defaultValue={settings.perDay} className={`${field} w-28`} /></label>
            <label className="flex flex-col">Questions per request<input name="batch" type="number" min={1} max={10} defaultValue={settings.batch} className={`${field} w-28`} /></label>
            <button disabled={!can(actor, "settings:engine")} className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Save</button>
          </div>
        </form>
      )}

      {tab === "guide" && <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><AiGuide /></section>}
    </AppShell>
  );
}
