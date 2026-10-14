import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsBankPage, nafsQuestionView, type BankSource } from "@/server/nafs/bank";
import { codeName, CONTENT_SKILLS, DIFFICULTIES, DIFFICULTY_NAME, MOE_STANDARDS, NAFS_DOMAINS, NAFS_SKILLS, PROCESSES, SKILL_BY_CODE } from "@/server/nafs/framework";
import { paragraphsOf } from "@/server/nafs/student";
import { setChoices } from "@/server/nafs/build";
import { Combo } from "@/components/ui/combo";
import { hideQuestionAction, retagAction, reviewDraftAction } from "@/app/teacher/nafs/actions";

const SOURCES: { key: BankSource; label: string }[] = [{ key: "ALL", label: "All" }, { key: "PLATFORM", label: "Platform" }, { key: "OWN", label: "The school's" }, { key: "DRAFT", label: "AI drafts to review" }, { key: "HIDDEN", label: "Hidden" }];
const SEL = "min-h-10 rounded-lg bg-surface px-2 text-sm ring-1 ring-line";

/**
 * 🇸🇦 Question bank: ONLY questions of the NAFS skills (platform questions via the links + the school's own). Filter by
 * domain / skill / source / passage, search; open a question in full (with its passage); add, edit (a platform question
 * → a school copy), hide (never delete), change its NAFS skill / process, review AI drafts.
 */
