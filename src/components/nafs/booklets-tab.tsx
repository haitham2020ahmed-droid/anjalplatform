import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsClasses } from "@/server/nafs/tests";
import { bookletList, bookletReportTest, MAX_ASSIGN_BOOKLETS, openBookletView } from "@/server/nafs/booklet-center";
import { centerHref, subOf } from "@/server/nafs/center";
import { codeName, MAX_NAFS_MINUTES } from "@/server/nafs/framework";
import { cleanCuts } from "@/server/nafs/reports";
import { MINISTRY_DEFAULT } from "@/server/nafs/build";
import { assignBookletsAction } from "@/app/teacher/nafs/actions";
import { Combo } from "@/components/ui/combo";
import { PrintButton } from "@/components/plans/print-button";
import { CutFields, Legend, TestReport } from "./reports-tab";
import { SubNav } from "./sub-nav";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:shadow-none";
const INPUT = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";
const LINK = "inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line";
const KIND: Record<string, string> = { LIT: "Literary", INFO: "Informational" };
const many = (v: unknown) => [...new Set((Array.isArray(v) ? v.map(String) : String(v ?? "").split(",")).map((x) => x.trim()).filter(Boolean))];

/**
 * 🇸🇦 NAFS center → 3. MINISTRY BOOKLETS: the model booklets — open one (the passage, every question with its answer),
 * tick ONE or SEVERAL and assign them online (a class or chosen students) or get them ready to print (booklet, key,
 * bubble sheets), and a Report per booklet (how the class did on it: per standard, per question, distractors).
 */
export async function BookletsTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const sub = subOf("booklets", sp.sub);
  return (
    <>
      <SubNav tab="booklets" sub={sub} t={t} keep={{ book: sp.book }} />
      {sub === "report" ? <BookletReport actor={actor} t={t} sp={sp} /> : <BookletList actor={actor} t={t} sp={sp} />}
    </>
  );
}