export async function BankTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const src = (SOURCES.find((x) => x.key === sp.src)?.key ?? "ALL") as BankSource;
  const [page, sets] = await Promise.all([
    nafsBankPage(repo, actor, { domain: sp.domain || null, code: sp.code || null, source: src, passage: sp.passage === "WITH" || sp.passage === "WITHOUT" ? sp.passage : null, q: sp.q || null, page: Number(sp.page) || 1, standard: sp.std || null, kind: sp.kind === "MCQ" || sp.kind === "WRITTEN" ? sp.kind : null, difficulty: sp.dif || null, set: sp.set || null }),
    setChoices(repo, actor, "ALL"),
  ]);
  const keep = (extra: Record<string, string | number>) => `/teacher/nafs?${new URLSearchParams({ tab: "bank", ...Object.fromEntries(Object.entries({ domain: sp.domain, code: sp.code, src: sp.src, passage: sp.passage, q: sp.q, page: sp.page, std: sp.std, kind: sp.kind, dif: sp.dif, set: sp.set }).filter(([, v]) => v)) as Record<string, string>, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) })}`;
  const stdOptions = MOE_STANDARDS.map((x) => ({ value: x.code, label: codeName(x.code, t) }));
  const skillOptions = (list: typeof NAFS_SKILLS) => list.map((k) => ({ value: k.code, label: codeName(k.code, t), group: t(NAFS_DOMAINS.find((d) => d.code === k.domain)?.name ?? "") }));
  const here = keep({});
  const view = sp.view ? await nafsQuestionView(repo, actor, sp.view).catch(() => null) : null;
  return (
    <div className="grid gap-4">
      <form method="get" action="/teacher/nafs" className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
        <input type="hidden" name="tab" value="bank" />
        <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Domain")}<select name="domain" defaultValue={sp.domain ?? ""} className={SEL}><option value="">{t("All")}</option>{NAFS_DOMAINS.filter((d) => d.code !== "PIRLS").map((d) => <option key={d.code} value={d.code}>{t(d.name)}</option>)}</select></label>
        <div className="grid min-w-52 gap-1 text-xs font-semibold text-ink-2"><span>{t("Skill")}</span><Combo name="code" label={t("Skill")} defaultValue={sp.code ?? ""} options={[{ value: "", label: t("All") }, ...skillOptions(NAFS_SKILLS)]} /></div>
        <div className="grid min-w-64 gap-1 text-xs font-semibold text-ink-2"><span>{t("Ministry standard")}</span><Combo name="std" label={t("Ministry standard")} defaultValue={sp.std ?? ""} options={[{ value: "", label: t("All") }, ...stdOptions, { value: "NONE", label: t("Not set yet") }]} /></div>
        <div className="grid min-w-64 gap-1 text-xs font-semibold text-ink-2"><span>{t("Model booklet or practice set")}</span><Combo name="set" label={t("Model booklet or practice set")} defaultValue={sp.set ?? ""} options={[{ value: "", label: t("Every source") }, ...sets.map((b) => ({ value: b.code, label: `${b.code} · ${b.title}`, hint: t("{n} questions", { n: b.questions }), group: t(b.code.startsWith("NP-") ? "NAFS practice sets" : "NAFS model booklets"), keywords: `${b.genre} ${b.kind === "LIT" ? "literary story" : b.kind === "INFO" ? "informational article" : ""}` }))]} /></div>
        <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Difficulty")}<select name="dif" defaultValue={sp.dif ?? ""} className={SEL}><option value="">{t("All")}</option>{DIFFICULTIES.map((k) => <option key={k} value={k}>{t(DIFFICULTY_NAME[k])}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Type")}<select name="kind" defaultValue={sp.kind ?? ""} className={SEL}><option value="">{t("All")}</option><option value="MCQ">{t("Multiple choice A–D")}</option><option value="WRITTEN">{t("Short written answer")}</option></select></label>
        <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Source")}<select name="src" defaultValue={src} className={SEL}>{SOURCES.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Passage")}<select name="passage" defaultValue={sp.passage ?? ""} className={SEL}><option value="">{t("All")}</option><option value="WITH">{t("With a passage")}</option><option value="WITHOUT">{t("Without a passage")}</option></select></label>
        <label className="grid min-w-48 flex-1 gap-1 text-xs font-semibold text-ink-2">{t("Search")}<input name="q" defaultValue={sp.q ?? ""} className={SEL} placeholder={t("Words in the question")} /></label>
        <button className="min-h-10 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white">{t("Show")}</button>
        <Link href="/teacher/nafs/question" className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">+ {t("Add a question")}</Link>
        <Link href="/teacher/nafs?tab=skills" className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-teal-ink ring-1 ring-line">{t("The 13 standards and the NAFS skills")}</Link>
      </form>
      {/* the questions ticked below go to "Give adaptive practice" (the practice adapts inside them) */}
      <form id="pickform" method="get" action="/teacher/nafs" className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <input type="hidden" name="tab" value="practice" />
        <span className="text-muted">{t("Tick questions, then")}</span>
        <button className="min-h-10 rounded-lg bg-surface px-3 font-semibold text-teal-ink ring-1 ring-teal-300">🎯 {t("Practise the ticked questions")}</button>
      </form>
      {view && (
        <section className="rounded-2xl bg-surface p-5 shadow-card ring-2 ring-teal-300" aria-label={t("Question")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-teal-ink">{view.entry.standard ? `${codeName(view.entry.standard, t)} · ` : ""}{t(DIFFICULTY_NAME[view.entry.difficulty])} · {t(SKILL_BY_CODE.get(view.entry.nafsCode)?.name ?? "")} · {codeName(view.entry.process, t)} · {t(view.entry.booklet ? "NAFS model booklet" : view.entry.own ? "The school's" : "Platform")}{view.entry.booklet ? ` ${view.entry.booklet} #${view.entry.bookletN}` : ""}</p>
            <Link href={here} className="text-sm font-semibold text-muted">✕ {t("Close")}</Link>
          </div>
          {view.q.passage && (
            <div className="mt-3 max-h-96 overflow-y-auto rounded-xl bg-surface-2 p-4 ring-1 ring-line" lang="en" dir="ltr">
              {view.q.passage.title && <h3 className="font-semibold text-ink">{view.q.passage.title}</h3>}
              {paragraphsOf(view.q.passage.text).map((p, i) => <p key={i} className="mt-2 text-sm leading-relaxed text-ink-2"><span className="me-2 text-xs font-bold text-muted">{i + 1}</span>{p}</p>)}
            </div>
          )}
          <p className="mt-3 font-semibold text-ink" lang="en" dir="ltr">{view.q.stem}</p>
          {view.q.kind === "WRITTEN" ? (
            <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm ring-1 ring-line">
              <p className="text-xs font-semibold text-muted">{t("Short written answer · scored by the teacher (0 / 1 / 2)")}</p>
              <p className="mt-1 text-ink" lang="en" dir="ltr"><b>{t("Model answer")}:</b> {view.q.model}</p>
              <ul className="mt-1 text-ink-2" lang="en" dir="ltr">{view.q.rubric.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : (
            <ol className="mt-2 grid gap-1.5 sm:grid-cols-2" lang="en" dir="ltr">
              {view.q.options.map((o, i) => <li key={i} className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${i === view.q.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-200" : "bg-surface-2 text-ink-2 ring-line"}`}><b>{"ABCD"[i]}.</b> {o}</li>)}
            </ol>
          )}
          {view.q.explanation && <p className="mt-2 text-sm text-ink-2" lang="en" dir="ltr">💡 {view.q.explanation}</p>}
          <form action={retagAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={view.q.id} /><input type="hidden" name="back" value={keep({ view: view.q.id })} />
            <div className="grid min-w-64 flex-1 gap-1 text-xs font-semibold text-ink-2"><span>{t("Ministry standard")}</span><Combo name="standard" label={t("Ministry standard")} defaultValue={view.entry.standard ?? ""} options={[{ value: "", label: t("Not set yet") }, ...stdOptions]} /></div>
            <div className="grid min-w-52 gap-1 text-xs font-semibold text-ink-2"><span>{t("NAFS skill")}</span><Combo name="code" required label={t("NAFS skill")} defaultValue={view.entry.nafsCode} options={skillOptions(CONTENT_SKILLS)} /></div>
            <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Reading process")}<select name="process" defaultValue={view.entry.process} className={SEL}>{PROCESSES.map((p) => <option key={p} value={p}>{codeName(p, t)}</option>)}</select></label>
            <button className="min-h-10 rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line">{t("Save the tags")}</button>
          </form>
        </section>
      )}
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <p className="text-sm text-muted">{t("{n} questions", { n: page.total })}{src === "DRAFT" ? ` · ${t("Review each draft: edit it if needed, then approve or reject it.")}` : ""}</p>
        {!page.rows.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t("No questions here yet.")}</p> : (
          <ul className="mt-2 divide-y divide-line">
            {page.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                {r.kind === "MCQ" && !r.draft && !r.hidden && <input type="checkbox" name="pick" value={r.id} form="pickform" className="h-5 w-5 shrink-0" aria-label={t("Tick for adaptive practice")} />}
                <div className="min-w-0 flex-1">
                  <p className="text-ink" lang="en" dir="ltr">{r.stem}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                    <span className={`max-w-full truncate rounded-full px-2 py-0.5 font-semibold ring-1 ${r.standard ? "bg-indigo-50 text-indigo-900 ring-indigo-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`} title={r.standard ? codeName(r.standard, t) : undefined}>{r.standard ? codeName(r.standard, t) : t("No standard")}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${r.difficulty === 1 ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : r.difficulty === 3 ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-sky-50 text-sky-900 ring-sky-200"}`}>{t(DIFFICULTY_NAME[r.difficulty])}</span>
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-900 ring-1 ring-teal-200">{t(r.skill)}</span>
                    {r.kind === "WRITTEN" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 ring-1 ring-line">✍ {t("Short written answer")}</span>}
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 ring-1 ring-line" title={codeName(r.process, t)}>{codeName(r.process, t)}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 ring-1 ring-line">{r.booklet ? `${t("NAFS model booklet")} ${r.booklet}` : r.practiceSet ? `${t("NAFS practice set")} ${r.practiceSet}` : t(r.draft ? "AI draft" : r.copy ? "School copy" : r.own ? "The school's" : "Platform")}</span>
                    {r.hasPassage && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 ring-1 ring-line">📄 {r.passageTitle ?? t("Passage")}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={keep({ view: r.id })} className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line">{t("View")}</Link>
                  <Link href={`/teacher/nafs/question?id=${encodeURIComponent(r.id)}`} className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line" title={r.own ? undefined : t("Editing a platform question makes a school copy; the original never changes.")}>{t(r.own ? "Edit" : "Edit a copy")}</Link>
                  {r.draft && !r.hidden && <>
                    <form action={reviewDraftAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="1" /><input type="hidden" name="back" value={here} /><button className="min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white">{t("Approve")}</button></form>
                    <form action={reviewDraftAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="0" /><input type="hidden" name="back" value={here} /><button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{t("Reject")}</button></form>
                  </>}
                  {!r.draft && <form action={hideQuestionAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="hidden" value={r.hidden ? "0" : "1"} /><input type="hidden" name="back" value={here} /><button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-ink-2 ring-1 ring-line">{t(r.hidden ? "Show" : "Hide")}</button></form>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {page.pages > 1 && (
          <nav className="mt-3 flex items-center justify-between text-sm" aria-label={t("Pages")}>
            {page.page > 1 ? <Link href={keep({ page: page.page - 1 })} className="font-semibold text-teal-ink">‹ {t("Previous")}</Link> : <span />}
            <span className="text-muted">{t("Page {n} of {total}", { n: page.page, total: page.pages })}</span>
            {page.page < page.pages ? <Link href={keep({ page: page.page + 1 })} className="font-semibold text-teal-ink">{t("Next")} ›</Link> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}