async function BookletList({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const [list, classes] = await Promise.all([bookletList(repo, actor, { q: sp.q, kind: sp.kind }), nafsClasses(repo, actor)]);
  const open = sp.book ? await openBookletView(repo, actor, sp.book).catch(() => null) : null;
  const ticked = new Set([...many(sp.b as unknown), ...(open ? [open.code] : [])]);
  const ready = many(sp.ready as unknown).slice(0, 10);
  return (
    <div className="grid gap-4">
      {ready.length > 0 && (
        <section className={`${CARD} ring-2 ring-teal-200`} aria-labelledby="rd-h">
          <h2 id="rd-h" className="text-lg font-semibold text-ink">🖨 {t("Ready to print")}</h2>
          <p className="mt-1 text-sm text-ink-2">{t("Each booklet is a NAFS test now: print it, its answer key and the bubble sheets; grade the sheets with the phone camera or type the answers.")}</p>
          <ul className="mt-2 grid gap-2">
            {ready.map((id) => (
              <li key={id} className="flex flex-wrap gap-1.5">
                <Link href={`/teacher/nafs/tests/${id}`} className={LINK}>{t("Open")}</Link>
                <Link href={`/teacher/nafs/tests/${id}/print`} className={LINK}>📘 {t("Print test")}</Link>
                <Link href={`/teacher/nafs/tests/${id}/print?key=1`} className={LINK}>🔑 {t("Answer key")}</Link>
                <Link href={`/teacher/nafs/tests/${id}`} className={LINK}>{t("Print bubble sheets")}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && (
        <section className={`${CARD} ring-2 ring-indigo-200`} aria-labelledby="ob-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ob-h" className="text-lg font-semibold text-ink">📘 <span dir="ltr">{open.code}</span> · {open.title} <span className="text-sm font-normal text-muted">· {open.kind ? t(KIND[open.kind]) : ""}{open.genre ? ` · ${open.genre}` : ""} · {t("{n} questions", { n: open.questions.length })}</span></h2>
            <span className="flex flex-wrap gap-1.5 print:hidden">
              <PrintButton label={t("Print")} />
              <Link href={centerHref("booklets", { sub: "report", book: open.code })} className={LINK}>📊 {t("Report")}</Link>
              <a href="#assign" className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white">{t("Assign")}</a>
              <Link href={centerHref("booklets", { q: sp.q, kind: sp.kind })} className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-muted">✕ {t("Close")}</Link>
            </span>
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-2" lang="en" dir="ltr">
            {open.passage && (
              <article className="rounded-xl bg-surface-2 p-4 ring-1 ring-line lg:sticky lg:top-20 lg:max-h-[80vh] lg:overflow-y-auto">
                <h3 className="mb-2 text-base font-semibold text-ink">{open.passage.title}</h3>
                {open.passage.paragraphs.map((p, i) => <p key={i} className="mb-2 grid grid-cols-[1.75rem_1fr] text-sm text-ink"><span className="text-xs font-bold text-muted">{i + 1}</span><span>{p}</span></p>)}
              </article>
            )}
            <ol className="grid content-start gap-2">
              {open.questions.map((q) => (
                <li key={q.id} className="rounded-xl p-3 ring-1 ring-line">
                  <p className="text-sm font-semibold text-ink"><span className="me-1">{q.n}.</span>{q.stem}</p>
                  {q.kind === "WRITTEN" ? (
                    <div className="mt-1 text-sm text-ink-2"><p><b>{t("Model answer")}:</b> {q.model}</p><ul className="text-xs">{q.rubric.map((r) => <li key={r}>{r}</li>)}</ul></div>
                  ) : (
                    <ul className="mt-1 grid gap-0.5 text-sm">{q.options.map((o, k) => <li key={k} className={k === q.correct ? "font-semibold text-emerald-800" : "text-ink-2"}><b>{"ABCD"[k]}.</b> {o}{k === q.correct ? " ✓" : ""}</li>)}</ul>
                  )}
                  {q.why && <p className="mt-1 text-xs text-muted">{q.why}</p>}
                  <p className="mt-1 text-[11px] text-muted" dir="auto">{q.standard ? codeName(q.standard, t) : "—"} · {codeName(q.skill, t)} · {t(q.difficultyName)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="booklets" />
        <label className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2">{t("Search")}<input name="q" defaultValue={sp.q ?? ""} placeholder={t("Title or code")} className={INPUT} /></label>
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Text type")}
          <select name="kind" defaultValue={sp.kind ?? ""} className={INPUT}><option value="">{t("All")}</option><option value="INFO">{t("Informational")}</option><option value="LIT">{t("Literary")}</option></select>
        </label>
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
      </form>
      {!list.length ? <p className={`${CARD} text-center text-sm text-muted`}>{t("No model booklet here yet. They load in the background the first time NAFS opens: open this page again in a minute.")}</p> : (
        <form action={assignBookletsAction} className="grid gap-4">
          <input type="hidden" name="back" value={centerHref("booklets", { q: sp.q, kind: sp.kind })} />
          <section className={CARD} aria-labelledby="bl-h">
            <h2 id="bl-h" className="text-lg font-semibold text-ink">{t("The model booklets")} <span className="text-sm font-normal text-muted">({list.length})</span></h2>
            <p className="text-sm text-muted">{t("Tick one or several booklets (up to {n}), then assign them below.", { n: MAX_ASSIGN_BOOKLETS })}</p>
            <ul className="mt-2 divide-y divide-line">
              {list.map((b) => (
                <li key={b.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input type="checkbox" name="b" value={b.code} defaultChecked={ticked.has(b.code)} className="h-5 w-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="font-semibold text-ink"><span className="font-mono text-xs text-muted" dir="ltr">{b.code}</span> {b.title}</span>
                      <span className="block text-xs text-muted">{b.kind ? t(KIND[b.kind]) : ""}{b.genre ? ` · ${b.genre}` : ""} · {t("{n} questions", { n: b.questions })}{b.written ? ` · ✍ ${b.written}` : ""}{b.tests.length ? ` · ${t("assigned")}` : ""}{b.results ? ` · ${t("{n} result(s)", { n: b.results })}` : ""}</span>
                    </span>
                  </label>
                  <span className="flex gap-1.5">
                    <Link href={centerHref("booklets", { book: b.code, q: sp.q, kind: sp.kind })} className={LINK}>{t("Open")}</Link>
                    {b.results > 0 && <Link href={centerHref("booklets", { sub: "report", book: b.code })} className={LINK}>📊 {t("Report")}</Link>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section id="assign" className={`${CARD} ring-2 ring-teal-200`} aria-labelledby="as-h">
            <h2 id="as-h" className="text-lg font-semibold text-ink">{t("Assign the ticked booklets")}</h2>
            <p className="mt-1 text-sm text-ink-2">{t("Each booklet is given whole, in its own order (the passage and all its questions). Online: students find it in their NAFS icon; multiple-choice answers are graded automatically, written answers wait in Marking. On paper: print the booklet, the key and bubble sheets.")}</p>
            {!classes.length ? <p className="mt-3 text-sm text-muted">{t("You have no Grade 6 class yet.")}</p> : (
              <div className="mt-3 grid gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid min-w-56 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="classId" label={t("Class")} defaultValue={classes[0].id} options={classes.map((c) => ({ value: c.id, label: c.name, hint: t("{n} students", { n: c.students.length }) }))} /></div>
                  <div className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2"><span>{t("Only these students (optional)")}</span><Combo multiple name="sid" label={t("Only these students (optional)")} placeholder={t("The whole class")} options={classes.flatMap((c) => c.students.map((x) => ({ value: x.id, label: x.name, group: c.name })))} /></div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Time (minutes)")}<input type="number" name="minutes" min={1} max={MAX_NAFS_MINUTES} defaultValue={MINISTRY_DEFAULT.minutes} className={`${INPUT} w-24`} /></label>
                  <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Opens (optional)")}<input type="date" name="openAt" className={INPUT} /></label>
                  <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Due (optional)")}<input type="date" name="dueAt" className={INPUT} /></label>
                  <button name="do" value="online" className="min-h-11 rounded-xl bg-teal-700 px-5 font-semibold text-white">💻 {t("Assign online")}</button>
                  <button name="do" value="print" className="min-h-11 rounded-xl bg-surface px-5 font-semibold text-ink ring-1 ring-line">🖨 {t("Get ready to print")}</button>
                </div>
              </div>
            )}
          </section>
        </form>
      )}
    </div>
  );
}

async function BookletReport({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const [list, classes] = await Promise.all([bookletList(repo, actor), nafsClasses(repo, actor)]);
  const given = list.filter((b) => b.tests.length);
  const code = given.find((b) => b.code === sp.book)?.code ?? given.find((b) => b.results > 0)?.code ?? null;
  const classId = classes.find((c) => c.id === sp.class)?.id ?? null;
  const cuts = cleanCuts(sp.hi, sp.lo);
  const rt = code ? await bookletReportTest(repo, actor, code) : null;
  return (
    <div className="grid gap-4">
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="booklets" /><input type="hidden" name="sub" value="report" />
        <div className="grid min-w-64 gap-1 text-sm font-semibold text-ink-2"><span>{t("Booklet")}</span><Combo name="book" label={t("Booklet")} defaultValue={code ?? ""} options={given.map((b) => ({ value: b.code, label: `${b.code} · ${b.title}`, hint: b.results ? t("{n} result(s)", { n: b.results }) : undefined }))} /></div>
        <div className="grid min-w-52 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" label={t("Class")} defaultValue={classId ?? ""} options={[{ value: "", label: t("All my Grade 6 classes") }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        <CutFields t={t} cuts={cuts} />
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <PrintButton label={t("Print")} />
      </form>
      {!code || !rt?.testId ? <p className={`${CARD} text-sm text-muted`}>{t("No booklet has been assigned yet. Tick booklets in the list and assign them.")} <Link href={centerHref("booklets")} className="font-semibold text-teal-ink underline">{t("Ministry booklets")}</Link></p> : <>
        <p className="text-sm text-ink-2">📘 <b dir="ltr">{code}</b> · {given.find((b) => b.code === code)?.title} · <Link href={centerHref("booklets", { book: code })} className="font-semibold text-teal-ink underline">{t("Open the booklet")}</Link></p>
        <Legend t={t} cuts={cuts} />
        <TestReport actor={actor} t={t} testId={rt.testId} classId={classId} cuts={cuts} />
      </>}
    </div>
  );
}
